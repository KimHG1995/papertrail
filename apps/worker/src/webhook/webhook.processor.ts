import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { WEBHOOK_QUEUE, type WebhookDeliveryJob } from '@papertrail/contracts';
import { type Database, webhookDelivery } from '@papertrail/db';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants.js';
import { signWebhook } from './signing.js';

/** Webhook 전송 HTTP 타임아웃. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Webhook 전송 컨슈머. 엔드포인트 시크릿으로 HMAC 서명해 POST 하고, delivery 상태를
 * 갱신한다. 비정상 응답/네트워크 오류는 throw 해 지수 백오프로 재시도하며, 재시도 소진 시
 * delivery 를 FAILED 로 기록한다.
 */
@Processor(WEBHOOK_QUEUE, { concurrency: 10 })
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async process(job: Job<WebhookDeliveryJob>): Promise<void> {
    const { deliveryId, endpointId, event } = job.data;
    const attempt = job.attemptsMade + 1;

    const endpoint = await this.db.query.webhookEndpoint.findFirst({
      where: (w, { eq: e }) => e(w.id, endpointId),
    });
    if (!endpoint?.active) {
      await this.db
        .update(webhookDelivery)
        .set({ status: 'FAILED', attemptCount: attempt })
        .where(eq(webhookDelivery.id, deliveryId));
      this.logger.warn(`엔드포인트 없음/비활성, 전송 취소: deliveryId=${deliveryId}`);
      return;
    }

    const body = JSON.stringify(event);
    const signature = signWebhook(endpoint.secret, body);
    let responseCode: number | null = null;
    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': signature,
          'x-webhook-event': event.event,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      responseCode = res.status;
      if (!res.ok) {
        throw new Error(`비정상 응답 코드: ${res.status}`);
      }
    } catch (error) {
      await this.db
        .update(webhookDelivery)
        .set({ attemptCount: attempt, lastResponseCode: responseCode })
        .where(eq(webhookDelivery.id, deliveryId));
      throw error instanceof Error ? error : new Error('webhook 전송 실패');
    }

    await this.db
      .update(webhookDelivery)
      .set({ status: 'DELIVERED', attemptCount: attempt, lastResponseCode: responseCode })
      .where(eq(webhookDelivery.id, deliveryId));
    this.logger.log(`webhook 전송 성공: deliveryId=${deliveryId}, code=${responseCode}`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<WebhookDeliveryJob> | undefined): Promise<void> {
    if (!job) {
      return;
    }
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      return;
    }
    await this.db
      .update(webhookDelivery)
      .set({ status: 'FAILED' })
      .where(eq(webhookDelivery.id, job.data.deliveryId));
    this.logger.error(`webhook 재시도 소진 → FAILED: deliveryId=${job.data.deliveryId}`);
  }
}
