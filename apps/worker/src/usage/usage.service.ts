import { Inject, Injectable } from '@nestjs/common';
import { type Database, usageCounter, usagePeriod } from '@papertrail/db';
import { sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants.js';

/** 렌더 사용량 집계. 문서 확정 시 현재 기간(월)의 카운터를 원자적으로 증가시킨다. */
@Injectable()
export class UsageService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async increment(tenantId: string, outcome: 'succeeded' | 'failed'): Promise<void> {
    const period = usagePeriod();
    await this.db
      .insert(usageCounter)
      .values({
        tenantId,
        period,
        rendered: outcome === 'succeeded' ? 1 : 0,
        failed: outcome === 'failed' ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: [usageCounter.tenantId, usageCounter.period],
        set:
          outcome === 'succeeded'
            ? { rendered: sql`${usageCounter.rendered} + 1` }
            : { failed: sql`${usageCounter.failed} + 1` },
      });
  }
}
