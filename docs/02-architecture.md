# 02. 아키텍처

## 2.1 전체 구성도

```
┌─────────────────────────┐
│ Next.js Admin           │
│ 템플릿/작업/이력 관리    │
└────────────┬────────────┘
             │ (내부 인증)
┌────────────▼────────────┐
│ NestJS API              │
│                         │
│ - 인증 / 멀티테넌트     │
│ - 문서 생성 요청         │
│ - 멱등성 처리            │
│ - Webhook 관리           │
│ - Signed URL 발급        │
└───────┬─────────┬───────┘
        │         │ enqueue
        │         ▼
        │     SQS + DLQ
        │         │ poll
        │         ▼
        │     Render Worker  (동시성 제한)
        │         │ HTTP
        ▼         ▼
┌─────────────────────────┐
│ Papermake Rust Server   │
│ Typst → PDF / PDF-A     │
└────────────┬────────────┘
             │
      ┌──────┴──────┐
      ▼             ▼
 S3 / MinIO     ClickHouse
 PDF, 템플릿    렌더링 이력
```

## 2.2 컴포넌트 책임

### Next.js Admin

- 운영자용 콘솔. 템플릿 관리, 작업 모니터링, 증적 뷰, DLQ 재처리, API Key/Webhook 관리.
- 자체 세션 인증(운영자 계정) → NestJS 내부 API 호출.

### NestJS API (게이트웨이)

Papermake를 그대로 노출하지 않고 앞단을 감싼다. 책임:

- **인증/인가**: API Key(Bearer) 검증, RBAC.
- **멀티테넌트**: `X-Tenant-Id` 기반 데이터 격리.
- **멱등성**: `Idempotency-Key` 처리로 중복 생성 차단.
- **요청 검증**: 템플릿의 JSON Schema로 입력 검증.
- **작업 분리**: 렌더를 동기 요청에서 떼어 SQS로 enqueue.
- **Webhook**: 서명 발송, 재시도.
- **Signed URL**: S3 직접 노출 없이 만료형 URL 발급.

### SQS + DLQ

- 렌더 작업 큐. 표준 큐 + DLQ(maxReceiveCount 초과 시 이동).
- 로컬/저비용 대체: Redis + BullMQ (인터페이스 추상화로 교체 가능하게).

### Render Worker

- SQS를 폴링해 렌더 실행. Papermake HTTP 호출.
- **테넌트별 동시성 제한**(quota)으로 특정 테넌트가 렌더 리소스를 독점하지 못하게 함.
- 렌더 → PDF/A 변환 → S3 저장 → 해시 계산 → 상태 갱신 → ClickHouse 이벤트 적재 → Webhook 트리거.
- 실패 시 재시도/backoff, 초과 시 DLQ.

### Papermake Rust Server

- 실제 Typst → PDF/PDF-A 렌더링 엔진.
- 콘텐츠 주소(SHA-256) 템플릿 레지스트리, 렌더 입력/출력 해시 기록.
- PaperTrail은 이 위에 계약/거버넌스/멀티테넌시를 얹는다.

## 2.3 렌더 파이프라인 (상세)

```
[API] 수신
  1. 인증 + 테넌트 확인
  2. 멱등키 조회 (중복 → 기존 결과 반환, 종료)
  3. 템플릿 참조 해석 (tag → manifest hash)
  4. JSON Schema 검증 (실패 → 422)
  5. 입력 정규화 → inputHash 계산
  6. 입력 원문 처리 (PII: 암호화 저장 or 폐기, 마스킹 프리뷰 생성)
  7. Document 레코드 생성 (status=QUEUED)
  8. SQS enqueue { documentId, tenantId, manifestHash, inputRef, pdfStandard }
  9. 202 응답 { documentId, status, statusUrl }

[Worker] 처리
  10. dequeue, status=RENDERING
  11. Papermake 렌더 (manifest hash + data + pdf_standard)
  12. outputHash 계산, S3 업로드 (storageKey)
  13. status=SUCCEEDED, completedAt, durationMs
  14. ClickHouse render_event 적재
  15. Webhook 발송 (서명 포함)

[실패 경로]
  - 일시 오류: 재시도 (backoff) → 초과 시 DLQ + status=FAILED
  - 영구 오류(4xx): 즉시 status=FAILED + 오류코드 + Webhook(FAILED)
```

## 2.4 DB 역할 분리

각 저장소는 강점에 맞는 데이터만 담는다.

### PostgreSQL (또는 MySQL) — 트랜잭션/상태

- 사용자, 조직/테넌트
- API Key
- 문서/배치 작업 상태
- Webhook 엔드포인트/시크릿
- 권한(RBAC)
- 과금 정보(스키마만 선행)

### ClickHouse — 분석/이벤트

- 렌더링 이벤트(append-only)
- 처리시간 통계
- 템플릿별 성공률
- 시간대별 처리량
- 오류 코드 집계

### S3 / MinIO — 객체

- PDF 결과물
- 템플릿 asset(로고, 이미지, 폰트)
- (선택) 암호화된 렌더 입력 원문
- 원본 CSV(배치)

> Papermake도 기본적으로 S3 계열 저장소와 ClickHouse를 사용하는 구조이므로 인프라가 자연스럽게 정렬된다.

## 2.5 왜 이 경계인가

- **트랜잭션 vs 분석 분리**: 상태 전이는 RDB, 대량 append/집계는 ClickHouse.
- **Papermake 캡슐화**: 렌더 엔진 교체/버전업이 API 계약에 영향을 주지 않도록 게이트웨이가 흡수.
- **큐 추상화**: SQS ↔ BullMQ 교체 가능하게 포트/어댑터로 분리 → 로컬 개발/클라우드 배포 모두 지원.
- **워커 격리**: 렌더는 CPU 집약적이므로 API 프로세스와 분리해 독립 스케일.

## 2.6 배포 토폴로지(예시)

| 환경     | 구성                                                                                        |
| -------- | ------------------------------------------------------------------------------------------- |
| 로컬     | docker-compose: NestJS + Worker + Papermake + MinIO + ClickHouse + Postgres + Redis(BullMQ) |
| 클라우드 | ECS/Fargate(API, Worker) + SQS + S3 + RDS(Postgres) + ClickHouse Cloud + Papermake 컨테이너 |

## 이어서 읽기

- API 계약 → [03. API 명세](03-api.md)
- 스키마 → [04. 데이터 모델](04-data-model.md)
