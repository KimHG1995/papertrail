/**
 * Express Request 에 요청별 traceId 를 심는다.
 * requestContext 미들웨어가 채우고, 인터셉터/필터가 읽는다.
 */
declare global {
  namespace Express {
    interface Request {
      traceId?: string;
    }
  }
}

export {};
