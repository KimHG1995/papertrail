import { z } from 'zod';
import { HashRef, JsonObject, PdfStandard } from './common.js';

/** 문서 렌더 상태. docs/03-api.md §3.11 */
export const DocumentStatus = z.enum(['QUEUED', 'RENDERING', 'SUCCEEDED', 'FAILED']);
export type DocumentStatus = z.infer<typeof DocumentStatus>;

/**
 * POST /v1/documents 요청 본문 (단건 생성).
 * template 은 name:tag(가변) 또는 name@sha256:...(고정) 모두 허용.
 */
export const CreateDocumentRequest = z.object({
  template: z.string().min(1, '템플릿 참조는 필수입니다.'),
  idempotencyKey: z.string().min(1).optional(),
  pdfStandard: PdfStandard.default('pdf-1.7'),
  recipient: JsonObject.optional(),
  document: JsonObject,
  callbackUrl: z.url('올바른 URL 형식이어야 합니다.').optional(),
});
export type CreateDocumentRequest = z.infer<typeof CreateDocumentRequest>;

/** POST /v1/documents 응답 data (202 Accepted). */
export const CreateDocumentResponse = z.object({
  documentId: z.string(),
  status: DocumentStatus,
  templateVersion: HashRef,
  statusUrl: z.string(),
});
export type CreateDocumentResponse = z.infer<typeof CreateDocumentResponse>;

/** GET /v1/documents/{id} 응답 data (증적 뷰). */
export const DocumentDetail = z.object({
  documentId: z.string(),
  tenantId: z.string(),
  status: DocumentStatus,
  templateName: z.string(),
  templateTag: z.string().nullable(),
  templateHash: HashRef,
  inputHash: HashRef,
  outputHash: HashRef.nullable(),
  pdfStandard: PdfStandard,
  requestedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  downloadUrl: z.url().nullable(),
  maskedPreview: JsonObject.nullable(),
});
export type DocumentDetail = z.infer<typeof DocumentDetail>;

/** GET /v1/documents/{id}/download?format=json 응답 data. */
export const DownloadInfo = z.object({
  url: z.url(),
  expiresAt: z.iso.datetime(),
  outputHash: HashRef,
});
export type DownloadInfo = z.infer<typeof DownloadInfo>;
