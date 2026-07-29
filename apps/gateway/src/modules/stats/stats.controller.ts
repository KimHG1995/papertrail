import { Controller, Get, Query } from '@nestjs/common';
import type { StatsOverview } from '@papertrail/contracts';
import { CurrentTenant } from '../auth/current-tenant.decorator.js';
import { RequiredScopes } from '../auth/scopes.decorator.js';
import { StatsService } from './stats.service.js';

/** 통계 조회 엔드포인트(ClickHouse 집계). 문서 읽기 스코프를 재사용한다. */
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('overview')
  @RequiredScopes('documents:read')
  overview(
    @CurrentTenant() tenantId: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
  ): Promise<StatsOverview> {
    return this.stats.getOverview(tenantId, from, to);
  }
}
