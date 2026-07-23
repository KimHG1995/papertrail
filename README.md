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

| 문서 | 내용 |
|------|------|
| [00. 개요, 배경, 포지셔닝](docs/00-overview.md) | 문제 정의, 왜 PaperTrail인가, 용어 |
| [01. 기능 명세](docs/01-spec.md) | MVP 4대 흐름 + 차별화 기능, 상세 요구사항 |
| [02. 아키텍처](docs/02-architecture.md) | 시스템 구성, 렌더 파이프라인, DB 역할 분리 |
| [03. API 명세](docs/03-api.md) | REST 엔드포인트, 요청/응답, 상태 전이 |
| [04. 데이터 모델](docs/04-data-model.md) | PostgreSQL, ClickHouse, S3 스키마 |
| [05. 보안, 멀티테넌트, 개인정보](docs/05-security.md) | 인증, 테넌트 격리, Webhook 서명, PII 처리 |
| [06. 로드맵, 마일스톤](docs/06-roadmap.md) | 단계별 범위, 완료 정의 |

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Admin UI | Next.js (템플릿/작업/이력 관리) |
| API Gateway | NestJS (인증, 멀티테넌트, 멱등성, Webhook, Signed URL) |
| Queue | SQS + DLQ (또는 로컬 대체: Redis/BullMQ) |
| Render Worker | NestJS/Node 워커 → Papermake 호출, 동시성 제한 |
| Render Engine | [Papermake](https://github.com/rkstgr/papermake) (Rust, Axum, Typst) |
| Object Storage | S3 / MinIO (PDF, 템플릿 asset, 원본 CSV) |
| Analytics Store | ClickHouse (렌더 이벤트, 통계) |
| Metadata DB | PostgreSQL (테넌트, API Key, 작업 상태, Webhook) |

---

## 상태

🟡 **명세 단계 (Spec)** — 현재 리포지토리는 제품/기술 명세서를 정의하는 단계입니다. 구현 마일스톤은 [06. 로드맵](docs/06-roadmap.md) 참조.

## 라이선스

[MIT](LICENSE)
