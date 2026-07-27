import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UsageSummary } from '@papertrail/contracts';
import { type Database, usagePeriod } from '@papertrail/db';
import { ProblemException } from '../common/exceptions/problem.exception.js';
import { DRIZZLE } from '../database/database.constants.js';

/** 월 렌더 사용량 조회 + 쿼터 강제. */
@Injectable()
export class UsageService {
  private readonly quota: number;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    config: ConfigService,
  ) {
    this.quota = Number(config.get<string>('MONTHLY_RENDER_QUOTA', '10000'));
  }

  /** 현재 기간(월) 사용량 요약. */
  async getSummary(tenantId: string): Promise<UsageSummary> {
    const { period, rendered, failed } = await this.current(tenantId);
    return {
      period,
      rendered,
      failed,
      quota: this.quota,
      remaining: Math.max(0, this.quota - rendered),
    };
  }

  /** 이번 달 렌더 수가 쿼터에 도달했으면 429(QUOTA_EXCEEDED). */
  async assertWithinQuota(tenantId: string): Promise<void> {
    const { rendered } = await this.current(tenantId);
    if (rendered >= this.quota) {
      throw new ProblemException(
        'QUOTA_EXCEEDED',
        `이번 달 렌더 쿼터(${this.quota})를 초과했습니다.`,
      );
    }
  }

  private async current(
    tenantId: string,
  ): Promise<{ period: string; rendered: number; failed: number }> {
    const period = usagePeriod();
    const row = await this.db.query.usageCounter.findFirst({
      where: (u, { and, eq }) => and(eq(u.tenantId, tenantId), eq(u.period, period)),
    });
    return { period, rendered: row?.rendered ?? 0, failed: row?.failed ?? 0 };
  }
}
