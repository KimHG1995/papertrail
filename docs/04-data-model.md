# 04. 데이터 모델

세 저장소가 각자의 강점에 맞는 데이터를 담는다. 아래 스키마는 참조 설계이며 구현 시 마이그레이션으로 확정한다.

- **PostgreSQL** — 트랜잭션/상태 (강한 일관성이 필요한 것)
- **ClickHouse** — append-only 이벤트/분석
- **S3 / MinIO** — 객체(바이너리)

---

## 4.1 PostgreSQL 스키마

### tenant
```sql
CREATE TABLE tenant (
  id           TEXT PRIMARY KEY,          -- tenant_kpec
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | SUSPENDED
  concurrency_limit INT NOT NULL DEFAULT 4,     -- 동시 렌더 제한
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### app_user (콘솔 운영자)
```sql
CREATE TABLE app_user (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT REFERENCES tenant(id),
  email      TEXT UNIQUE NOT NULL,
  role       TEXT NOT NULL,   -- OWNER | ADMIN | REVIEWER | VIEWER
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### api_key
```sql
CREATE TABLE api_key (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL,          -- 원문 미저장, 해시만
  key_prefix  TEXT NOT NULL,          -- 표시용 앞 8자
  scopes      TEXT[] NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON api_key (tenant_id);
```

### template / template_version
```sql
CREATE TABLE template (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  name        TEXT NOT NULL,          -- training-notice
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE template_version (
  id             TEXT PRIMARY KEY,
  template_id    TEXT NOT NULL REFERENCES template(id),
  manifest_hash  TEXT NOT NULL,       -- sha256:... (Papermake 매니페스트)
  schema_hash    TEXT NOT NULL,       -- JSON Schema 해시
  state          TEXT NOT NULL,       -- DRAFT|REVIEWING|APPROVED|PUBLISHED|DEPRECATED
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, manifest_hash)
);

CREATE TABLE template_tag (
  template_id    TEXT NOT NULL REFERENCES template(id),
  tag            TEXT NOT NULL,       -- production | staging | draft | 2026-v2
  manifest_hash  TEXT NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, tag)
);
```

### document (문서 작업 + 증적)
```sql
CREATE TABLE document (
  id             TEXT PRIMARY KEY,     -- doc_01JZ...
  tenant_id      TEXT NOT NULL REFERENCES tenant(id),
  batch_id       TEXT,                 -- 배치 소속이면
  idempotency_key TEXT,

  template_name  TEXT NOT NULL,
  template_tag   TEXT,
  template_hash  TEXT NOT NULL,        -- 실제 렌더에 쓰인 고정 해시

  input_hash     TEXT NOT NULL,
  output_hash    TEXT,
  pdf_standard   TEXT NOT NULL DEFAULT 'pdf-1.7',

  input_object_key TEXT,              -- 암호화 입력 원문 S3 키(선택)
  storage_key    TEXT,                -- 결과 PDF S3 키
  masked_preview JSONB,               -- { "name": "홍*동" }

  status         TEXT NOT NULL,        -- QUEUED|RENDERING|SUCCEEDED|FAILED
  error_code     TEXT,
  attempt_count  INT NOT NULL DEFAULT 0,

  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  duration_ms    INT,

  UNIQUE (tenant_id, idempotency_key)  -- 멱등성
);
CREATE INDEX ON document (tenant_id, status);
CREATE INDEX ON document (batch_id);
CREATE INDEX ON document (requested_at);
```

> `UNIQUE (tenant_id, idempotency_key)`가 멱등성의 DB 레벨 보증이다. `idempotency_key`가 NULL인 행은 유니크 제약에서 제외되도록 partial unique index로 구성한다.

### batch
```sql
CREATE TABLE batch (
  id            TEXT PRIMARY KEY,      -- batch_01JZ...
  tenant_id     TEXT NOT NULL REFERENCES tenant(id),
  template_ref  TEXT NOT NULL,
  source_csv_key TEXT,                 -- 원본 CSV S3 키
  total         INT NOT NULL,
  succeeded     INT NOT NULL DEFAULT 0,
  failed        INT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL,         -- QUEUED|RUNNING|COMPLETED|FAILED
  report_key    TEXT,
  callback_url  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
```

### webhook_endpoint / webhook_delivery
```sql
CREATE TABLE webhook_endpoint (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  url         TEXT NOT NULL,
  secret_hash TEXT NOT NULL,          -- HMAC 시크릿(해시 저장)
  events      TEXT[] NOT NULL,        -- document.succeeded 등
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_delivery (
  id            TEXT PRIMARY KEY,
  endpoint_id   TEXT NOT NULL REFERENCES webhook_endpoint(id),
  document_id   TEXT,
  event         TEXT NOT NULL,
  status        TEXT NOT NULL,        -- PENDING|DELIVERED|FAILED
  attempt_count INT NOT NULL DEFAULT 0,
  last_response_code INT,
  next_retry_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### billing (스키마만 선행)
```sql
CREATE TABLE usage_counter (
  tenant_id  TEXT NOT NULL REFERENCES tenant(id),
  period     TEXT NOT NULL,           -- 2026-07
  rendered   BIGINT NOT NULL DEFAULT 0,
  failed     BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, period)
);
```

---

## 4.2 ClickHouse 스키마 (분석/이벤트)

append-only. 개인정보 원문은 넣지 않는다(해시/코드/시간만).

### render_event
```sql
CREATE TABLE render_event (
  event_time    DateTime64(3),
  tenant_id     LowCardinality(String),
  document_id   String,
  batch_id      String,
  template_name LowCardinality(String),
  template_hash String,
  input_hash    String,
  output_hash   String,
  pdf_standard  LowCardinality(String),
  status        LowCardinality(String),  -- SUCCEEDED | FAILED
  error_code    LowCardinality(String),
  attempt       UInt8,
  duration_ms   UInt32
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_time)
ORDER BY (tenant_id, template_name, event_time);
```

### 대표 분석 쿼리 예시
- 처리시간 통계: `quantile(0.95)(duration_ms)` by template
- 템플릿별 성공률: `countIf(status='SUCCEEDED') / count()`
- 시간대별 처리량: `count()` by `toStartOfHour(event_time)`
- 오류 코드 집계: `count()` by `error_code`

집계 가속을 위해 필요 시 `AggregatingMergeTree` 기반 materialized view를 추가한다.

---

## 4.3 S3 / MinIO 오브젝트 레이아웃

```
s3://papertrail/
  templates/{tenantId}/{name}/{manifestHash}/...   # asset (Papermake 관리와 병행)
  documents/{tenantId}/{yyyy}/{mm}/{documentId}.pdf
  encrypted-input/{tenantId}/{yyyy}/{mm}/{documentId}.json.enc
  batches/{tenantId}/{batchId}/source.csv
  batches/{tenantId}/{batchId}/report.csv
```

- 결과 PDF는 Signed URL로만 접근. 버킷 퍼블릭 금지.
- 입력 원문은 저장이 필요할 때만 **암호화 후** 저장(`encrypted-input/...`). 상세는 [05. 보안](05-security.md).
- 객체 태그로 `tenantId`, `documentId` 부착 → 수명주기(lifecycle) 정책/삭제에 활용.

---

## 4.4 해시 규칙 (재현성 근간)

| 해시 | 대상 | 계산 방법 |
|------|------|-----------|
| `templateHash` | 템플릿 매니페스트 | Papermake의 콘텐츠 주소(SHA-256) 그대로 사용 |
| `inputHash` | 렌더 입력 JSON | **정규화**(키 정렬, UTF-8, 공백 제거, 타임존 고정) 후 SHA-256 |
| `outputHash` | 결과 PDF | 바이트 스트림 SHA-256 |
| `schemaHash` | JSON Schema | 정규화 후 SHA-256 |

> 정규화 규칙을 코드로 고정하고 문서화해야 `inputHash`/`outputHash`가 재현 가능해진다.

## 이어서 읽기

- 보안/PII → [05. 보안](05-security.md)
- 일정 → [06. 로드맵](06-roadmap.md)
