# 03. API 명세

버전 프리픽스: `/v1`. 모든 요청/응답은 `application/json` (파일 업로드, 다운로드 스트리밍 제외).

---

## 3.1 표준 통신 프로토콜

모든 엔드포인트는 아래 3개 전역 컴포넌트를 통해 요청/응답을 정형화한다.

| 컴포넌트 | 시점 | 역할 |
|----------|------|------|
| `ZodValidationPipe` | 요청 | 모든 요청 DTO(`createZodDto`)를 Zod 스키마로 검증 |
| `ResponseTransformInterceptor` | 성공 | 정상 응답을 `{ success, data, meta }` 로 정형화 |
| `AllExceptionsFilter` | 실패 | 모든 예외를 RFC 7807 `application/problem+json` 으로 정형화 |

### 성공 응답 (정형화된 구조)

```jsonc
// 200 / 201 / 202
{
  "success": true,
  "data": {
    "documentId": "doc_01JZ...",
    "status": "QUEUED"
  },
  "meta": {
    "timestamp": "2026-07-23T00:00:00.000Z",
    "path": "/v1/documents",
    "traceId": "26229f8c-5697-4e72-b214-8f0aa039f083"
  }
}
```

- `data` : 엔드포인트의 실제 페이로드.
- `meta.timestamp` / `meta.path` / `meta.traceId` : 모든 성공 응답 공통.
- 목록(list) 엔드포인트는 `data`가 배열이고 페이지 정보를 `meta.pagination`(`page`, `size`, `total`)에 담는다.
- 헬스체크, 파일 다운로드처럼 정형화가 불필요한 엔드포인트는 `@SkipResponseTransform()` 으로 제외한다(원본 바이너리/리다이렉트 그대로 반환).

### 실패 응답 (RFC 7807)

```jsonc
// 404  (Content-Type: application/problem+json)
{
  "type": "https://papertrail.example/problems/not-found",
  "title": "Not Found",
  "status": 404,
  "code": "NOT_FOUND",
  "timestamp": "2026-07-23T00:00:00.000Z",
  "detail": "문서를 찾을 수 없습니다: doc_01JZ...",
  "instance": "/v1/documents/doc_01JZ...",
  "traceId": "fc0263b6-96eb-45b8-8ce4-a40bee23b6ea"
}
```

- `Content-Type: application/problem+json`.
- `type` : 문제 유형 URI. 기본 베이스는 `https://papertrail.example/problems/{code-kebab}` (환경별 설정 가능).
- `code` : 기계 판독용 에러 코드(아래 §3.3 표).
- `instance` : 문제가 발생한 요청 경로.

### 검증 에러 (Zod → RFC 7807)

요청 검증 실패는 `errors[]` 확장 멤버(RFC 7807 §3.2)로 필드별 사유까지 정형화된다.

```jsonc
// 400  (Content-Type: application/problem+json)
{
  "type": "https://papertrail.example/problems/bad-request",
  "title": "Bad Request",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "timestamp": "2026-07-23T00:00:00.000Z",
  "detail": "요청 데이터가 유효성 검증을 통과하지 못했습니다.",
  "instance": "/v1/documents",
  "traceId": "…",
  "errors": [
    { "name": "recipient.name",     "reason": "수신자 이름은 필수입니다.", "code": "too_small" },
    { "name": "document.trainingDate", "reason": "날짜 형식이 올바르지 않습니다.", "code": "invalid_string" }
  ]
}
```

### traceId (요청/응답/로그 상관관계)

`traceId` 는 성공 응답의 `meta.traceId`, 에러 응답의 `traceId`, 그리고 서버 로그가 모두 공유하는 값이다. 응답 헤더 `x-request-id` 로도 반환되어 요청, 응답, 로그를 한 번에 추적할 수 있다. 클라이언트가 `x-request-id` 를 보내면 그 값을 그대로 이어받고, 없으면 서버가 생성한다.

---

## 3.2 공통 헤더

### 요청 헤더
| 헤더 | 필수 | 설명 |
|------|------|------|
| `Authorization: Bearer <API_KEY>` | O | 테넌트 API Key |
| `X-Tenant-Id: <tenantId>` | O | 대상 테넌트 (키와 매칭 검증) |
| `Idempotency-Key: <key>` | 생성 요청 시 권장 | 중복 생성 방지 |
| `Content-Type: application/json` | 상황에 따라 | 업로드는 `multipart/form-data` |
| `x-request-id: <uuid>` | 선택 | 지정 시 `traceId` 로 승계 |

### 응답 헤더
| 헤더 | 설명 |
|------|------|
| `x-request-id: <uuid>` | 해당 응답의 `traceId` (성공/실패 공통) |
| `Content-Type: application/json` | 정형화 성공 응답 |
| `Content-Type: application/problem+json` | 실패 응답(RFC 7807) |

