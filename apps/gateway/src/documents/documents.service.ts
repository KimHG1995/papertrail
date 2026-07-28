import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type CreateDocumentRequest,
  type CreateDocumentResponse,
  type DocumentDetail,
  type DownloadInfo,
  RENDER_JOB,
  RENDER_QUEUE,
  type RenderJobData,
  type VerifyDocumentRequest,
  type VerifyResult,
} from '@papertrail/contracts';
import { type Database, type DocumentRow, document, newId } from '@papertrail/db';
import type { PapermakeClient } from '@papertrail/papermake-client';
import {
  context as otelContext,
  getTracer,
  propagation,
  trace as otelTrace,
} from '@papertrail/telemetry';
import { encryptedInputKey, type StorageClient } from '@papertrail/storage';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { DEFAULT_DOWNLOAD_TTL_SECONDS } from '../common/constants.js';
import { CryptoService } from '../common/crypto.service.js';
import { ProblemException } from '../common/exceptions/problem.exception.js';
import { hashJson } from '../common/hash/canonical-hash.js';
import { maskPreview } from '../common/pii-mask.js';
import { DRIZZLE } from '../database/database.constants.js';
import { PAPERMAKE_CLIENT } from '../papermake/papermake.constants.js';
import { STORAGE } from '../storage/storage.constants.js';
import { TemplatesService } from '../templates/templates.service.js';
import { UsageService } from '../usage/usage.service.js';

/** TemplatesService.resolveForRender 의 반환 타입(템플릿 해석 결과). */
type ResolvedTemplate = Awaited<ReturnType<TemplatesService['resolveForRender']>>;

