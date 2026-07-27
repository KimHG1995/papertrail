import { Controller, Get } from '@nestjs/common';
import type { UsageSummary } from '@papertrail/contracts';
import { CurrentTenant } from '../auth/current-tenant.decorator.js';
import { RequiredScopes } from '../auth/scopes.decorator.js';
import { UsageService } from './usage.service.js';

/** 사용량 조회 엔드포인트(테넌트 격리). */
@Controller('usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  @RequiredScopes('documents:read')
  summary(@CurrentTenant() tenantId: string): Promise<UsageSummary> {
    return this.usage.getSummary(tenantId);
  }
}
