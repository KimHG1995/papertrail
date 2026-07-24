import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { apiKey, type Database, tenant } from '@papertrail/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { Request } from 'express';
import { ProblemException } from '../common/exceptions/problem.exception.js';
import { DRIZZLE } from '../database/database.constants.js';
import { extractBearerKey, hashApiKey } from './api-key.js';
import { IS_PUBLIC_KEY, REQUIRED_SCOPES_KEY, SCOPE_WILDCARD } from './auth.constants.js';

/**
 * API Key 인증 + 테넌트 해석 가드(전역).
 * Authorization: Bearer <key> 를 검증해 테넌트를 요청에 주입하고,
 * @RequiredScopes() 스코프를 확인한다. @Public() 라우트는 생략한다.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const key = extractBearerKey(req.headers.authorization);
    if (!key) {
      throw new ProblemException('UNAUTHORIZED', 'API Key 가 필요합니다(Authorization: Bearer).');
    }

    // api_key 와 tenant 를 조인해 한 번에 조회(revoke 되지 않은 키만).
    const rows = await this.db
      .select({
        apiKeyId: apiKey.id,
        scopes: apiKey.scopes,
        tenantId: tenant.id,
        tenantStatus: tenant.status,
      })
      .from(apiKey)
      .innerJoin(tenant, eq(apiKey.tenantId, tenant.id))
      .where(and(eq(apiKey.keyHash, hashApiKey(key)), isNull(apiKey.revokedAt)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new ProblemException('UNAUTHORIZED', '유효하지 않은 API Key 입니다.');
    }
    if (row.tenantStatus !== 'ACTIVE') {
      throw new ProblemException('FORBIDDEN', '비활성 테넌트입니다.');
    }

    this.assertScopes(context, row.scopes);

    req.tenantId = row.tenantId;
    req.apiKeyId = row.apiKeyId;
    req.scopes = row.scopes;
    return true;
  }

  private assertScopes(context: ExecutionContext, granted: string[]): void {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return;
    }
    const set = new Set(granted);
    const ok = set.has(SCOPE_WILDCARD) || required.every((scope) => set.has(scope));
    if (!ok) {
      throw new ProblemException('FORBIDDEN', `필요한 스코프가 없습니다: ${required.join(', ')}`);
    }
  }
}
