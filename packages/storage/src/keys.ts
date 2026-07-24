/**
 * 결과 PDF 의 S3 오브젝트 키. docs/04-data-model.md §4.3 레이아웃을 따른다.
 *   documents/{tenantId}/{yyyy}/{mm}/{documentId}.pdf
 */
export function documentPdfKey(tenantId: string, documentId: string, at: Date): string {
  const yyyy = at.getUTCFullYear();
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `documents/${tenantId}/${yyyy}/${mm}/${documentId}.pdf`;
}
