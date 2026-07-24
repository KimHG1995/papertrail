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

/** POST /v1/webhooks 요청 본문 (엔드포인트 등록). */
export const CreateWebhookRequest = z.object({
  url: z.url('올바른 URL 형식이어야 합니다.'),
  events: z.array(WebhookEventType).min(1, '구독할 이벤트를 하나 이상 지정해야 합니다.'),
});
export type CreateWebhookRequest = z.infer<typeof CreateWebhookRequest>;

/** Webhook 엔드포인트 뷰(시크릿 제외). GET /v1/webhooks 목록 원소. */
export const WebhookEndpointView = z.object({
  id: z.string(),
  url: z.url(),
  events: z.array(WebhookEventType),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type WebhookEndpointView = z.infer<typeof WebhookEndpointView>;

/** 엔드포인트 등록 응답. secret 은 이때 한 번만 반환한다(이후 조회 불가). */
export const WebhookEndpointCreated = WebhookEndpointView.extend({
  secret: z.string(),
});
export type WebhookEndpointCreated = z.infer<typeof WebhookEndpointCreated>;
