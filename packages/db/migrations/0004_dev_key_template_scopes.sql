-- 로컬 dev API Key 에 템플릿 스코프를 추가한다(템플릿 등록/조회 사용).
UPDATE "api_key"
SET "scopes" = ARRAY['documents:read', 'documents:write', 'templates:read', 'templates:write']
WHERE "id" = 'apikey_dev';
