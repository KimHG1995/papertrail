import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit 설정. 스키마는 단일 파일(src/schema.ts)이라 상대 import 가 없어
 * drizzle-kit(esbuild) 로딩과 NodeNext(.js 확장자) 규칙이 충돌하지 않는다.
 *
 * - generate: DB 없이 마이그레이션 SQL 을 만든다.
 * - migrate:  DATABASE_URL 로 마이그레이션을 적용한다(docker compose 기동 후).
 */
export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://papertrail:papertrail@localhost:5432/papertrail',
  },
});
