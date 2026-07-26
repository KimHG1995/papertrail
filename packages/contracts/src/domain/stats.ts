import { z } from 'zod';

/** 템플릿별 렌더 통계. */
export const TemplateStat = z.object({
  templateName: z.string(),
  total: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  p95DurationMs: z.number().nonnegative(),
});
export type TemplateStat = z.infer<typeof TemplateStat>;

/** 오류 코드별 집계. */
export const ErrorCodeStat = z.object({
  errorCode: z.string(),
  count: z.number().int().nonnegative(),
});
export type ErrorCodeStat = z.infer<typeof ErrorCodeStat>;

/** GET /v1/stats/overview 응답 data. 기간 내 렌더 이벤트 집계(ClickHouse). */
export const StatsOverview = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  total: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  p95DurationMs: z.number().nonnegative(),
  byTemplate: z.array(TemplateStat),
  byErrorCode: z.array(ErrorCodeStat),
});
export type StatsOverview = z.infer<typeof StatsOverview>;
