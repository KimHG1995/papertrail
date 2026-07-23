import { z } from 'zod';

/** 배치(대량) 작업 상태. */
export const BatchStatus = z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']);
export type BatchStatus = z.infer<typeof BatchStatus>;

/** POST /v1/batches 응답 data (202). */
export const CreateBatchResponse = z.object({
  batchId: z.string(),
  total: z.number().int().nonnegative(),
  status: BatchStatus,
});
export type CreateBatchResponse = z.infer<typeof CreateBatchResponse>;

/** GET /v1/batches/{id} 응답 data (진행률). */
export const BatchProgress = z.object({
  batchId: z.string(),
  status: BatchStatus,
  total: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  progress: z.number().min(0).max(1),
  reportUrl: z.url().nullable(),
});
export type BatchProgress = z.infer<typeof BatchProgress>;
