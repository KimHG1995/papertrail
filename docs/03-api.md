# 03. API 명세

버전 프리픽스: `/v1`. 모든 요청/응답은 `application/json` (파일 업로드 제외).

## 3.1 공통 헤더

| 헤더 | 필수 | 설명 |
|------|------|------|
| `Authorization: Bearer <API_KEY>` | O | 테넌트 API Key |
| `X-Tenant-Id: <tenantId>` | O | 대상 테넌트 (키와 매칭 검증) |
| `Idempotency-Key: <key>` | 생성 요청 시 권장 | 중복 생성 방지 |
| `Content-Type: application/json` | 상황에 따라 | 업로드는 `multipart/form-data` |

## 3.2 공통 오류 포맷

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "recipient.name is required",
    "details": [{ "path": "recipient.name", "rule": "required" }],
    "requestId": "req_01JZ..."
  }
}
```

| HTTP | code | 의미 |
|------|------|------|
| 400 | `BAD_REQUEST` | 잘못된 요청 형식 |
| 401 | `UNAUTHORIZED` | API Key 없음/무효 |
| 403 | `FORBIDDEN` | 권한/테넌트 불일치 |
| 404 | `NOT_FOUND` | 리소스 없음(템플릿/문서) |
| 409 | `IDEMPOTENCY_CONFLICT` | 같은 멱등키 + 다른 본문 |
| 422 | `VALIDATION_FAILED` | JSON Schema 검증 실패 |
| 429 | `RATE_LIMITED` | 쿼터 초과 |
| 500 | `INTERNAL` | 서버 오류 |
| 502 | `RENDER_UPSTREAM` | Papermake 렌더 오류 |

---

## 3.3 템플릿 API

> Papermake 원 엔드포인트(`/api/templates/{name}/publish`, `/api/templates`, `/api/templates/{name}/tags`, `/api/render/{reference}`, `/api/renders/{id}/pdf`, `/api/renders`)를 게이트웨이가 감싸 테넌트/권한/스키마를 추가한다.

### 템플릿 등록 (publish)
```
POST /v1/templates/{name}/publish?tag={tag}
Content-Type: multipart/form-data
```
form fields:
- `source` (Typst 파일)
- `schema` (JSON Schema 파일)
- `assets[]` (선택: 로고/폰트)

응답:
```json
{
  "name": "training-notice",
  "tag": "staging",
  "manifestHash": "sha256:9f2b...",
  "status": "DRAFT",
  "createdAt": "2026-07-23T01:00:00Z"
}
```

### 템플릿 목록
```
GET /v1/templates?query=&page=&size=
```

### 태그/버전 목록
```
GET /v1/templates/{name}/tags
```
```json
{
  "name": "training-notice",
  "tags": [
    { "tag": "production", "manifestHash": "sha256:9f2b...", "state": "PUBLISHED" },
    { "tag": "staging",    "manifestHash": "sha256:1a77...", "state": "REVIEWING" }
  ]
}
```

### 태그 이동(승격)
```
POST /v1/templates/{name}/tags/{tag}
{ "manifestHash": "sha256:9f2b..." }
```

### 미리보기 (관리자)
```
POST /v1/templates/{name}/preview
{ "ref": "sha256:9f2b...", "data": { ... }, "pdfStandard": "pdf-1.7" }
```
→ 큐를 우회한 동기 렌더, 결과 PDF의 임시 Signed URL 반환.

### 버전 diff
```
GET /v1/templates/{name}/diff?from=sha256:1a77...&to=sha256:9f2b...
```
→ 소스 라인 diff + 스키마 필드 변경(added/removed/typeChanged).

### 상태 전이 (승인 워크플로)
```
POST /v1/templates/{name}/state
{ "manifestHash": "sha256:...", "to": "APPROVED" }
```
전이: `DRAFT → REVIEWING → APPROVED → PUBLISHED → DEPRECATED` (RBAC 통제).

---

## 3.4 문서 생성 API (단건)

```
POST /v1/documents
Authorization: Bearer ...
X-Tenant-Id: tenant_kpec
Idempotency-Key: notice-20260723-10001
```
요청:
```json
{
  "template": "training-notice:2026-v2",
  "idempotencyKey": "notice-20260723-10001",
  "pdfStandard": "a-3b",
  "recipient": { "name": "홍길동", "birth": "1990-01-01" },
  "document": {
    "title": "2026년 교육훈련 통지서",
    "trainingDate": "2026-08-10",
    "location": "서울교육센터"
  },
  "callbackUrl": "https://customer.example.com/webhooks/documents"
}
```
응답 (202 Accepted):
```json
{
  "documentId": "doc_01JZ...",
  "status": "QUEUED",
  "templateVersion": "sha256:9f2b...",
  "statusUrl": "/v1/documents/doc_01JZ..."
}
```

> `template`은 `name:tag`(가변) 또는 `name@sha256:...`(고정) 모두 허용. 응답의 `templateVersion`은 실제 렌더에 쓰일 **고정 해시**.

## 3.5 문서 상태 조회 (증적 뷰)

```
GET /v1/documents/{documentId}
```
```json
{
  "documentId": "doc_01JZ...",
  "tenantId": "tenant_kpec",
  "status": "SUCCEEDED",
  "templateName": "training-notice",
  "templateTag": "2026-v2",
  "templateHash": "sha256:9f2b...",
  "inputHash": "sha256:aa11...",
  "outputHash": "sha256:bb22...",
  "pdfStandard": "a-3b",
  "requestedAt": "2026-07-23T01:00:00Z",
  "completedAt": "2026-07-23T01:00:03Z",
  "durationMs": 3120,
  "downloadUrl": "https://.../signed?...",
  "maskedPreview": { "name": "홍*동" }
}
```

## 3.6 다운로드 (Signed URL)

```
GET /v1/documents/{documentId}/download?ttl=300
```
→ 302 redirect 또는 `{ "url": "...", "expiresAt": "...", "outputHash": "sha256:..." }`.

---

## 3.7 배치(대량) 생성 API

### 배치 생성
```
POST /v1/batches
Content-Type: multipart/form-data
```
form fields:
- `template` (예: `payment-notice:production`)
- `pdfStandard` (선택)
- `file` (CSV)
- `mapping` (CSV 컬럼 → 스키마 필드 매핑 JSON)
- `callbackUrl` (선택, 배치 완료 시)

응답:
```json
{ "batchId": "batch_01JZ...", "total": 12000, "status": "QUEUED" }
```

### 배치 진행률
```
GET /v1/batches/{batchId}
```
```json
{
  "batchId": "batch_01JZ...",
  "status": "RUNNING",
  "total": 12000,
  "succeeded": 11800,
  "failed": 40,
  "pending": 160,
  "progress": 0.986,
  "reportUrl": null
}
```

### 배치 결과 리포트
```
GET /v1/batches/{batchId}/report
```
→ 성공/실패/오류코드 집계 + 실패 행 목록(Signed URL).

---

## 3.8 Webhook (수신자 관점)

PaperTrail → 고객 시스템 발송 페이로드:
```
POST {callbackUrl}
X-Webhook-Signature: sha256=<hmac>
X-Webhook-Timestamp: 1784772000
```
```json
{
  "event": "document.succeeded",
  "documentId": "doc_01JZ...",
  "tenantId": "tenant_kpec",
  "outputHash": "sha256:bb22...",
  "downloadUrl": "https://.../signed?...",
  "occurredAt": "2026-07-23T01:00:03Z"
}
```
이벤트 종류: `document.succeeded`, `document.failed`, `batch.completed`. 서명 검증은 [05. 보안](05-security.md) 참조.

## 3.9 관리 API (콘솔 전용, 요약)

| 엔드포인트 | 용도 |
|-----------|------|
| `POST /v1/admin/api-keys` | API Key 발급 |
| `DELETE /v1/admin/api-keys/{id}` | 폐기 |
| `POST /v1/admin/webhooks` | Webhook 엔드포인트 등록(시크릿 발급) |
| `GET /v1/admin/dlq` | DLQ 항목 조회 |
| `POST /v1/admin/dlq/{id}/requeue` | 재처리 |
| `GET /v1/admin/stats` | ClickHouse 기반 통계(성공률/처리량/오류) |

## 3.10 상태 전이 (문서)

```
QUEUED ──▶ RENDERING ──▶ SUCCEEDED
   │            │
   │            └──▶ (일시오류) 재시도 ──▶ RENDERING
   │                        └──(초과)──▶ FAILED (DLQ)
   └──(검증실패/영구오류)────────────────▶ FAILED
```

## 이어서 읽기

- 스키마 → [04. 데이터 모델](04-data-model.md)
- 보안/서명 → [05. 보안](05-security.md)
