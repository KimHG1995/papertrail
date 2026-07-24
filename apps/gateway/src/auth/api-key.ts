import { createHash } from 'node:crypto';

/**
 * API Key 를 SHA-256 으로 해싱한다. 원문은 저장하지 않고 이 해시로만 조회/검증한다.
 * API Key 는 고엔트로피 난수라 password 와 달리 단순 해시로 충분하다.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Authorization: Bearer <key> 헤더에서 키를 추출한다(없으면 null). */
export function extractBearerKey(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }
  const [scheme, value] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) {
    return null;
  }
  return value.trim();
}
