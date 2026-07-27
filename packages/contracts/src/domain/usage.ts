import { z } from 'zod';

/** GET /v1/usage 응답 data. 현재 기간(월)의 렌더 사용량과 쿼터. */
export const UsageSummary = z.object({
  period: z.string(),
  rendered: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  quota: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});
export type UsageSummary = z.infer<typeof UsageSummary>;
