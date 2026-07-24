import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  WEBHOOK_JOB,
  WEBHOOK_QUEUE,
  type WebhookDeliveryJob,
  type WebhookEvent,
  type WebhookEventType,
} from '@papertrail/contracts';
import { type Database, newId, webhookDelivery } from '@papertrail/db';
import type { StorageClient } from '@papertrail/storage';
import { Queue } from 'bullmq';
import { and, arrayContains, eq } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants.js';
import { STORAGE } from '../storage/storage.constants.js';

interface DispatchParams {
  tenantId: string;
  documentId: string;
  eventType: WebhookEventType;
  outputHash?: string | null;
  storageKey?: string | null;
}

/** Webhook 다운로드 URL 유효기간(수신자가 나중에 처리할 수 있게 넉넉히). */
const DOWNLOAD_TTL_SECONDS = 3600;

/**
 * 렌더 완료 시 구독 중인 엔드포인트로 이벤트를 팬아웃한다.
 * 엔드포인트마다 delivery 레코드를 만들고 개별 전송 작업을 큐에 넣어 독립적으로 재시도한다.
 */
@Injectable()
export class WebhookDispatcher {
  private readonly logger = new Logger(WebhookDispatcher.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(STORAGE) private readonly storage: StorageClient,
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue<WebhookDeliveryJob>,
  ) {}

  async dispatch(params: DispatchParams): Promise<void> {
    const endpoints = await this.db.query.webhookEndpoint.findMany({
      where: (w) =>
        and(
          eq(w.tenantId, params.tenantId),
          eq(w.active, true),
          arrayContains(w.events, [params.eventType]),
        ),
    });
    if (endpoints.length === 0) {
      return;
    }

    const event = await this.buildEvent(params);
    for (const endpoint of endpoints) {
      const deliveryId = newId('whd');
      await this.db.insert(webhookDelivery).values({
        id: deliveryId,
        endpointId: endpoint.id,
        documentId: params.documentId,
        event: params.eventType,
        status: 'PENDING',
        attemptCount: 0,
      });
      await this.queue.add(
        WEBHOOK_JOB,
        { deliveryId, endpointId: endpoint.id, event },
        {
          jobId: deliveryId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    }
    this.logger.log(
      `webhook 디스패치: event=${params.eventType}, documentId=${params.documentId}, endpoints=${endpoints.length}`,
    );
  }

  private async buildEvent(params: DispatchParams): Promise<WebhookEvent> {
    const event: WebhookEvent = {
      event: params.eventType,
      documentId: params.documentId,
      tenantId: params.tenantId,
      occurredAt: new Date().toISOString(),
    };
    if (params.outputHash) {
      event.outputHash = params.outputHash;
    }
    if (params.storageKey) {
      const { url } = await this.storage.presignGet(params.storageKey, DOWNLOAD_TTL_SECONDS);
      event.downloadUrl = url;
    }
    return event;
  }
}
