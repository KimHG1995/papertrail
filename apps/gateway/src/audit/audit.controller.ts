import { Controller, Get, Query } from '@nestjs/common';
import type { AuditEntry } from '@papertrail/contracts';
import { CurrentTenant } from '../auth/current-tenant.decorator.js';
import { RequiredScopes } from '../auth/scopes.decorator.js';
import { AuditService } from './audit.service.js';

/** 감사 로그 조회 엔드포인트(테넌트 격리, audit:read 스코프). */
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequiredScopes('audit:read')
  list(
    @CurrentTenant() tenantId: string,
    @Query('limit') limit: string | undefined,
  ): Promise<AuditEntry[]> {
    return this.audit.list(tenantId, limit ? Number(limit) : undefined);
  }
}
