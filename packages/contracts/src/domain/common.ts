import { z } from 'zod';

/** PDF 저장 표준. a-2b, a-3b 는 PDF/A 장기보관 포맷. */
export const PdfStandard = z.enum(['pdf-1.7', 'a-2b', 'a-3b']);
export type PdfStandard = z.infer<typeof PdfStandard>;

/** 콘텐츠 주소 해시 참조 (sha256:...). */
export const HashRef = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, 'sha256:<64 hex> 형식이어야 합니다.');
export type HashRef = z.infer<typeof HashRef>;

/** 렌더 데이터 페이로드 (임의 JSON 객체). */
export const JsonObject = z.record(z.string(), z.unknown());
export type JsonObject = z.infer<typeof JsonObject>;
