import { createHash } from 'node:crypto';
import type { HashRef } from '@papertrail/contracts';

/** 객체 키를 재귀적으로 정렬한다(배열 순서는 의미가 있으므로 보존). */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(record[key]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * 정규화 JSON 문자열을 만든다(키 정렬 + 공백 제거).
 * docs/04-data-model.md §4.4 의 inputHash 재현성 규칙을 코드로 고정한 것이다.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

/** 정규화 JSON 을 SHA-256 으로 해싱해 콘텐츠 주소(sha256:<64hex>)를 만든다. */
export function hashJson(value: unknown): HashRef {
  const digest = createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
  return `sha256:${digest}`;
}
