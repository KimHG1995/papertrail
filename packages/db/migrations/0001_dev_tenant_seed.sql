-- 로컬 개발 부트스트랩: 기본 테넌트.
-- 인증/테넌트 미들웨어가 붙기 전(M1) 게이트웨이가 사용하는 DEFAULT_TENANT_ID 와 일치한다.
-- 재적용/운영 환경에서도 안전하도록 멱등(ON CONFLICT DO NOTHING)하게 둔다.
INSERT INTO "tenant" ("id", "name", "status", "concurrency_limit")
VALUES ('tenant_dev', 'Local Dev Tenant', 'ACTIVE', 4)
ON CONFLICT ("id") DO NOTHING;
