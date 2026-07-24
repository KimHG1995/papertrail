import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { RENDER_DLQ, RENDER_JOB, RENDER_QUEUE, type RenderJobData } from '@papertrail/contracts';
import { type Database, document } from '@papertrail/db';
import type { PapermakeClient } from '@papertrail/papermake-client';
import { documentPdfKey, type StorageClient } from '@papertrail/storage';
import { Job, Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants.js';
import { STORAGE } from '../storage/storage.constants.js';
import { PAPERMAKE_CLIENT } from './papermake.constants.js';

/**
 * 렌더 큐 컨슈머. QUEUED → RENDERING → SUCCEEDED/FAILED 상태 전이를 담당한다.
 * 실패 시 BullMQ 가 지수 백오프로 재시도하고, 재시도가 소진되면 DLQ 로 옮기고
 * 문서를 FAILED 로 기록한다. concurrency 는 전역 제한(테넌트별 제한은 후속 증분).
 */
@Processor(RENDER_QUEUE, { concurrency: 5 })
export class RenderProcessor extends WorkerHost {
  private readonly logger = new Logger(RenderProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PAPERMAKE_CLIENT) private readonly papermake: PapermakeClient,
    @Inject(STORAGE) private readonly storage: StorageClient,
    @InjectQueue(RENDER_DLQ) private readonly dlq: Queue<RenderJobData>,
  ) {
    super();
  }

  async process(job: Job<RenderJobData>): Promise<void> {
    const data = job.data;
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

    await this.db
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
      .where(eq(document.id, data.documentId));

    this.logger.log(
      `렌더 성공: documentId=${data.documentId}, outputHash=${result.outputHash}, key=${storageKey}`,
    );
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
    await this.db
      .update(document)
      .set({ status: 'FAILED', errorCode: 'RENDER_UPSTREAM', completedAt: new Date() })
      .where(eq(document.id, job.data.documentId));
    await this.dlq.add(RENDER_JOB, job.data, { jobId: job.data.documentId });
    this.logger.error(`재시도 소진 → DLQ 이동: documentId=${job.data.documentId}`);
  }
}
