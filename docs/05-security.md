# 05. 보안, 멀티테넌트, 개인정보

Papermake를 그대로 외부에 노출하지 않고 NestJS 게이트웨이가 앞단을 감싼다. 보안 책임은 대부분 이 계층에 있다.

## 5.1 인증 (Authentication)

### API Key (서버 대 서버)

```
Authorization: Bearer pk_live_xxx...
X-Tenant-Id: tenant_kpec
```

- 키 원문은 저장하지 않는다. 발급 시 1회 노출, DB에는 `key_hash`(예: SHA-256/Argon2)만 저장.
- 표시용 `key_prefix`(앞 8자)로 콘솔에서 식별.
- 폐기(revoke)는 즉시 반영. `last_used_at`로 미사용 키 탐지.

### 콘솔 사용자

- Admin UI는 별도 세션 인증(운영자 계정). API Key와 분리.

## 5.2 인가 / 멀티테넌트 (Authorization)

- 모든 요청은 API Key ↔ `X-Tenant-Id` 매칭을 강제. 불일치 시 403.
- **모든 DB 쿼리에 `tenant_id` 조건을 강제**(리포지토리 레이어에서 자동 주입) → 테넌트 간 데이터 누출 차단.
- S3 키/오브젝트 태그에 `tenantId` 포함 → 크로스 테넌트 접근 방지.
- RBAC 역할:

| 역할     | 권한                           |
| -------- | ------------------------------ |
| OWNER    | 전체(키/과금/삭제 포함)        |
| ADMIN    | 템플릿/작업/Webhook 관리       |
| REVIEWER | 템플릿 상태 전이(APPROVED까지) |
| VIEWER   | 조회만                         |

- 템플릿 승인 워크플로 전이는 역할로 통제:
  - `REVIEWING → APPROVED`: REVIEWER 이상
  - `APPROVED → PUBLISHED`(production 태그 이동): ADMIN 이상

## 5.3 멱등성 (중복 생성 방지)

```
Idempotency-Key: document-10001
```

- `(tenant_id, idempotency_key)` DB 유니크 제약이 최종 방어선.
- 동일 키 + 동일 본문 → 기존 결과 반환. 동일 키 + 다른 본문 → 409.
- 상세 흐름은 [01. 기능 명세 §2.5](01-spec.md) 참조.

## 5.4 Webhook 서명 (무결성 + 재전송 방지)

발송 헤더:

```
X-Webhook-Signature: sha256=<HMAC_SHA256(secret, timestamp + "." + rawBody)>
X-Webhook-Timestamp: 1784772000
```

수신자 검증 절차:

1. `X-Webhook-Timestamp`가 현재 시각 ±5분 이내인지 확인(재전송 공격 방지).
2. `HMAC_SHA256(secret, timestamp + "." + rawBody)` 를 재계산.
3. 상수시간 비교(timing-safe)로 서명 일치 확인.

발송 정책:

- 수신자 2xx가 아니면 지수 백오프 재시도(예: 1m, 5m, 30m, 2h).
- 최대 재시도 초과 시 `webhook_delivery.status=FAILED`, 콘솔에서 수동 재발송.

## 5.5 개인정보(PII) 보호

렌더 입력 원문 전체를 분석/통계 목적으로 그대로 저장하지 않는다. 대신:

```json
{
  "inputHash": "sha256:...",
  "inputObjectKey": "encrypted-input/2026/07/...",
  "maskedPreview": { "name": "홍*동", "phone": "010-****-1234" }
}
```

원칙:

1. **분석/통계 데이터에는 해시/코드/시간만.** 원문 금지.
2. **입력 원문 저장은 필요할 때만**, 그리고 항상 **암호화**(S3 SSE-KMS 또는 앱단 봉투암호화)하여 `encrypted-input/...`에 보관.
3. **마스킹 프리뷰**만 RDB(`document.masked_preview`)에 저장(이름/전화 등 부분 마스킹).
4. **최소 수집/최소 보관**: 재현이 불필요한 테넌트는 입력 원문을 렌더 후 폐기(해시만 유지).
5. **보관 주기(retention)**: 입력 원문/결과 PDF에 lifecycle 정책 적용(예: 입력 원문 N일 후 삭제).
6. **삭제 요청 대응**: `documentId`/`tenantId` 태그로 대상 오브젝트 식별 및 파기.

> 재현성과 개인정보 보호는 긴장 관계다. PaperTrail은 "해시로 무결성/추적은 항상 보장하되, 원문 보관은 정책적으로 최소화"하는 절충을 택한다.

## 5.6 저장/전송 암호화

- 전송: 모든 API/Webhook은 HTTPS.
- 저장: S3 SSE(KMS), RDB 컬럼 암호화(민감 필드), 통계 테이블은 PII 미보관 원칙.
- 시크릿(API Key/Webhook secret)은 해시 저장, 원문 미보관.

## 5.7 레이트 리밋 / 쿼터

- 테넌트별 요청 레이트 리밋(429 + `Retry-After`).
- 테넌트별 렌더 동시성 제한(`tenant.concurrency_limit`)으로 워커 자원 공정 분배.

## 5.8 감사 로그 (운영 관점)

- 관리 액션(키 발급/폐기, 템플릿 상태 전이, DLQ 재처리)은 별도 audit log에 who/what/when 기록.
- 문서 증적(§3.5)과 구분: 문서 증적 = "무엇으로 만들었나", 운영 감사 = "누가 무엇을 했나".

## 이어서 읽기

- 일정/마일스톤 → [06. 로드맵](06-roadmap.md)
