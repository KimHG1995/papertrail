-- 로컬 dev API Key 에 webhooks 스코프를 추가한다(엔드포인트 등록/조회 사용).
UPDATE "api_key"
SET "scopes" = ARRAY[
  'documents:read', 'documents:write',
  'templates:read', 'templates:write',
  'webhooks:read', 'webhooks:write'
]
WHERE "id" = 'apikey_dev';
