import { z } from 'zod';
import { HashRef, JsonObject, PdfStandard } from '../domain/common.js';

/** 렌더 작업 큐 이름(게이트웨이 프로듀서 → 워커 컨슈머). */
export const RENDER_QUEUE = 'render';

/** 재시도 소진 후 실패 작업이 이동하는 DLQ 이름. */
export const RENDER_DLQ = 'render-dlq';

/** 렌더 작업 JobName(BullMQ job name). */
export const RENDER_JOB = 'render-document';

/**
 * 렌더 작업 페이로드. 게이트웨이가 문서를 QUEUED 로 저장한 뒤 큐에 넣고,
 * 워커가 이 데이터로 Papermake 를 호출한다. jobId 는 documentId 로 두어
 * 멱등성 재요청이 중복 적재되지 않게 한다.
 */
export const RenderJobData = z.object({
  documentId: z.string(),
  tenantId: z.string(),
  template: z.string(),
  templateHash: HashRef,
  pdfStandard: PdfStandard,
  data: JsonObject,
  recipient: JsonObject.nullable(),
});
export type RenderJobData = z.infer<typeof RenderJobData>;
