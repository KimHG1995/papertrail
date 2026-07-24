import { randomUUID } from 'node:crypto';

/**
 * 접두사 기반 리소스 ID 를 생성한다(doc_..., batch_..., tenant_... 등).
 * UUIDv4 에서 하이픈을 제거해 URL/로그에서 다루기 쉬운 형태로 만든다.
 */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}
