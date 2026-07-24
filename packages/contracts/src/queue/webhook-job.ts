import { z } from 'zod';
import { WebhookEvent } from '../domain/webhook.js';

/** Webhook 전송 작업 큐 이름(워커 dispatcher → webhook 컨슈머). */
export const WEBHOOK_QUEUE = 'webhook';

/** Webhook 전송 JobName. */
export const WEBHOOK_JOB = 'deliver-webhook';

/**
 * Webhook 전송 작업 페이로드. 엔드포인트당 하나의 delivery 를 독립 재시도한다.
 * 시크릿은 페이로드에 넣지 않고 컨슈머가 endpointId 로 DB 에서 로드한다.
 */
export const WebhookDeliveryJob = z.object({
  deliveryId: z.string(),
  endpointId: z.string(),
  event: WebhookEvent,
});
export type WebhookDeliveryJob = z.infer<typeof WebhookDeliveryJob>;
