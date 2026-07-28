/**
 * 결과 PDF 의 S3 오브젝트 키. docs/04-data-model.md §4.3 레이아웃을 따른다.
 *   documents/{tenantId}/{yyyy}/{mm}/{documentId}.pdf
 */
export function documentPdfKey(tenantId: string, documentId: string, at: Date): string {
  const yyyy = at.getUTCFullYear();
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `documents/${tenantId}/${yyyy}/${mm}/${documentId}.pdf`;
}

/** 배치 원본 CSV 의 S3 키. */
export function batchSourceKey(tenantId: string, batchId: string): string {
  return `batches/${tenantId}/${batchId}/source.csv`;
}

/** 배치 결과 리포트 CSV 의 S3 키. */
export function batchReportKey(tenantId: string, batchId: string): string {
  return `batches/${tenantId}/${batchId}/report.csv`;
}

/** 미리보기 PDF 의 S3 키(콘텐츠 주소 기반, 동일 결과는 dedup). */
export function previewKey(tenantId: string, contentHashHex: string): string {
  return `previews/${tenantId}/${contentHashHex}.pdf`;
}
