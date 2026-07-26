import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { ProblemException } from '../common/exceptions/problem.exception.js';
import { RateLimiterService } from '../common/rate-limiter.service.js';
import { IS_PUBLIC_KEY } from './auth.constants.js';

/**
 * 테넌트별 레이트 리밋(전역, AuthGuard 다음 실행). 고정 윈도우 카운터로 한도를 넘으면
 * 429 RATE_LIMITED + Retry-After 를 반환한다. @Public 라우트와 미인증 요청은 통과시킨다.
 * 매 요청에 X-RateLimit-Limit / X-RateLimit-Remaining 헤더를 실어 준다.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiterService,
    config: ConfigService,
  ) {
    this.limit = Number(config.get<string>('RATE_LIMIT_PER_MINUTE', '120'));
    this.windowMs = Number(config.get<string>('RATE_LIMIT_WINDOW_SECONDS', '60')) * 1000;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const tenantId = req.tenantId;
    if (!tenantId) {
      return true; // 인증되지 않은 요청은 AuthGuard 가 이미 처리한다.
    }

    const res = http.getResponse<Response>();
    const { count, ttlMs } = await this.limiter.hit(`ratelimit:${tenantId}`, this.windowMs);
    res.setHeader('X-RateLimit-Limit', String(this.limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, this.limit - count)));

    if (count > this.limit) {
      const retryAfter = Math.max(1, Math.ceil(ttlMs / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      throw new ProblemException(
        'RATE_LIMITED',
        `요청 한도를 초과했습니다. ${retryAfter}초 후 재시도하세요.`,
      );
    }
    return true;
  }
}
