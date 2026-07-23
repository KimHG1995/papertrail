import type { ErrorCode, FieldError } from '@papertrail/contracts';

/** RFC 7807 로 직렬화될 애플리케이션 예외. AllExceptionsFilter 가 처리한다. */
export class ProblemException extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
    readonly errors?: FieldError[],
  ) {
    super(detail ?? code);
    this.name = new.target.name;
  }
}

/** 요청 스키마(Zod) 검증 실패. 400 VALIDATION_FAILED + errors[]. */
export class ValidationException extends ProblemException {
  constructor(errors: FieldError[], detail = '요청 데이터가 유효성 검증을 통과하지 못했습니다.') {
    super('VALIDATION_FAILED', detail, errors);
  }
}
