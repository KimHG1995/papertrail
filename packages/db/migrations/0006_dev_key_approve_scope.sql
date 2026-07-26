-- 로컬 dev API Key 에 승인자 스코프(templates:approve)를 추가한다(상태 전이 사용).
UPDATE "api_key"
SET "scopes" = ARRAY[
  'documents:read', 'documents:write',
  'templates:read', 'templates:write', 'templates:approve',
  'webhooks:read', 'webhooks:write'
]
WHERE "id" = 'apikey_dev';