/** PostgreSQL unique_violation(멱등성 index 충돌) 여부. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

/** 문서 생성/조회 비즈니스 로직. 접수 시 증적 레코드를 PostgreSQL 에 남긴다. */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(STORAGE) private readonly storage: StorageClient,
    @Inject(PAPERMAKE_CLIENT) private readonly papermake: PapermakeClient,
    @InjectQueue(RENDER_QUEUE) private readonly renderQueue: Queue<RenderJobData>,
    private readonly templates: TemplatesService,
    private readonly usage: UsageService,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * 문서 생성 요청을 접수하고 증적 레코드를 QUEUED 로 저장한다.
   * 템플릿을 레지스트리에서 해석하고 입력을 JSON Schema 로 검증한 뒤,
   * 멱등성 키가 있으면 같은 입력은 기존 접수를 반환하고 다른 입력은 409 로 처리한다.
   */
  async enqueue(tenantId: string, request: CreateDocumentRequest): Promise<CreateDocumentResponse> {
    // 월 렌더 쿼터 초과면 429 로 빠르게 거부한다.
    await this.usage.assertWithinQuota(tenantId);
    if (request.storeInput && !this.crypto.enabled) {
      throw new ProblemException(
        'BAD_REQUEST',
        '입력 저장(storeInput)이 요청됐지만 암호화 키가 설정되지 않았습니다.',
      );
    }
    // 미등록 템플릿은 404, 스키마 위반은 422 로 여기서 실패한다.
    const resolved = await this.templates.resolveForRender(
      tenantId,
      request.template,
      request.document,
    );
    const inputHash = hashJson({
      recipient: request.recipient ?? null,
      document: request.document,
    });

    if (request.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(tenantId, request.idempotencyKey);
      if (existing) {
        this.assertSamePayload(existing, resolved, inputHash);
        return this.toCreateResponse(existing);
      }
    }

    let row: DocumentRow;
    try {
      const inserted = await this.db
        .insert(document)
        .values({
          id: newId('doc'),
          tenantId,
          idempotencyKey: request.idempotencyKey ?? null,
          templateName: resolved.templateName,
          templateTag: resolved.templateTag,
          templateHash: resolved.manifestHash,
          inputHash,
          pdfStandard: request.pdfStandard,
          callbackUrl: request.callbackUrl ?? null,
          maskedPreview: maskPreview({
            recipient: request.recipient ?? null,
            document: request.document,
          }),
          status: 'QUEUED',
        })
        .returning();
      const created = inserted[0];
      if (!created) {
        throw new Error('문서 레코드 생성에 실패했습니다.');
      }
      row = created;
    } catch (error) {
      // 동시 요청 경쟁으로 partial unique index 가 충돌하면 기존 접수로 수렴한다.
      if (request.idempotencyKey && isUniqueViolation(error)) {
        const existing = await this.findByIdempotencyKey(tenantId, request.idempotencyKey);
        if (existing) {
          this.assertSamePayload(existing, resolved, inputHash);
          return this.toCreateResponse(existing);
        }
      }
      throw error;
    }

    // 옵트인 시 입력 원문을 암호화해 S3 에 저장한다(서버 단독 재현 검증 가능).
    if (request.storeInput) {
      const inputKey = encryptedInputKey(tenantId, row.id, new Date());
      const ciphertext = this.crypto.encrypt({
        recipient: request.recipient ?? null,
        document: request.document,
      });
      await this.storage.put(inputKey, ciphertext, 'application/octet-stream');
      await this.db
        .update(document)
        .set({ inputObjectKey: inputKey })
        .where(eq(document.id, row.id));
    }

    // 렌더 작업을 큐에 적재한다. jobId=documentId 로 두어 중복 적재를 막는다.
    // 접수 span 을 만들어 트레이스 컨텍스트를 job 에 주입하면 워커 렌더가 같은 트레이스로 이어진다.
    const span = getTracer('papertrail-gateway').startSpan('document.enqueue', {
      attributes: {
        'papertrail.tenant_id': tenantId,
        'papertrail.document_id': row.id,
        'papertrail.template': request.template,
      },
    });
    const traceCarrier: Record<string, string> = {};
    propagation.inject(otelTrace.setSpan(otelContext.active(), span), traceCarrier);
    await this.renderQueue.add(
      RENDER_JOB,
      {
        documentId: row.id,
        tenantId: row.tenantId,
        batchId: null,
        template: request.template,
        templateHash: resolved.manifestHash,
        pdfStandard: row.pdfStandard,
        data: request.document,
        recipient: request.recipient ?? null,
        trace: traceCarrier,
      },
      {
        jobId: row.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    span.end();

    this.logger.log(`문서 접수 및 큐 적재: id=${row.id}, template=${request.template}`);
    return this.toCreateResponse(row);
  }

  /** 문서 증적 상세를 조회한다(테넌트 격리). 결과가 있으면 downloadUrl 을 Signed URL 로 채운다. */
  async getDetail(tenantId: string, id: string): Promise<DocumentDetail> {
    const row = await this.findByIdForTenant(tenantId, id);
    return this.toDetail(row);
  }

  /** 다운로드용 Signed URL 정보를 발급한다(테넌트 격리, 결과 PDF 가 있어야 한다). */
  async getDownload(tenantId: string, id: string, ttlSeconds: number): Promise<DownloadInfo> {
    const row = await this.findByIdForTenant(tenantId, id);
    if (row.status !== 'SUCCEEDED' || !row.storageKey || !row.outputHash) {
      throw new NotFoundException(`다운로드할 결과 PDF 가 아직 없습니다: ${id}`);
    }
    const { url, expiresAt } = await this.storage.presignGet(row.storageKey, ttlSeconds);
    return { url, expiresAt: expiresAt.toISOString(), outputHash: row.outputHash };
  }

  /**
   * 재현성 검증. 검증할 입력을 확보(본문 제공 또는 저장된 암호화 입력 복호화)해 inputHash 를
   * 재계산하고, 접수 시 고정된 템플릿과 동일 입력으로 재렌더해 outputHash 를 저장값과 대조한다.
   * 동일 입력이면 동일 outputHash 가 나와야 한다(재현성).
   */
  async verify(tenantId: string, id: string, req: VerifyDocumentRequest): Promise<VerifyResult> {
    const row = await this.findByIdForTenant(tenantId, id);
    if (row.status !== 'SUCCEEDED' || !row.outputHash || !row.templateHash) {
      throw new ProblemException(
        'BAD_REQUEST',
        `완료(SUCCEEDED)된 문서만 검증할 수 있습니다: ${id} (현재 ${row.status})`,
      );
    }

    const input = await this.resolveVerifyInput(row, req);
    const actualInputHash = hashJson(input);
    // 접수 시 렌더에 쓰인 것과 동일한 참조로 재렌더한다(태그면 name:tag, 아니면 name@해시).
    const ref = row.templateTag
      ? `${row.templateName}:${row.templateTag}`
      : `${row.templateName}@${row.templateHash}`;
    const result = await this.papermake.render({
      template: ref,
      pdfStandard: row.pdfStandard,
      data: input.document,
      recipient: input.recipient,
    });

    const inputMatches = actualInputHash === row.inputHash;
    const outputMatches = result.outputHash === row.outputHash;
    return {
      documentId: row.id,
      reproducible: inputMatches && outputMatches,
      inputHash: { expected: row.inputHash, actual: actualInputHash, matches: inputMatches },
      outputHash: { expected: row.outputHash, actual: result.outputHash, matches: outputMatches },
    };
  }

  /** 검증에 쓸 입력을 확보한다: 본문 document 우선, 없으면 저장된 암호화 입력을 복호화한다. */
  private async resolveVerifyInput(
    row: DocumentRow,
    req: VerifyDocumentRequest,
  ): Promise<{ recipient: Record<string, unknown> | null; document: Record<string, unknown> }> {
    if (req.document) {
      return { recipient: req.recipient ?? null, document: req.document };
    }
    if (row.inputObjectKey) {
      const bytes = await this.storage.get(row.inputObjectKey);
      return this.crypto.decrypt(bytes) as {
        recipient: Record<string, unknown> | null;
        document: Record<string, unknown>;
      };
    }
    throw new ProblemException(
      'BAD_REQUEST',
      '검증할 입력이 없습니다(본문 document 또는 저장된 암호화 입력이 필요).',
    );
  }

  /** 테넌트 소유의 문서만 조회한다. 다른 테넌트의 문서는 존재 노출을 피해 404 로 처리한다. */
  private async findByIdForTenant(tenantId: string, id: string): Promise<DocumentRow> {
    const row = await this.db.query.document.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.id, id), eq(fields.tenantId, tenantId)),
    });
    if (!row) {
      throw new NotFoundException(`문서를 찾을 수 없습니다: ${id}`);
    }
    return row;
  }

  private async findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<DocumentRow | undefined> {
    return this.db.query.document.findFirst({
      where: (fields, { and, eq }) =>
        and(eq(fields.tenantId, tenantId), eq(fields.idempotencyKey, idempotencyKey)),
    });
  }

  /** 멱등성 키가 같아도 내용(template/input)이 다르면 충돌로 처리한다. */
  private assertSamePayload(
    existing: DocumentRow,
    resolved: ResolvedTemplate,
    inputHash: string,
  ): void {
    const same =
      existing.inputHash === inputHash &&
      existing.templateName === resolved.templateName &&
      existing.templateTag === resolved.templateTag;
    if (!same) {
      throw new ProblemException(
        'IDEMPOTENCY_CONFLICT',
        '동일한 멱등성 키로 다른 내용의 요청이 이미 접수되었습니다.',
      );
    }
  }

  private toCreateResponse(row: DocumentRow): CreateDocumentResponse {
    return {
      documentId: row.id,
      status: row.status,
      templateHash: row.templateHash,
      statusUrl: `/v1/documents/${row.id}`,
    };
  }

  private async toDetail(row: DocumentRow): Promise<DocumentDetail> {
    const downloadUrl =
      row.status === 'SUCCEEDED' && row.storageKey
        ? (await this.storage.presignGet(row.storageKey, DEFAULT_DOWNLOAD_TTL_SECONDS)).url
        : null;
    return {
      documentId: row.id,
      tenantId: row.tenantId,
      status: row.status,
      templateName: row.templateName,
      templateTag: row.templateTag,
      templateHash: row.templateHash,
      inputHash: row.inputHash,
      outputHash: row.outputHash,
      pdfStandard: row.pdfStandard,
      requestedAt: row.requestedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      durationMs: row.durationMs,
      downloadUrl,
      maskedPreview: row.maskedPreview ?? null,
    };
  }
}
