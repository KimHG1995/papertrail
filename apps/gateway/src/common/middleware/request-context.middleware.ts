import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER } from '../constants.js';

/**
 * 요청별 traceId 를 확정하고 응답 헤더로 반환한다.
 * 클라이언트가 x-request-id 를 보내면 그 값을 승계하고, 없으면 생성한다.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const traceId = incoming && incoming.length > 0 ? incoming : randomUUID();
  req.traceId = traceId;
  res.setHeader(REQUEST_ID_HEADER, traceId);
  next();
}
