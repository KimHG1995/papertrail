import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import type { Request } from 'express';
import { SKIP_RESPONSE_TRANSFORM } from '../decorators/skip-response-transform.decorator.js';
import { successEnvelope } from '../envelope.js';

/**
 * 정상 응답을 { success, data, meta } 로 정형화한다.
 * @SkipResponseTransform() 이 붙은 핸들러/컨트롤러는 원본을 그대로 통과시킨다.
 */
@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_TRANSFORM, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const path = req.originalUrl.split('?')[0] ?? req.originalUrl;
    const traceId = req.traceId ?? '';

    return next.handle().pipe(map((data) => successEnvelope(data, path, traceId)));
  }
}
