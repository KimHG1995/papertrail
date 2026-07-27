import { z } from 'zod';

/** GET /v1/audit 응답 원소. 인증된 변경 요청 한 건의 감사 기록. */
export const AuditEntry = z.object({
  id: z.string(),
  action: z.string(),
  resourceId: z.string().nullable(),
  statusCode: z.number().int(),
  apiKeyId: z.string().nullable(),
  traceId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;
