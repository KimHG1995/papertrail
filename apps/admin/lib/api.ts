import type {
  AuditEntry,
  RegisterTemplateRequest,
  StatsOverview,
  TemplateListItem,
  TemplatePublished,
  TemplateStateChanged,
  TemplateTags,
  TransitionStateRequest,
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

/** POST 뮤테이션. 실패 시 problem+json 의 detail 을 메시지로 던진다(서버 전용). */
async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const text = await res.text();
  const json = (text ? JSON.parse(text) : {}) as { data?: T; detail?: string; title?: string };
  if (!res.ok) {
    throw new Error(json.detail ?? json.title ?? `게이트웨이 요청 실패: ${res.status}`);
  }
  return json.data as T;
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

/** 템플릿의 태그/버전 목록(각 버전의 승인 상태 포함). */
export function getTemplateTags(name: string): Promise<TemplateTags> {
  return apiGet<TemplateTags>(`/v1/templates/${encodeURIComponent(name)}/tags`);
}

/** 템플릿 등록(publish). 새 버전은 DRAFT 로 시작한다. */
export function registerTemplate(
  name: string,
  tag: string,
  body: RegisterTemplateRequest,
): Promise<TemplatePublished> {
  return apiPost<TemplatePublished>(
    `/v1/templates/${encodeURIComponent(name)}/publish?tag=${encodeURIComponent(tag)}`,
    body,
  );
}

/** 승인 워크플로 상태 전이. */
export function transitionTemplate(
  name: string,
  body: TransitionStateRequest,
): Promise<TemplateStateChanged> {
  return apiPost<TemplateStateChanged>(`/v1/templates/${encodeURIComponent(name)}/state`, body);
}
