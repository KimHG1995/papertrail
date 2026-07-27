import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type BatchProgress,
  type CreateBatchRequest,
  type CreateBatchResponse,
  RENDER_JOB,
  RENDER_QUEUE,
  type RenderJobData,
} from '@papertrail/contracts';
import { batch, type Database, document, newId } from '@papertrail/db';
import { batchSourceKey, type StorageClient } from '@papertrail/storage';
import { type JobsOptions, Queue } from 'bullmq';
import { parse } from 'csv-parse/sync';
import { DEFAULT_DOWNLOAD_TTL_SECONDS } from '../common/constants.js';
import { ProblemException } from '../common/exceptions/problem.exception.js';
import { hashJson } from '../common/hash/canonical-hash.js';
import { maskPreview } from '../common/pii-mask.js';
import { DRIZZLE } from '../database/database.constants.js';
import { UsageService } from '../usage/usage.service.js';
import { STORAGE } from '../storage/storage.constants.js';
import { TemplatesService } from '../templates/templates.service.js';

/** 대량 insert/enqueue 를 나누는 청크 크기(Postgres 파라미터 한도 회피). */
const CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** CSV 대량 문서 생성. 각 행을 문서로 확장해 렌더 큐에 적재한다. */
@Injectable()
export class BatchesService {
  private readonly logger = new Logger(BatchesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(STORAGE) private readonly storage: StorageClient,
    @InjectQueue(RENDER_QUEUE) private readonly renderQueue: Queue<RenderJobData>,
    private readonly templates: TemplatesService,
    private readonly usage: UsageService,
  ) {}

  async create(tenantId: string, req: CreateBatchRequest): Promise<CreateBatchResponse> {
    await this.usage.assertWithinQuota(tenantId);

    const rows = parse<Record<string, string>>(req.csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    if (rows.length === 0) {
      throw new ProblemException('BAD_REQUEST', 'CSV 에 데이터 행이 없습니다.');
    }

    // 템플릿은 한 번 해석하고, 행마다 입력만 검증한다(미등록 404, 미발행 409).
    const resolved = await this.templates.resolveTemplate(tenantId, req.template);
    this.templates.assertPublished(resolved);

    const batchId = newId('batch');
    const sourceCsvKey = batchSourceKey(tenantId, batchId);
    await this.storage.put(sourceCsvKey, new TextEncoder().encode(req.csv), 'text/csv');

    const docs: (typeof document.$inferInsert)[] = [];
    const jobs: { name: string; data: RenderJobData; opts: JobsOptions }[] = [];
    let failed = 0;

    for (const row of rows) {
      const id = newId('doc');
      const inputHash = hashJson({ recipient: null, document: row });
      const base = {
        id,
        tenantId,
        batchId,
        templateName: resolved.templateName,
        templateTag: resolved.templateTag,
        templateHash: resolved.manifestHash,
        inputHash,
        pdfStandard: req.pdfStandard,
        maskedPreview: maskPreview({ recipient: null, document: row }),
      };
      const errors = this.templates.validateInput(resolved, row);
      if (errors.length > 0) {
        docs.push({
          ...base,
          status: 'FAILED',
          errorCode: 'SCHEMA_VALIDATION_FAILED',
          completedAt: new Date(),
        });
        failed += 1;
      } else {
        docs.push({ ...base, status: 'QUEUED' });
        jobs.push({
          name: RENDER_JOB,
          data: {
            documentId: id,
            tenantId,
            batchId,
            template: req.template,
            templateHash: resolved.manifestHash,
            pdfStandard: req.pdfStandard,
            data: row,
            recipient: null,
          },
          opts: {
            jobId: id,
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: true,
            removeOnFail: false,
          },
        });
      }
    }

    const allInvalid = jobs.length === 0;
    await this.db.insert(batch).values({
      id: batchId,
      tenantId,
      templateRef: req.template,
      sourceCsvKey,
      total: rows.length,
      succeeded: 0,
      failed,
      status: allInvalid ? 'COMPLETED' : 'RUNNING',
      callbackUrl: req.callbackUrl ?? null,
      completedAt: allInvalid ? new Date() : null,
    });

    for (const part of chunk(docs, CHUNK_SIZE)) {
      await this.db.insert(document).values(part);
    }
    for (const part of chunk(jobs, CHUNK_SIZE)) {
      await this.renderQueue.addBulk(part);
    }

    this.logger.log(
      `배치 접수: id=${batchId}, total=${rows.length}, queued=${jobs.length}, failed=${failed}`,
    );
    return { batchId, total: rows.length, status: allInvalid ? 'COMPLETED' : 'RUNNING' };
  }

  async getProgress(tenantId: string, id: string): Promise<BatchProgress> {
    const row = await this.db.query.batch.findFirst({
      where: (b, { and, eq: e }) => and(e(b.id, id), e(b.tenantId, tenantId)),
    });
    if (!row) {
      throw new NotFoundException(`배치를 찾을 수 없습니다: ${id}`);
    }
    const pending = row.total - row.succeeded - row.failed;
    const progress = row.total > 0 ? (row.succeeded + row.failed) / row.total : 1;
    const reportUrl = row.reportKey
      ? (await this.storage.presignGet(row.reportKey, DEFAULT_DOWNLOAD_TTL_SECONDS)).url
      : null;
    return {
      batchId: row.id,
      status: row.status,
      total: row.total,
      succeeded: row.succeeded,
      failed: row.failed,
      pending,
      progress,
      reportUrl,
    };
  }
}
