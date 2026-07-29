import { z } from 'zod';
import { PdfStandard } from './common.js';

/** 배치(대량) 작업 상태. */
export const BatchStatus = z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']);
export type BatchStatus = z.infer<typeof BatchStatus>;

/**
 * POST /v1/batches 요청 본문.
 * 명세(docs/03)는 multipart(CSV 파일)이나 M2 는 JSON(csv 텍스트)로 단순화한다.
 * csv 는 헤더 행 + 데이터 행이며, 각 행이 한 문서의 렌더 데이터가 된다.
 */
export const CreateBatchRequest = z.object({
  template: z.string().min(1, '템플릿 참조는 필수입니다.'),
  pdfStandard: PdfStandard.default('pdf-1.7'),
  csv: z.string().min(1, 'CSV 본문은 필수입니다.'),
  callbackUrl: z.url('올바른 URL 형식이어야 합니다.').optional(),
});
export type CreateBatchRequest = z.infer<typeof CreateBatchRequest>;

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

/** GET /v1/batches 목록 원소(요약). */
export const BatchListItem = z.object({
  batchId: z.string(),
  templateRef: z.string(),
  status: BatchStatus,
  total: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type BatchListItem = z.infer<typeof BatchListItem>;
