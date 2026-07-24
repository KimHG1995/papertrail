/**
 * Express Request 확장.
 * - traceId: requestContext 미들웨어가 채우고 인터셉터/필터가 읽는다.
 * - tenantId/apiKeyId/scopes: AuthGuard 가 API Key 검증 후 채운다(보호된 라우트).
 */
declare global {
  namespace Express {
    interface Request {
      traceId?: string;
      tenantId?: string;
      apiKeyId?: string;
      scopes?: string[];
    }
  }
}

export {};
