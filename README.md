# PaperTrail

> **버전 관리형 전자문서 생성 및 증적(Audit Trail) 플랫폼** — 사내/공공용 공용 문서 렌더링 SaaS

PaperTrail은 각 업무 시스템이 PDF 생성 라이브러리와 렌더링 리소스를 **직접 부담하지 않도록**, 문서 생성 기능을 별도의 공용 서비스로 분리하여 **내부 SaaS** 형태로 운영하는 문서 인프라입니다.

고객(사내) 시스템은 **JSON만 전송**하면, PaperTrail이 다음을 책임집니다.

- 템플릿 버전 고정 + 입력 스키마 검증
- 비동기 대량 PDF 렌더링 (재시도, DLQ, 멱등성)
- PDF/A 장기보관 포맷 생성
- **"이 PDF는 언제, 어떤 템플릿 버전과 어떤 입력으로 만들어졌는가"** 에 답할 수 있는 증적 기록
- Webhook / Signed 다운로드 URL 반환

렌더링 엔진으로는 콘텐츠 주소 기반(SHA-256) 템플릿 레지스트리인 [Papermake](https://github.com/rkstgr/papermake)(Rust, Typst)를 사용하고, 그 앞단을 NestJS가 감싸 **인증, 멀티테넌트, 멱등성, Webhook, 증적**을 담당합니다.

---

## 핵심 컨셉

```
업무 시스템 (사내 서비스들)
  └─ POST /v1/documents  (JSON만 전송)
       ├─ template: training-notice:2026-v2   (버전 고정)
       ├─ idempotencyKey: notice-20260723-10001
       ├─ recipient / document 데이터
       └─ callbackUrl
            ↓
문서 생성 작업 (비동기)
  ├─ JSON Schema 검증
  ├─ Papermake 렌더링 (Typst → PDF)
  ├─ PDF/A 변환 (a-2b / a-3b)
  ├─ S3 저장 (Signed URL)
  ├─ 증적 기록 (입력/출력 해시, 템플릿 해시)
  └─ Webhook (서명 포함) / 다운로드 URL 반환
```

> **포지셔닝:** "PDF 생성 기능"이 아니라 **"문서 생성 인프라"**. 단순 렌더러가 아니라 *재현성 + 감사 추적*이 1급 기능입니다.

---

## 대표 사용 시나리오

기업, 공공기관이 다음과 같은 문서를 대량으로 생성/발송합니다.

- 교육훈련 통지서
- 민방위, 예비군 안내문
- 수료증, 확인서
- 납부 고지서
- 계약서, 동의서
- 세금계산서 보조 문서
- 발송 결과 리포트

---

## 문서 (명세서)

| 문서                                                  | 내용                                       |
| ----------------------------------------------------- | ------------------------------------------ |
| [00. 개요, 배경, 포지셔닝](docs/00-overview.md)       | 문제 정의, 왜 PaperTrail인가, 용어         |
| [01. 기능 명세](docs/01-spec.md)                      | MVP 4대 흐름 + 차별화 기능, 상세 요구사항  |
| [02. 아키텍처](docs/02-architecture.md)               | 시스템 구성, 렌더 파이프라인, DB 역할 분리 |
| [03. API 명세](docs/03-api.md)                        | REST 엔드포인트, 요청/응답, 상태 전이      |
| [04. 데이터 모델](docs/04-data-model.md)              | PostgreSQL, ClickHouse, S3 스키마          |
| [05. 보안, 멀티테넌트, 개인정보](docs/05-security.md) | 인증, 테넌트 격리, Webhook 서명, PII 처리  |
| [06. 로드맵, 마일스톤](docs/06-roadmap.md)            | 단계별 범위, 완료 정의                     |

---

## 기술 스택

| 레이어          | 기술                                                                 |
| --------------- | -------------------------------------------------------------------- |
| Admin UI        | Next.js (템플릿/작업/이력 관리)                                      |
| API Gateway     | NestJS (인증, 멀티테넌트, 멱등성, Webhook, Signed URL)               |
| Queue           | SQS + DLQ (또는 로컬 대체: Redis/BullMQ)                             |
| Render Worker   | NestJS/Node 워커 → Papermake 호출, 동시성 제한                       |
| Render Engine   | [Papermake](https://github.com/rkstgr/papermake) (Rust, Axum, Typst) |
| Object Storage  | S3 / MinIO (PDF, 템플릿 asset, 원본 CSV)                             |
| Analytics Store | ClickHouse (렌더 이벤트, 통계)                                       |
| Metadata DB     | PostgreSQL (테넌트, API Key, 작업 상태, Webhook)                     |

---

## 개발 환경 (Toolchain)

모노레포(pnpm workspace)로 구성하며, 런타임/포맷/린트/타입 도구를 고정합니다.

| 도구             | 버전/설정                                     | 비고                                             |
| ---------------- | --------------------------------------------- | ------------------------------------------------ |
| Node.js          | 24.18.0 (Active LTS 고정)                     | `mise.toml`, `.nvmrc`, `.node-version`           |
| 패키지 매니저    | pnpm 11.3.0                                   | `packageManager` 필드 + `pnpm-workspace.yaml`    |
| 언어(컴파일)     | TypeScript 7.0 네이티브 (`tsgo`)              | `@typescript/native-preview`, 타입체크           |
| 언어(도구 API)   | TypeScript 6.0 브리지 (`tsc`)                 | 에디터/ESLint용 (typescript-eslint 호환)         |
| 게이트웨이 빌드  | SWC (`nest build -b swc`)                     | 데코레이터 메타데이터 + ESM, 런타임 트랜스파일   |
| ORM/마이그레이션 | Drizzle ORM + drizzle-kit                     | `@papertrail/db`, PostgreSQL 스키마/마이그레이션 |
| 포맷터           | Prettier 3                                    | `.prettierrc.json`                               |
| 린터(코드)       | ESLint 10 + typescript-eslint 8 (flat config) | `eslint.config.mjs`, type-aware 규칙             |
| 린터(문서)       | markdownlint-cli2                             | `.markdownlint.jsonc`                            |
| 에디터           | EditorConfig                                  | `.editorconfig` (모든 IDE 공통)                  |

> **TypeScript 7 side-by-side:** TS 7.0은 Go 네이티브 포트라 타입체크는 `tsgo`(TS 7)로 수행하고, ESLint(typescript-eslint)와 에디터 언어 서비스는 아직 TS 7 API를 지원하지 않아 브리지 릴리스인 TS 6.0을 함께 사용합니다. NestJS 게이트웨이는 데코레이터 메타데이터 방출이 필요해 런타임 트랜스파일을 SWC가 담당합니다(타입체크는 동일하게 tsgo). typescript-eslint가 TS 7을 지원하면 `typescript`를 7로 올리고 `@typescript/native-preview`를 정리하면 됩니다.

```bash
# 버전 매니저로 런타임 맞추기 (택1)
mise install          # mise 사용자 (node + pnpm 자동 설치)
nvm use               # nvm 사용자 (.nvmrc 기준 Node 설치/전환)

corepack enable       # pnpm 활성화 (mise 미사용 시)
pnpm install          # 의존성 설치

pnpm run format       # Prettier 포맷
pnpm run lint         # ESLint (코드)
pnpm run lint:md      # markdownlint (문서)
pnpm run typecheck    # 타입 검사 (각 패키지 tsgo, 재귀)
pnpm run check        # format:check + lint + lint:md + typecheck 일괄
```

로컬 인프라(Postgres, Redis, MinIO, ClickHouse, Papermake)는 `docker compose up -d`로 띄웁니다. 자세한 내용은 아래 [로컬 개발 인프라](#로컬-개발-인프라) 참조.

---

## 로컬 개발 인프라

[`docker-compose.yml`](docker-compose.yml)로 의존 서비스를 띄웁니다. 값은 `.env`([.env.example](.env.example) 복사)로 덮어쓸 수 있고, 없으면 로컬 기본값을 사용합니다.

```bash
cp .env.example .env                       # 선택 (기본값으로도 동작)
docker compose up -d                       # postgres, redis, minio, clickhouse + 버킷 생성
pnpm --filter @papertrail/db db:migrate    # DB 스키마 마이그레이션 적용 (+ dev 테넌트 시드)
```

그다음 게이트웨이와 렌더 워커를 각각 띄웁니다(별도 터미널). 워커는 기본값 `PAPERMAKE_DRIVER=fake`로 Papermake(Rust) 없이 파이프라인 전체를 돌립니다.

```bash
pnpm --filter @papertrail/gateway dev   # API 게이트웨이 (http://localhost:3000, prefix /v1)
pnpm --filter @papertrail/worker dev    # 렌더 워커 (렌더 큐 소비 → Papermake 호출 → 증적 갱신)
```

문서 API 는 API Key 인증이 필요합니다(`Authorization: Bearer <key>`). 마이그레이션이 로컬 개발용 키(`pt_dev_papertrail_local_key`, `tenant_dev` 소속)를 시드합니다.

```bash
curl -X POST http://localhost:3000/v1/documents \
  -H 'Authorization: Bearer pt_dev_papertrail_local_key' \
  -H 'Content-Type: application/json' \
  -d '{"template":"training-notice:2026-v2","document":{"title":"교육 통지"}}'
```

| 서비스     | 호스트 포트                  | 용도                           | 기본 자격증명              |
| ---------- | ---------------------------- | ------------------------------ | -------------------------- |
| PostgreSQL | 5432                         | 상태, 증적, 멱등성             | `papertrail`/`papertrail`  |
| Redis      | 6379                         | BullMQ 큐/DLQ                  | (없음)                     |
| MinIO      | 9000 (API), 9001 (콘솔)      | S3 호환 오브젝트 스토리지      | `minioadmin`/`minioadmin`  |
| ClickHouse | 8123 (HTTP), 9009 (네이티브) | 렌더 이벤트, 통계 집계         | `papermake`/`papermake123` |
| Papermake  | 3100                         | 렌더 엔진 (profile: papermake) | S3+ClickHouse 사용         |

- 시작 시 MinIO 버킷 `papertrail`, `papermake` 와 ClickHouse `papertrail` 데이터베이스가 자동 생성됩니다.
- **Papermake**는 공개 이미지가 없어 소스에서 빌드하며(무겁고 ClickHouse를 요구), 기본 기동에서 제외됩니다. 필요할 때만:

  ```bash
  git clone https://github.com/rkstgr/papermake third_party/papermake
  docker compose --profile papermake up -d
  ```

---

## 상태

🟢 **M1 코어 완료, M2 진행 중** — 공용 계약 패키지(`@papertrail/contracts`), NestJS 게이트웨이(표준 통신 프로토콜 + API Key 인증/테넌트 격리 + 템플릿 등록/JSON Schema 검증 + Webhook 등록), 영속성 계층(`@papertrail/db`, Drizzle ORM), 비동기 렌더 파이프라인(BullMQ 큐 + `@papertrail/worker` 렌더 워커 + 테넌트별 동시성 제한 + `@papertrail/papermake-client`), 오브젝트 스토리지(`@papertrail/storage`, S3/MinIO), HMAC 서명 Webhook 발송(재시도/추적)까지 구성했습니다. `Bearer` 인증 → 템플릿 등록(publish) → `POST /v1/documents`(입력 JSON Schema 검증) → PostgreSQL 증적 저장(멱등성) → 큐 적재 → 워커 렌더(재시도/DLQ) → 결과 PDF S3 저장 → `GET /v1/documents/{id}/download` Signed URL → 완료 시 Webhook 발송 흐름이 로컬에서 동작합니다. 구현 마일스톤은 [06. 로드맵](docs/06-roadmap.md) 참조.

## 라이선스

[MIT](LICENSE)
