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

| 레이어          | 기술                                                                              |
| --------------- | --------------------------------------------------------------------------------- |
| Admin UI        | Next.js 15 (App Router, 서버 액션 기반 템플릿 등록/승인)                          |
| API Gateway     | NestJS 11 (인증, 멀티테넌트, 멱등성, Webhook, Signed URL, 레이트 리밋, 쿼터)      |
| Queue           | Redis + BullMQ (렌더 큐, DLQ, Webhook 큐) — 운영은 SQS로 대체 가능                |
| Render Worker   | NestJS 워커 (BullMQ 소비, 테넌트별 동시성 제한, Papermake 호출)                   |
| Render Engine   | [Papermake](https://github.com/rkstgr/papermake) (Rust, Axum, Typst), 공개 이미지 |
| Object Storage  | S3 / MinIO (PDF, 템플릿 asset, 원본 CSV)                                          |
| Analytics Store | ClickHouse (렌더 이벤트, 통계)                                                    |
| Metadata DB     | PostgreSQL + Drizzle ORM (테넌트, API Key, 작업 상태, 증적, Webhook)              |
| 관측성          | OpenTelemetry 트레이싱(게이트웨이→워커 전파) + Prometheus 메트릭(`/metrics`)      |

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

[`docker-compose.yml`](docker-compose.yml)로 의존 서비스를 띄웁니다. 값은 `.env`([.env.example](.env.example) 복사)로 덮어쓸 수 있고, 없으면 로컬 기본값을 사용합니다. **렌더 엔진 Papermake도 공개 이미지로 기본 스택에 포함**되어, 별도 소스 빌드 없이 실제 렌더가 동작합니다.

### 처음부터 로컬로 돌리는 순서

```bash
cp .env.example .env                       # 선택 (기본값으로도 동작)
docker compose up -d                       # postgres, redis, minio, clickhouse, papermake 전체
pnpm install                               # 의존성 설치 (최초 1회)
pnpm -r build                              # 전체 패키지/앱 빌드 (개별은 --filter)
pnpm --filter @papertrail/db db:migrate    # DB 마이그레이션 + dev 테넌트/API Key 시드
```

이어서 게이트웨이, 렌더 워커, Admin 콘솔을 각각 띄웁니다(별도 터미널). 기본 렌더 드라이버는 `PAPERMAKE_DRIVER=http`라서, 위 스택의 Papermake를 실제로 호출합니다.

```bash
pnpm --filter @papertrail/gateway dev   # API 게이트웨이 (http://localhost:3000, prefix /v1)
pnpm --filter @papertrail/worker dev    # 렌더 워커 (렌더 큐 소비 → Papermake 렌더 → 증적 갱신)
pnpm --filter @papertrail/admin dev     # Admin 콘솔 (http://localhost:3001)
```

> **다시 켤 때:** `docker compose down -v`로 볼륨까지 지웠다면 데이터가 초기화되므로 `db:migrate`를 다시 실행해야 합니다. `docker compose stop` / `start`로 볼륨을 유지했다면 마이그레이션은 생략해도 됩니다.

문서 API 는 API Key 인증이 필요합니다(`Authorization: Bearer <key>`). 마이그레이션이 로컬 개발용 키(`pt_dev_papertrail_local_key`, `tenant_dev` 소속)를 시드합니다.

```bash
curl -X POST http://localhost:3000/v1/documents \
  -H 'Authorization: Bearer pt_dev_papertrail_local_key' \
  -H 'Content-Type: application/json' \
  -d '{"template":"training-notice:2026-v2","document":{"title":"교육 통지"},"pdfStandard":"a-3b"}'
```

| 서비스     | 호스트 포트                  | 용도                           | 기본 자격증명              |
| ---------- | ---------------------------- | ------------------------------ | -------------------------- |
| PostgreSQL | 5432                         | 상태, 증적, 멱등성             | `papertrail`/`papertrail`  |
| Redis      | 6379                         | BullMQ 큐/DLQ                  | (없음)                     |
| MinIO      | 9000 (API), 9001 (콘솔)      | S3 호환 오브젝트 스토리지      | `minioadmin`/`minioadmin`  |
| ClickHouse | 8123 (HTTP), 9009 (네이티브) | 렌더 이벤트, 통계 집계         | `papermake`/`papermake123` |
| Papermake  | 3100                         | 렌더 엔진 (Typst → PDF, PDF/A) | 공개 이미지, S3+ClickHouse |

- 시작 시 MinIO 버킷 `papertrail`, `papermake` 와 ClickHouse `papertrail` 데이터베이스가 자동 생성됩니다.
- **Papermake**는 공개 이미지 [`ghcr.io/rkstgr/papermake`](https://github.com/rkstgr/papermake)를 사용하므로 소스 빌드가 필요 없습니다. 태그는 `PAPERMAKE_IMAGE_TAG`(기본 `v0.3.0`)로 고정할 수 있습니다.
- 렌더 드라이버는 `PAPERMAKE_DRIVER`로 고릅니다. `http`(기본, 실제 Papermake 호출)와 `fake`(Papermake 없이 결정적 가짜 렌더로 파이프라인만 검증)가 있습니다. Papermake를 띄우지 않고 가볍게 돌리려면 `PAPERMAKE_DRIVER=fake`로 두세요.

---

## 참고로 알아둘 점

- **Node 버전:** 엔진 요구는 `>=24`(LTS 고정)입니다. 로컬 Node가 22 등 하위 버전이면 pnpm이 `Unsupported engine` 경고를 내지만, 빌드/실행/동작에는 영향이 없습니다. 경고를 없애려면 `mise install` 또는 `nvm use`로 24에 맞추세요.
- **검증 방식:** 현재 자동화된 단위/통합 테스트 스위트는 없고, 검증은 실제 스택을 띄워 종단(E2E)으로 확인합니다(등록 → 승인 → 비동기 렌더 → 다운로드 → 재현성 검증). 상시 회귀 편입은 아래 TODO 참조.
- **검증 완료 범위:** 실제 Papermake로 PDF/A(a-3b) 렌더, 서명 다운로드 URL, 재현성 검증(동일 입력 재렌더 시 outputHash 일치), Admin 등록/승인(서버 액션)까지 로컬에서 종단 통과했습니다.
- **포트:** 게이트웨이 3000, Admin 3001, Papermake 3100을 씁니다. 충돌 시 `.env`(`PORT`, `PAPERMAKE_PORT`) 또는 실행 옵션으로 바꾸세요.
- **로컬 시크릿:** `pt_dev_papertrail_local_key`(테넌트 `tenant_dev`)와 입력 암호화 키(`INPUT_ENCRYPTION_KEY`)는 개발용 시드 값입니다. 운영에서는 반드시 교체하세요.

---

## 상태

🟢 **M1 코어 완료, M2 진행 중.** 아래 기능이 로컬에서 종단 동작합니다(실제 Papermake 렌더 포함). 전체 마일스톤은 [06. 로드맵](docs/06-roadmap.md) 참조.

### 공용 계약, 게이트웨이

- 표준 통신 프로토콜(Zod 검증, `{success,data,meta}` 성공 봉투, RFC 7807 문제+json 에러, `traceId`)
- API Key 인증, 멀티테넌트 격리, 테넌트별 레이트 리밋(429 + `Retry-After`), 월 렌더 쿼터(`GET /v1/usage`)
- 공용 계약 패키지 `@papertrail/contracts`(Zod 스키마 + 타입)

### 템플릿, 렌더 파이프라인

- 템플릿 등록(publish) → 승인 워크플로(DRAFT→REVIEWING→APPROVED→PUBLISHED, PUBLISHED만 렌더)
- 입력 JSON Schema 검증, 템플릿 미리보기(발행 전 동기 렌더)
- 문서 단건(`POST /v1/documents`), CSV 대량(`POST /v1/batches`), 멱등성 보장
- 비동기 렌더(BullMQ 큐 + DLQ + 재시도), 테넌트별 동시성 제한
- 실제 Papermake 렌더 + PDF/A(a-2b, a-3b) 변환, S3 저장, Signed URL 다운로드

### 증적, 보안, 관측성

- 재현성 검증(동일 입력 재렌더 → outputHash 대조), 운영 감사 로그(변경 요청 자동 기록)
- PII 마스킹(입력 원문 미저장, 마스킹 미리보기만) + 입력 원문 암호화 저장(AES-256-GCM 옵트인 → 서버 단독 재현 검증)
- HMAC 서명 Webhook 발송(재시도, 추적), ClickHouse 렌더 이벤트 적재 + 통계 API
- 분산 트레이싱(OpenTelemetry, 게이트웨이→워커 전파), Prometheus 메트릭(`/metrics`)

### Admin 콘솔 (Next.js)

- 서버 렌더 대시보드(사용량, 통계), 감사 로그 조회
- 템플릿 등록 폼 + 승인 워크플로 UI(서버 액션 기반, API Key는 서버에만 보관)

---

## TODO (남은 작업)

- [ ] 자동화 테스트 스위트: 라이브 E2E 스크립트를 리포지토리 안(vitest 또는 `scripts/e2e`)으로 편입해 `pnpm test`로 상시 실행
- [ ] CI 파이프라인: `pnpm run check` + E2E를 GitHub Actions에서 실행
- [ ] Papermake 데이터 바인딩 예제 템플릿(입력 JSON을 실제 Typst에 주입)과 한글 폰트 설정
- [ ] Admin: 템플릿 미리보기 연동, 문서/배치 조회 화면, 로그인/권한
- [ ] 운영 배포(로컬 compose → 실제 환경), 시크릿 관리, 관측성 수집기(OTLP) 연결

---

## 라이선스

[MIT](LICENSE)
