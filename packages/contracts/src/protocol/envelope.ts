/**
 * 표준 성공 응답 봉투. ResponseTransformInterceptor 가 모든 정상 응답을 이 구조로 감싼다.
 * 참고: docs/03-api.md §3.1
 */

/** 목록 응답의 페이지 정보. meta.pagination 에 담긴다. */
export interface Pagination {
  page: number;
  size: number;
  total: number;
}

/** 모든 성공 응답 공통 메타. */
export interface ResponseMeta {
  timestamp: string;
  path: string;
  traceId: string;
  pagination?: Pagination;
}

/** 정형화된 성공 응답 { success, data, meta }. */
export interface SuccessEnvelope<TData> {
  success: true;
  data: TData;
  meta: ResponseMeta;
}
