import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { MetricsService } from './metrics.service.js';

/**
 * 모든 요청의 처리 시간을 기록한다. 라우팅/가드 이전(app.use)에서 등록하고 응답 'finish'
 * 에서 관측하므로, 가드가 거부한 요청(401/403/429)까지 RED 메트릭에 포함된다.
 */
export function createMetricsMiddleware(metrics: MetricsService): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const stop = metrics.httpDuration.startTimer();
    res.on('finish', () => {
      const route = (req.route as { path?: string } | undefined)?.path ?? 'unmatched';
      stop({ method: req.method, route, status_code: res.statusCode });
    });
    next();
  };
}
