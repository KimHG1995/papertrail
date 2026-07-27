-- 로컬 dev API Key 에 감사 로그 조회 스코프(audit:read)를 추가한다.
UPDATE "api_key"
SET "scopes" = ARRAY[
  'documents:read', 'documents:write',
  'templates:read', 'templates:write', 'templates:approve',
  'webhooks:read', 'webhooks:write',
  'audit:read'
]
WHERE "id" = 'apikey_dev';
