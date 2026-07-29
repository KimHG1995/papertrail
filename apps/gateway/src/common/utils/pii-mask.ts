import type { JsonObject } from '@papertrail/contracts';

/** PII 로 볼 만한 필드 이름(키) 패턴. 한국어/영어 공통 표현을 포함한다. */
const PII_KEY =
  /(name|email|mail|phone|mobile|tel|contact|ssn|rrn|address|birth|이름|성명|이메일|전화|휴대|연락처|주소|주민|생년)/i;

/** 값이 이메일처럼 보이는가. */
function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/** 값이 전화번호처럼 보이는가(국번/구분자 포함 7자 이상). */
function looksLikePhone(value: string): boolean {
  return /^[+\d][\d\s().-]{6,}$/.test(value);
}

/** 첫 글자만 남기고 나머지를 * 로 가린다(최대 8개). */
function maskString(value: string): string {
  if (value.length <= 1) {
    return '*';
  }
  return value[0] + '*'.repeat(Math.min(value.length - 1, 8));
}

/** 최대 보존 문자열 길이(초과 시 잘라서 미리보기 부담을 줄인다). */
const MAX_STRING = 64;
/** 배열 미리보기 최대 원소 수. */
const MAX_ARRAY = 20;

function maskNode(value: unknown, key?: string): unknown {
  const piiKey = key !== undefined && PII_KEY.test(key);
  if (typeof value === 'string') {
    if (piiKey || looksLikeEmail(value) || looksLikePhone(value)) {
      return maskString(value);
    }
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return piiKey ? '***' : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((item) => maskNode(item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = maskNode(v, k);
    }
    return out;
  }
  return value;
}

/**
 * 렌더 입력을 마스킹한 미리보기를 만든다. 원문 대신 이 값만 저장/노출해
 * 운영자가 PII 원문 없이 문서 내용을 가늠할 수 있게 한다.
 */
export function maskPreview(input: {
  recipient?: JsonObject | null;
  document: JsonObject;
}): JsonObject {
  return {
    recipient: input.recipient ? maskNode(input.recipient) : null,
    document: maskNode(input.document),
  };
}
