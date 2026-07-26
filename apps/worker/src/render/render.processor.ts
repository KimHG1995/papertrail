import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { RENDER_DLQ, RENDER_JOB, RENDER_QUEUE, type RenderJobData } from '@papertrail/contracts';
import type { AnalyticsClient } from '@papertrail/analytics';
import { type Database, type DocumentRow, document } from '@papertrail/db';
import type { PapermakeClient } from '@papertrail/papermake-client';
import { documentPdfKey, type StorageClient } from '@papertrail/storage';
import { DelayedError, Job, Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { ANALYTICS } from '../analytics/analytics.constants.js';
import { BatchService } from '../batch/batch.service.js';
import { TenantConcurrencyService } from '../concurrency/tenant-concurrency.service.js';
import { DRIZZLE } from '../database/database.constants.js';
import { STORAGE } from '../storage/storage.constants.js';
import { WebhookDispatcher } from '../webhook/webhook-dispatcher.service.js';
import { PAPERMAKE_CLIENT } from './papermake.constants.js';

/** 슬롯 리스 유효기간(초과 시 자동 회수). 최장 렌더 시간보다 넉넉히 둔다. */
const LEASE_MS = 60_000;
/** 테넌트 한도 초과 시 재확인까지 지연(backpressure). */
const DEFER_MS = 1_000;

/**
 * 렌더 큐 컨슈머. QUEUED → RENDERING → SUCCEEDED/FAILED 상태 전이를 담당한다.
 * 전역 concurrency 상한 위에, 테넌트별 동시성 한도를 분산 세마포어로 강제한다.
 * 한도 초과 작업은 실패가 아니라 지연(재시도)으로 흘려보낸다. 실패는 지수 백오프
 * 재시도 후 소진되면 DLQ 로 옮기고 문서를 FAILED 로 기록한다.
 */
@Processor(RENDER_QUEUE, { concurrency: 10 })
export class RenderProcessor extends WorkerHost {
  private readonly logger = new Logger(RenderProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PAPERMAKE_CLIENT) private readonly papermake: PapermakeClient,
    @Inject(STORAGE) private readonly storage: StorageClient,
    @InjectQueue(RENDER_DLQ) private readonly dlq: Queue<RenderJobData>,
    private readonly concurrency: TenantConcurrencyService,
    private readonly webhooks: WebhookDispatcher,
    private readonly batch: BatchService,
    @Inject(ANALYTICS) private readonly analytics: AnalyticsClient,
  ) {
    super();
  }

  async process(job: Job<RenderJobData>, token?: string): Promise<void> {
    const data = job.data;
    const member = job.id ?? data.documentId;

    // 테넌트 동시성 슬롯 점유 시도. 한도 초과면 잠시 뒤 재시도(실패로 세지 않음).
    const limit = await this.getTenantLimit(data.tenantId);
    if (!(await this.concurrency.tryAcquire(data.tenantId, member, limit, LEASE_MS))) {
      await job.moveToDelayed(Date.now() + DEFER_MS, token);
      throw new DelayedError();
    }

    try {
      const attempt = job.attemptsMade + 1;
      this.logger.log(`렌더 시작: documentId=${data.documentId}, attempt=${attempt}`);

      await this.db
        .update(document)
        .set({ status: 'RENDERING', attemptCount: attempt })
        .where(eq(document.id, data.documentId));

      const result = await this.papermake.render({
        template: data.template,
        pdfStandard: data.pdfStandard,
        data: data.data,
        recipient: data.recipient,
      });

      // 결과 PDF 를 S3/MinIO 에 저장하고 storageKey 를 증적에 남긴다(다운로드는 게이트웨이가 Signed URL 발급).
      const storageKey = documentPdfKey(data.tenantId, data.documentId, new Date());
      await this.storage.put(storageKey, result.pdf, 'application/pdf');

      const updated = await this.db
        .update(document)
        .set({
          // templateHash 는 접수 시 레지스트리에서 해석한 값을 그대로 유지한다(렌더 결과보다 권위 있음).
          status: 'SUCCEEDED',
          templateHash: data.templateHash,
          outputHash: result.outputHash,
          durationMs: result.durationMs,
          storageKey,
          completedAt: new Date(),
          errorCode: null,
        })
        .where(eq(document.id, data.documentId))
        .returning();

      this.logger.log(
        `렌더 성공: documentId=${data.documentId}, outputHash=${result.outputHash}, key=${storageKey}`,
      );

      // 완료 후처리(배치 집계 + 통지 + 이벤트 적재). 실패해도 렌더 성공을 되돌리지 않도록 예외를 삼킨다.
      try {
        if (data.batchId) {
          await this.batch.onDocumentSettled(data.batchId, 'succeeded');
        }
        await this.recordEvent(updated[0], data, 'SUCCEEDED', '', result.durationMs);
        await this.webhooks.dispatch({
          tenantId: data.tenantId,
          documentId: data.documentId,
          eventType: 'document.succeeded',
          outputHash: result.outputHash,
          storageKey,
        });
      } catch (error) {
        this.logger.error(`완료 후처리 실패(무시): documentId=${data.documentId}`, error);
      }
    } finally {
      await this.concurrency.release(data.tenantId, member);
    }
  }

  /** 테넌트의 동시 렌더 한도(없으면 보수적으로 1). */
  private async getTenantLimit(tenantId: string): Promise<number> {
    const row = await this.db.query.tenant.findFirst({
      where: (t, { eq: e }) => e(t.id, tenantId),
    });
    return row?.concurrencyLimit ?? 1;
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<RenderJobData> | undefined, error: Error): Promise<void> {
    if (!job) {
      this.logger.error(`작업 정보 없이 실패 이벤트 수신: ${error.message}`);
      return;
    }

    const attempts = job.opts.attempts ?? 1;
    this.logger.warn(
      `렌더 실패: documentId=${job.data.documentId}, attempt=${job.attemptsMade}/${attempts}, error=${error.message}`,
    );

    // 남은 재시도가 있으면 BullMQ 가 다시 시도한다.
    if (job.attemptsMade < attempts) {
      return;
    }

    // 재시도 소진 → 문서 FAILED + DLQ 로 이동.
    const updated = await this.db
      .update(document)
      .set({ status: 'FAILED', errorCode: 'RENDER_UPSTREAM', completedAt: new Date() })
      .where(eq(document.id, job.data.documentId))
      .returning();
    await this.dlq.add(RENDER_JOB, job.data, { jobId: job.data.documentId });
    this.logger.error(`재시도 소진 → DLQ 이동: documentId=${job.data.documentId}`);

    try {
      if (job.data.batchId) {
        await this.batch.onDocumentSettled(job.data.batchId, 'failed');
      }
      await this.recordEvent(updated[0], job.data, 'FAILED', 'RENDER_UPSTREAM', 0);
      await this.webhooks.dispatch({
        tenantId: job.data.tenantId,
        documentId: job.data.documentId,
        eventType: 'document.failed',
      });
    } catch (error) {
      this.logger.error(`완료 후처리 실패(무시): documentId=${job.data.documentId}`, error);
    }
  }

  /** 렌더 이벤트를 ClickHouse 에 적재한다(문서 행 기준, 최선 노력). */
  private async recordEvent(
    row: DocumentRow | undefined,
    data: RenderJobData,
    status: 'SUCCEEDED' | 'FAILED',
    errorCode: string,
    durationMs: number,
  ): Promise<void> {
    await this.analytics.recordRenderEvent({
      eventTime: new Date(),
      tenantId: data.tenantId,
      documentId: data.documentId,
      batchId: data.batchId ?? '',
      templateName: row?.templateName ?? '',
      templateHash: data.templateHash,
      inputHash: row?.inputHash ?? '',
      outputHash: row?.outputHash ?? '',
      pdfStandard: data.pdfStandard,
      status,
      errorCode,
      attempt: row?.attemptCount ?? 0,
      durationMs,
    });
  }
}
