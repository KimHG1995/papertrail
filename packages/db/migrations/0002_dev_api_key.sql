-- 로컬 개발 부트스트랩: tenant_dev 용 API Key.
-- 평문 키(로컬 전용, 커밋해도 무방): pt_dev_papertrail_local_key
-- 저장은 SHA-256 해시만(원문 미저장). documents 읽기/쓰기 스코프 부여.
-- 운영에는 이 키가 없어야 하며, 재적용 안전을 위해 멱등(ON CONFLICT DO NOTHING)하게 둔다.
INSERT INTO "api_key" ("id", "tenant_id", "name", "key_hash", "key_prefix", "scopes")
VALUES (
  'apikey_dev',
  'tenant_dev',
  'Local Dev Key',
  '3a724dc75ec9f761333fce4ae6a7a0cafa261be57560cb989e99942582f352d5',
  'pt_dev_p',
  ARRAY['documents:read', 'documents:write']
)
ON CONFLICT ("id") DO NOTHING;
