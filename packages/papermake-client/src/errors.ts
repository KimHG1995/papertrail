/**
 * Papermake HTTP 호출 실패를 나타내는 타입드 에러.
 * status 를 실어 호출자(게이트웨이)가 4xx(클라이언트 입력 문제, 예: Typst 오류)와
 * 5xx(업스트림 장애)를 구분해 적절한 도메인 에러로 매핑할 수 있게 한다.
 */
export class PapermakeError extends Error {
  constructor(
    readonly status: number,
    readonly operation: 'publish' | 'render' | 'download',
    message: string,
  ) {
    super(message);
    this.name = 'PapermakeError';
  }

  /** 4xx = 호출자가 보낸 입력/참조 문제(재시도 무의미). */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}
