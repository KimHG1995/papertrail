import type { ErrorCode } from '@papertrail/contracts';

/** Nest HttpException 의 상태코드를 표준 에러 코드로 매핑한다. */
export function statusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'IDEMPOTENCY_CONFLICT';
    case 422:
      return 'SCHEMA_VALIDATION_FAILED';
    case 429:
      return 'RATE_LIMITED';
    case 502:
      return 'RENDER_UPSTREAM';
    default:
      return status >= 500 ? 'INTERNAL' : 'BAD_REQUEST';
  }
}
