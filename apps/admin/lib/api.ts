import type {
  AuditEntry,
  BatchListItem,
  CreateDocumentRequest,
  CreateDocumentResponse,
  DocumentDetail,
  DocumentListItem,
  RegisterTemplateRequest,
  StatsOverview,
  TemplateListItem,
  TemplatePublished,
  TemplateStateChanged,
  TemplateTags,
  TransitionStateRequest,
  UsageSummary,
  VerifyResult,
} from '@papertrail/contracts';

// 로컬 값이 기본: .env 없이도 로컬 게이트웨이 + 시드된 dev API Key 로 동작한다.
// 운영/커스텀은 GATEWAY_URL, ADMIN_API_KEY 로 오버라이드(루트 .env 는 next.config 에서 로드).
const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const API_KEY = process.env.ADMIN_API_KEY ?? 'pt_dev_papertrail_local_key';

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

/** 문서 생성(실제 파이프라인: 큐 → 워커 렌더). 202 로 documentId 를 돌려준다. */
export function createDocument(body: CreateDocumentRequest): Promise<CreateDocumentResponse> {
  return apiPost<CreateDocumentResponse>('/v1/documents', body);
}

/** 문서 증적/상태 조회(SUCCEEDED 면 downloadUrl 포함). */
export function getDocument(id: string): Promise<DocumentDetail> {
  return apiGet<DocumentDetail>(`/v1/documents/${encodeURIComponent(id)}`);
}

/** 재현성 검증(동일 입력 재렌더 후 해시 대조). 본문 없이 호출하면 저장 입력 사용. */
export function verifyDocument(id: string): Promise<VerifyResult> {
  return apiPost<VerifyResult>(`/v1/documents/${encodeURIComponent(id)}/verify`, {});
}

/** 문서 목록(최신순). status 로 필터. */
export function listDocuments(params?: {
  limit?: number;
  status?: string;
}): Promise<DocumentListItem[]> {
  const q = new URLSearchParams();
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.status) q.set('status', params.status);
  const qs = q.toString();
  return apiGet<DocumentListItem[]>(`/v1/documents${qs ? `?${qs}` : ''}`);
}

/** 배치 목록(최신순). */
export function listBatches(limit?: number): Promise<BatchListItem[]> {
  return apiGet<BatchListItem[]>(`/v1/batches${limit ? `?limit=${limit}` : ''}`);
}
