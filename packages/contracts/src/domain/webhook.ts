import { z } from 'zod';
import { HashRef } from './common.js';

/** PaperTrail 이 고객 시스템으로 보내는 이벤트 종류. docs/03-api.md §3.9 */
export const WebhookEventType = z.enum([
  'document.succeeded',
  'document.failed',
  'batch.completed',
]);
export type WebhookEventType = z.infer<typeof WebhookEventType>;

/**
 * Webhook 이벤트 페이로드. {success,data,meta} 정형화를 적용하지 않는 별도 계약.
 * 서명은 X-Webhook-Signature 헤더(HMAC). docs/05-security.md 참조.
 */
export const WebhookEvent = z.object({
  event: WebhookEventType,
  documentId: z.string().optional(),
  batchId: z.string().optional(),
  tenantId: z.string(),
  outputHash: HashRef.optional(),
  downloadUrl: z.url().optional(),
  occurredAt: z.iso.datetime(),
});
export type WebhookEvent = z.infer<typeof WebhookEvent>;
