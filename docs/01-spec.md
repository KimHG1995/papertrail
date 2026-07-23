# 01. 기능 명세

본 문서는 PaperTrail의 기능 요구사항을 정의한다. 우선순위는 다음 표기를 따른다.

- **[MVP]** 최초 릴리스에 반드시 포함
- **[차별화]** MVP 이후 추가하는 경쟁 우위 기능
- **[후속]** 로드맵상 더 뒤

---

## 1. 템플릿 관리 [MVP]

### 1.1 요구사항

- Typst 템플릿 등록(publish). Papermake의 콘텐츠 주소 저장을 그대로 활용한다.
- 태그 관리: `draft`, `staging`, `production` (가변 포인터).
- 템플릿 버전 고정: `name@sha256:...` 참조로 불변 렌더 보장.
- 템플릿마다 **JSON Schema 등록** (입력 데이터 계약).
- 샘플 데이터로 미리보기 렌더.
- 템플릿 버전 간 diff (소스, 스키마 변경점).

### 1.2 상세

| 기능 | 설명 |
|------|------|
| 등록 | Typst 소스 + asset(로고/폰트) + JSON Schema를 하나의 매니페스트로 publish |
| 태그 이동 | `production` 태그를 특정 매니페스트 해시로 이동(승격) |
| 버전 목록 | 템플릿별 태그/해시 목록 조회 |
| 미리보기 | 샘플 데이터로 즉시 렌더(비동기 큐 우회, 관리자 전용) |
| Diff | 두 버전의 소스 라인 diff + 스키마 필드 추가/삭제/타입변경 |

> Papermake는 이미 template publish, 태그 조회, 렌더링, PDF 다운로드 API를 제공한다. PaperTrail은 여기에 **JSON Schema 계약, 승인 워크플로, 미리보기, diff** 를 얹는다.

### 1.3 템플릿 승인 워크플로 [차별화]

```
DRAFT → REVIEWING → APPROVED → PUBLISHED → DEPRECATED
```

- `DRAFT`: 작성 중, 렌더 불가(미리보기만)
- `REVIEWING`: 리뷰어 지정, 코멘트
- `APPROVED`: 승인됨, 아직 프로덕션 태그 아님
- `PUBLISHED`: `production` 태그가 이 매니페스트를 가리킴
- `DEPRECATED`: 신규 렌더 차단, 기존 문서 재현은 가능

상태 전이는 권한(RBAC)으로 통제한다. 상세는 [05. 보안](05-security.md) 참조.

---

## 2. 비동기 대량 문서 생성 [MVP]

Papermake의 `papermake-worker`가 초기 스텁이므로, **큐 처리/재시도/DLQ/동시성/멱등성은 PaperTrail이 직접 설계**한다. 이 프로젝트의 핵심.

### 2.1 요구사항

- REST API 단건 생성
- CSV 업로드 기반 대량(batch) 생성
- SQS 기반 비동기 작업 처리
- 재시도(backoff) 및 DLQ
- 동시 렌더링 제한(테넌트별 concurrency quota)
- 작업별 진행률(batch progress)
- 멱등키(Idempotency-Key)로 중복 생성 방지

### 2.2 단건 생성 흐름

```
POST /v1/documents  (JSON)
  → 멱등키 확인 (중복이면 기존 documentId 반환)
  → JSON Schema 검증 (실패 시 422)
  → 문서 레코드 생성 (status=QUEUED)
  → SQS enqueue
  → { documentId, status: QUEUED, statusUrl } 즉시 반환
        ↓ (worker)
  → status=RENDERING
  → Papermake 렌더 → PDF/A 변환 → S3 저장
  → 해시 기록 → status=SUCCEEDED (또는 FAILED)
  → Webhook 발송(있으면)
```

### 2.3 대량(batch) 생성 흐름

```
POST /v1/batches  (CSV + templateRef + mapping)
  → CSV 파싱/검증, 행 단위 문서 레코드 생성
  → batchId 반환
  → 각 행을 개별 render job으로 fan-out
  → 행별 상태 집계 → batch progress
  → 완료 시 batch 요약 리포트(성공/실패/오류코드) 생성
```

### 2.4 재시도 / DLQ 정책

| 항목 | 정책(기본값, 조정 가능) |
|------|------------------------|
| 최대 재시도 | 5회 |
| 백오프 | 지수 백오프 + jitter (예: 2s, 8s, 30s, 2m, 8m) |
| 재시도 대상 | 일시적 오류(렌더 타임아웃, S3 5xx, Papermake 5xx) |
| 비재시도 | 스키마 검증 실패, 템플릿 없음(4xx) → 즉시 FAILED |
| DLQ 진입 | 최대 재시도 초과 → DLQ + 문서 status=FAILED + 오류코드 |
| DLQ 재처리 | 관리자 수동 재큐(requeue) 지원 |

### 2.5 멱등성

