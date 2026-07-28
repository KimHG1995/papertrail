import type {
  AuditEntry,
  StatsOverview,
  TemplateListItem,
  UsageSummary,
} from '@papertrail/contracts';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const API_KEY = process.env.ADMIN_API_KEY ?? '';

/** 게이트웨이 표준 응답 {success,data,meta} 에서 data 만 꺼내 반환한다(서버 전용). */
async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    headers: { authorization: `Bearer ${API_KEY}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`게이트웨이 요청 실패: ${res.status} ${path}`);
  }
  const body = (await res.json()) as { data: T };
  return body.data;
}

export function getUsage(): Promise<UsageSummary> {
  return apiGet<UsageSummary>('/v1/usage');
}

export function getStats(): Promise<StatsOverview> {
  return apiGet<StatsOverview>('/v1/stats/overview');
}

export function listTemplates(): Promise<TemplateListItem[]> {
  return apiGet<TemplateListItem[]>('/v1/templates');
}

export function listAudit(): Promise<AuditEntry[]> {
  return apiGet<AuditEntry[]>('/v1/audit?limit=20');
}
