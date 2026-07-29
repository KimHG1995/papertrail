import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';
import { AuditService } from './audit.service.js';

/** 감사 대상 메서드(변경 요청만). 읽기(GET/HEAD)는 기록하지 않는다. */
const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 리소스 ID 를 경로 파라미터 → 응답 본문 순으로 추출한다. */
function extractResourceId(req: Request, data: unknown): string | null {
  const params = req.params;
  if (typeof params.id === 'string') {
    return params.id;
  }
  if (typeof params.name === 'string') {
    return params.name;
  }
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const key of ['documentId', 'batchId', 'id']) {
      const value = record[key];
      if (typeof value === 'string') {
        return value;
      }
    }
  }
  return null;
}

/**
 * 인증된 변경 요청을 성공 시 감사 로그에 자동 기록한다(전역, 내부 인터셉터).
 * 기록 실패가 요청을 깨지 않도록 fire-and-forget 으로 처리한다.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!AUDITED_METHODS.has(req.method) || !req.tenantId) {
      return next.handle();
    }

    const tenantId = req.tenantId;
    const apiKeyId = req.apiKeyId ?? null;
    const traceId = req.traceId ?? null;
    const routePath = (req.route as { path?: string } | undefined)?.path;
    const action = `${req.method} ${routePath ?? req.originalUrl.split('?')[0] ?? req.originalUrl}`;

    return next.handle().pipe(
      tap((data) => {
        const res = context.switchToHttp().getResponse<Response>();
        void this.audit
          .record({
            tenantId,
            apiKeyId,
            action,
            resourceId: extractResourceId(req, data),
            statusCode: res.statusCode,
            traceId,
          })
          .catch(() => undefined);
      }),
    );
  }
}
