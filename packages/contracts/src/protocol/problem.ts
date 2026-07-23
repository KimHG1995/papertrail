import type { ErrorCode } from './error-codes.js';

/**
 * 검증 에러의 필드별 사유. RFC 7807 §3.2 확장 멤버 errors[] 의 원소.
 * 참고: docs/03-api.md §3.1
 */
export interface FieldError {
  /** 오류가 난 필드 경로 (예: "recipient.name"). */
  name: string;
  /** 사람이 읽는 사유. */
  reason: string;
  /** 기계 판독용 세부 코드 (예: Zod issue code). */
  code?: string;
}

/**
 * RFC 7807 problem+json 본문. AllExceptionsFilter 가 모든 예외를 이 구조로 변환한다.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  timestamp: string;
  detail?: string;
  instance?: string;
  traceId: string;
  /** VALIDATION_FAILED / SCHEMA_VALIDATION_FAILED 에서 필드별 사유. */
  errors?: FieldError[];
}