- 클라이언트가 `Idempotency-Key` 헤더(또는 body `idempotencyKey`)를 보낸다.
- `(tenantId, idempotencyKey)` 유니크. 동일 키 재요청 시:
  - 진행/완료된 동일 요청이면 **기존 documentId를 그대로 반환**(신규 생성 안 함).
  - 본문이 다른데 같은 키면 `409 Conflict`.
- 키 보존 기간: 최소 24시간(설정 가능).

---

## 3. 문서 증적과 재현 [MVP, 핵심 차별화]

각 문서마다 아래 레코드를 저장한다.

```ts
interface DocumentRenderRecord {
  documentId: string;
  tenantId: string;

  templateName: string;
  templateTag: string;      // 요청 당시 지정 태그 (예: production)
  templateHash: string;     // 실제 렌더에 쓰인 불변 매니페스트 해시

  inputHash: string;        // 입력 JSON 정규화 후 SHA-256
  outputHash: string;       // 생성된 PDF SHA-256

  storageKey: string;       // S3 객체 키
  status: 'QUEUED' | 'RENDERING' | 'SUCCEEDED' | 'FAILED';

  requestedAt: Date;
  completedAt?: Date;
  durationMs?: number;
}
```

### 3.1 답할 수 있어야 하는 질문

> **"이 PDF는 언제, 어떤 템플릿 버전과 어떤 입력 데이터로 생성됐는가?"**

- `documentId` → `templateHash` + `inputHash` + `outputHash` + 타임스탬프로 완전 추적.
- Papermake가 입력 데이터, 출력 PDF, 각 해시를 렌더 기록에 저장하는 구조와 정렬된다.
- `outputHash`로 다운로드된 PDF의 무결성 검증 가능.

### 3.2 재현(reproducibility)

- 동일 `templateHash` + 동일 정규화 입력 → 동일 `outputHash` 를 목표로 한다.
- 입력 정규화 규칙(키 정렬, 공백/인코딩 통일, 타임존 고정)을 문서화하여 해시 안정성을 확보한다.
- 폰트/렌더러 버전도 증적에 포함(렌더러 버전 pin).

---

## 4. PDF/A 생성 [MVP]

전자문서 장기 보관을 고려해 PDF/A-2b 또는 PDF/A-3b를 선택할 수 있게 한다.

```json
{
  "template": "certificate:latest",
  "pdfStandard": "a-3b",
  "data": { "name": "홍길동" }
}
```

| 값 | 용도 |
|----|------|
| `pdf-1.7` | 일반 PDF (기본값) |
| `a-2b` | 장기 보관용 PDF/A |
| `a-3b` | 첨부 파일 임베드 가능 PDF/A (전자세금계산서 등) |

Papermake의 HTTP 렌더링이 PDF 1.7, PDF/A-2b, PDF/A-3b를 지원하므로 그대로 위임한다.

---

## 5. Webhook [차별화]

- 문서/배치 상태 변화(SUCCEEDED, FAILED) 시 등록된 `callbackUrl`로 이벤트 발송.
- 서명 헤더로 위변조 방지:

```
X-Webhook-Signature: sha256=<HMAC(secret, timestamp + "." + body)>
X-Webhook-Timestamp: 1784772000
```

- 재시도 정책(수신자 5xx 시 지수 백오프), 타임스탬프 허용 오차로 재전송 공격 방지.
- 상세는 [05. 보안](05-security.md) 참조.

---

## 6. 다운로드 [MVP]

- 완료 문서는 **Signed URL**로만 다운로드(직접 S3 노출 금지).
- URL 만료 시간 설정(기본 5분, 조정 가능).
- `outputHash` 동봉으로 무결성 검증 지원.

---

## 7. 관리 콘솔 (Admin UI) [MVP 최소]

Next.js 기반. 최소 기능:

- 템플릿 목록/등록/태그 관리/미리보기/diff
- 작업(문서/배치) 목록과 상태, 진행률
- 문서 상세 = 증적 뷰(템플릿 해시, 입력/출력 해시, 타임라인)
- DLQ 조회 및 재처리
- API Key 발급/폐기, Webhook 엔드포인트 등록

---

## 8. MVP 완료 정의 (Definition of Done)

아래 4대 흐름이 end-to-end로 동작하면 MVP 완료로 본다.

```
템플릿 등록
  → JSON 데이터 입력
  → 비동기 PDF 생성
  → 생성 이력 및 PDF 다운로드
```

세부 수용 기준:

- [ ] 템플릿 publish + JSON Schema 등록 + `production` 태그 승격
- [ ] `POST /v1/documents` 단건 요청 → QUEUED 즉시 응답
- [ ] 워커가 렌더 → S3 저장 → 증적 기록 → SUCCEEDED
- [ ] 멱등키 재요청 시 중복 생성 없음
- [ ] 스키마 검증 실패 시 422, 렌더 실패 시 재시도 후 DLQ
- [ ] Signed URL로 PDF 다운로드 + `outputHash` 검증
- [ ] 문서 상세에서 "언제/어떤 템플릿/어떤 입력" 질문에 응답

## 이어서 읽기

- 시스템 구성 → [02. 아키텍처](02-architecture.md)
- API 계약 → [03. API 명세](03-api.md)
