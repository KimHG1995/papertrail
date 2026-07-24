import { createHmac } from 'node:crypto';

/**
 * Webhook 본문에 대한 HMAC-SHA256 서명. 수신자는 같은 시크릿으로 재계산해 검증한다.
 * 형식: `sha256=<hex>` (X-Webhook-Signature 헤더).
 */
export function signWebhook(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}
