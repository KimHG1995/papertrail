import type { ConnectionOptions } from 'bullmq';

/** REDIS_URL(redis://[user:pass@]host:port[/db])을 BullMQ 연결 옵션으로 변환한다. */
export function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.pathname.length > 1 ? { db: Number(u.pathname.slice(1)) } : {}),
  };
}
