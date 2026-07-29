import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * 인증된 요청의 테넌트 ID 를 반환한다. AuthGuard 가 보장하므로 보호된 라우트에서는
 * 항상 값이 존재한다(공개 라우트에서는 사용하지 않는다).
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.tenantId ?? '';
  },
);
