import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

/**
 * 연결 문자열로 Drizzle 클라이언트를 생성한다.
 *
 * node-postgres 풀은 지연 연결이라 생성 시점에는 DB 에 접속하지 않는다(첫 쿼리 때 연결).
 * 풀은 반환된 인스턴스의 `db.$client` 로 접근할 수 있어 종료 시 정리한다.
 */
export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema, casing: 'snake_case' });
}

/** 애플리케이션에서 주입해 사용하는 Drizzle 인스턴스 타입. */
export type Database = ReturnType<typeof createDatabase>;
