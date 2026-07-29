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
  /** true 면 입력 원문을 암호화해 저장한다(서버 단독 재현 검증 가능). 기본 false. */
  storeInput: z.boolean().default(false),
});
export type CreateDocumentRequest = z.infer<typeof CreateDocumentRequest>;

/**
 * POST /v1/documents 응답 data (202 Accepted).
 * templateHash 는 고정 참조(name@sha256:...)면 즉시 확정, 가변 태그(name:tag)면
 * 렌더 시점에 확정되므로 접수 응답에서는 null 일 수 있다.
 */
export const CreateDocumentResponse = z.object({
  documentId: z.string(),
  status: DocumentStatus,
  templateHash: HashRef.nullable(),
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
  templateHash: HashRef.nullable(),
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

/**
 * POST /v1/documents/{id}/verify 요청 본문.
 * document 를 주면 그 입력으로 검증하고, 생략하면 저장된 암호화 입력(있을 때)으로 서버가 검증한다.
 */
export const VerifyDocumentRequest = z
  .object({
    recipient: JsonObject.optional(),
    document: JsonObject.optional(),
  })
  // 본문 없이 호출하면 저장된 암호화 입력으로 서버가 단독 재현 검증한다.
  .default({});
export type VerifyDocumentRequest = z.infer<typeof VerifyDocumentRequest>;

/** 저장된 해시 vs 재계산 해시 비교. */
const HashComparison = z.object({
  expected: HashRef,
  actual: HashRef,
  matches: z.boolean(),
});

/** POST /v1/documents/{id}/verify 응답 data (재현성 검증 결과). */
export const VerifyResult = z.object({
  documentId: z.string(),
  reproducible: z.boolean(),
  inputHash: HashComparison,
  outputHash: HashComparison,
});
export type VerifyResult = z.infer<typeof VerifyResult>;