---

## 3.3 에러 코드

`code` 는 기계 판독용, `type` 은 `.../problems/{code-kebab}` 로 매핑된다.

| HTTP | code | type slug | 의미 |
|------|------|-----------|------|
| 400 | `BAD_REQUEST` | `bad-request` | 잘못된 요청 형식 |
| 400 | `VALIDATION_FAILED` | `bad-request` | JSON/Zod 스키마 검증 실패 (`errors[]` 포함) |
| 401 | `UNAUTHORIZED` | `unauthorized` | API Key 없음/무효 |
| 403 | `FORBIDDEN` | `forbidden` | 권한/테넌트 불일치 |
| 404 | `NOT_FOUND` | `not-found` | 리소스 없음(템플릿/문서) |
| 409 | `IDEMPOTENCY_CONFLICT` | `idempotency-conflict` | 같은 멱등키 + 다른 본문 |
| 422 | `SCHEMA_VALIDATION_FAILED` | `unprocessable-entity` | 템플릿 JSON Schema 대비 렌더 데이터 부적합 |
| 429 | `RATE_LIMITED` | `rate-limited` | 쿼터 초과 (`Retry-After` 동반) |
| 500 | `INTERNAL` | `internal` | 서버 오류 |
| 502 | `RENDER_UPSTREAM` | `render-upstream` | Papermake 렌더 오류 |

> `VALIDATION_FAILED`(400) 는 API 요청 스키마(Zod) 위반, `SCHEMA_VALIDATION_FAILED`(422) 는 렌더 데이터가 해당 템플릿의 JSON Schema 계약을 어긴 경우로 구분한다. 둘 다 `errors[]` 확장 멤버를 사용한다.

---

## 3.4 템플릿 API

> Papermake 원 엔드포인트(`/api/templates/{name}/publish`, `/api/templates`, `/api/templates/{name}/tags`, `/api/render/{reference}`, `/api/renders/{id}/pdf`, `/api/renders`)를 게이트웨이가 감싸 테넌트/권한/스키마/정형화를 추가한다.

### 템플릿 등록 (publish)
```
POST /v1/templates/{name}/publish?tag={tag}
Content-Type: multipart/form-data
```
form fields: `source`(Typst), `schema`(JSON Schema), `assets[]`(선택)

```jsonc
// 201
{
  "success": true,
  "data": {
    "name": "training-notice",
    "tag": "staging",
    "manifestHash": "sha256:9f2b...",
    "state": "DRAFT",
    "createdAt": "2026-07-23T01:00:00.000Z"
  },
  "meta": { "timestamp": "2026-07-23T01:00:00.000Z", "path": "/v1/templates/training-notice/publish", "traceId": "…" }
}
```

### 템플릿 목록
```
GET /v1/templates?query=&page=&size=
```
```jsonc
// 200  (목록은 data=배열, meta.pagination 포함)
{
  "success": true,
  "data": [
    { "name": "training-notice", "latestTag": "production", "updatedAt": "2026-07-23T01:00:00.000Z" }
  ],
  "meta": {
    "timestamp": "2026-07-23T01:00:00.000Z",
    "path": "/v1/templates",
    "traceId": "…",
    "pagination": { "page": 1, "size": 20, "total": 37 }
  }
}
```

