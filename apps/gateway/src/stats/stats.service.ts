import { Inject, Injectable } from '@nestjs/common';
import type { AnalyticsClient } from '@papertrail/analytics';
import type { StatsOverview } from '@papertrail/contracts';
import { ANALYTICS } from '../analytics/analytics.constants.js';

/** 기본 조회 기간(일). from/to 미지정 시 최근 N일. */
const DEFAULT_WINDOW_DAYS = 7;

/** 유효한 ISO 날짜면 Date, 아니면 null. */
function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 통계 조회. 기간 파라미터를 정규화해 분석 클라이언트에 위임한다. */
@Injectable()
export class StatsService {
  constructor(@Inject(ANALYTICS) private readonly analytics: AnalyticsClient) {}

  getOverview(tenantId: string, fromRaw?: string, toRaw?: string): Promise<StatsOverview> {
    const to = parseDate(toRaw) ?? new Date();
    const from =
      parseDate(fromRaw) ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return this.analytics.getOverview(tenantId, from, to);
  }
}
