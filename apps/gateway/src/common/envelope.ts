import type { SuccessEnvelope } from '@papertrail/contracts';

/** 표준 성공 응답 {success, data, meta} 를 만든다. 인터셉터와 수동 응답이 공유한다. */
export function successEnvelope<T>(data: T, path: string, traceId: string): SuccessEnvelope<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      path,
      traceId,
    },
  };
}
