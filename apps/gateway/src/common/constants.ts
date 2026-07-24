/** 요청/응답 상관관계 추적 헤더. traceId 를 이 헤더로 주고받는다. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** 다운로드 Signed URL TTL(초): 기본/최소/최대. ttl 쿼리 파라미터를 이 범위로 제한한다. */
export const DEFAULT_DOWNLOAD_TTL_SECONDS = 300;
export const MIN_DOWNLOAD_TTL_SECONDS = 30;
export const MAX_DOWNLOAD_TTL_SECONDS = 3600;