### 태그/버전 목록
```
GET /v1/templates/{name}/tags
```
```jsonc
// 200
{
  "success": true,
  "data": {
    "name": "training-notice",
    "tags": [
      { "tag": "production", "manifestHash": "sha256:9f2b...", "state": "PUBLISHED" },
      { "tag": "staging",    "manifestHash": "sha256:1a77...", "state": "REVIEWING" }
    ]
  },
  "meta": { "timestamp": "…", "path": "/v1/templates/training-notice/tags", "traceId": "…" }
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
→ 큐를 우회한 동기 렌더. `data`에 임시 Signed URL 반환(정형화 적용).

### 버전 diff
```
GET /v1/templates/{name}/diff?from=sha256:1a77...&to=sha256:9f2b...
```
→ `data`에 소스 라인 diff + 스키마 필드 변경(added/removed/typeChanged).

### 상태 전이 (승인 워크플로)
```
POST /v1/templates/{name}/state
{ "manifestHash": "sha256:...", "to": "APPROVED" }
```
전이: `DRAFT → REVIEWING → APPROVED → PUBLISHED → DEPRECATED` (RBAC 통제).

---

## 3.5 문서 생성 API (단건)

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
응답:
```jsonc
// 202 Accepted
{
  "success": true,
  "data": {
    "documentId": "doc_01JZ...",
    "status": "QUEUED",
    "templateVersion": "sha256:9f2b...",
    "statusUrl": "/v1/documents/doc_01JZ..."
  },
  "meta": { "timestamp": "2026-07-23T01:00:00.000Z", "path": "/v1/documents", "traceId": "…" }
}
```

> `template`은 `name:tag`(가변) 또는 `name@sha256:...`(고정) 모두 허용. `data.templateVersion`은 실제 렌더에 쓰일 **고정 해시**.
> 요청 스키마 위반은 400 `VALIDATION_FAILED`, 템플릿 JSON Schema 계약 위반은 422 `SCHEMA_VALIDATION_FAILED` (둘 다 `errors[]` 포함).

## 3.6 문서 상태 조회 (증적 뷰)

```
GET /v1/documents/{documentId}
```
```jsonc
// 200
{
  "success": true,
  "data": {
    "documentId": "doc_01JZ...",
    "tenantId": "tenant_kpec",
    "status": "SUCCEEDED",
    "templateName": "training-notice",
    "templateTag": "2026-v2",
    "templateHash": "sha256:9f2b...",
    "inputHash": "sha256:aa11...",
    "outputHash": "sha256:bb22...",
    "pdfStandard": "a-3b",
    "requestedAt": "2026-07-23T01:00:00.000Z",
    "completedAt": "2026-07-23T01:00:03.000Z",
    "durationMs": 3120,
    "downloadUrl": "https://.../signed?...",
    "maskedPreview": { "name": "홍*동" }
  },
  "meta": { "timestamp": "…", "path": "/v1/documents/doc_01JZ...", "traceId": "…" }
}
```

## 3.7 다운로드 (Signed URL)

```
GET /v1/documents/{documentId}/download?ttl=300
```
- 기본: 302 redirect(파일 스트리밍) → `@SkipResponseTransform()` 적용(정형화 미적용).
- `?format=json` 지정 시 정형화 응답:
```jsonc
// 200
{
  "success": true,
  "data": { "url": "https://.../signed?...", "expiresAt": "2026-07-23T01:05:00.000Z", "outputHash": "sha256:bb22..." },
  "meta": { "timestamp": "…", "path": "/v1/documents/doc_01JZ.../download", "traceId": "…" }
}
```

---

## 3.8 배치(대량) 생성 API

### 배치 생성
```
POST /v1/batches
Content-Type: multipart/form-data
```
form fields: `template`, `pdfStandard`(선택), `file`(CSV), `mapping`(CSV→스키마 매핑 JSON), `callbackUrl`(선택)

```jsonc
// 202
{
  "success": true,
  "data": { "batchId": "batch_01JZ...", "total": 12000, "status": "QUEUED" },
  "meta": { "timestamp": "…", "path": "/v1/batches", "traceId": "…" }
}
```

### 배치 진행률
```
GET /v1/batches/{batchId}
```
```jsonc
// 200
{
  "success": true,
  "data": {
    "batchId": "batch_01JZ...",
    "status": "RUNNING",
    "total": 12000,
    "succeeded": 11800,
    "failed": 40,
    "pending": 160,
    "progress": 0.986,
    "reportUrl": null
  },
  "meta": { "timestamp": "…", "path": "/v1/batches/batch_01JZ...", "traceId": "…" }
}
```

### 배치 결과 리포트
```
GET /v1/batches/{batchId}/report
```
→ `data`에 성공/실패/오류코드 집계 + 실패 행 목록(Signed URL).

---

## 3.9 Webhook (수신자 관점)

> Webhook은 PaperTrail이 고객 시스템으로 보내는 **이벤트**이므로 `{ success, data, meta }` 정형화를 적용하지 않는다. 별도의 서명된 이벤트 페이로드 계약을 따른다.

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
  "occurredAt": "2026-07-23T01:00:03.000Z"
}
```
이벤트 종류: `document.succeeded`, `document.failed`, `batch.completed`. 서명 검증은 [05. 보안](05-security.md) 참조.

## 3.10 관리 API (콘솔 전용, 요약)

정형화(`{ success, data, meta }`) 동일 적용.

| 엔드포인트 | 용도 |
|-----------|------|
| `POST /v1/admin/api-keys` | API Key 발급 (`data`에 1회 노출 원문) |
| `DELETE /v1/admin/api-keys/{id}` | 폐기 |
| `POST /v1/admin/webhooks` | Webhook 엔드포인트 등록(시크릿 발급) |
| `GET /v1/admin/dlq` | DLQ 항목 조회 (목록, `meta.pagination`) |
| `POST /v1/admin/dlq/{id}/requeue` | 재처리 |
| `GET /v1/admin/stats` | ClickHouse 기반 통계(성공률/처리량/오류) |
| `GET /v1/health` | 헬스체크 (`@SkipResponseTransform()`) |

## 3.11 상태 전이 (문서)

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
