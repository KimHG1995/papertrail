/**
 * 기계 판독용 에러 코드와 RFC 7807 type slug 매핑.
 * 참고: docs/03-api.md §3.3
 */

export const ERROR_CODES = {
  BAD_REQUEST: { status: 400, slug: 'bad-request', title: 'Bad Request' },
  VALIDATION_FAILED: { status: 400, slug: 'bad-request', title: 'Bad Request' },
  UNAUTHORIZED: { status: 401, slug: 'unauthorized', title: 'Unauthorized' },
  FORBIDDEN: { status: 403, slug: 'forbidden', title: 'Forbidden' },
  NOT_FOUND: { status: 404, slug: 'not-found', title: 'Not Found' },
  IDEMPOTENCY_CONFLICT: { status: 409, slug: 'idempotency-conflict', title: 'Conflict' },
  SCHEMA_VALIDATION_FAILED: {
    status: 422,
    slug: 'unprocessable-entity',
    title: 'Unprocessable Entity',
  },
  RATE_LIMITED: { status: 429, slug: 'rate-limited', title: 'Too Many Requests' },
  INTERNAL: { status: 500, slug: 'internal', title: 'Internal Server Error' },
  RENDER_UPSTREAM: { status: 502, slug: 'render-upstream', title: 'Bad Gateway' },
} as const;

/** 기계 판독용 에러 코드. */
export type ErrorCode = keyof typeof ERROR_CODES;

/** 기본 problem type URI 베이스. 환경별로 재정의 가능. */
export const DEFAULT_PROBLEM_BASE_URI = 'https://papertrail.example/problems';

/** 에러 코드로부터 RFC 7807 type URI 를 만든다. */
export function problemTypeUri(
  code: ErrorCode,
  baseUri: string = DEFAULT_PROBLEM_BASE_URI,
): string {
  return `${baseUri}/${ERROR_CODES[code].slug}`;
}
