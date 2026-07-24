import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/**
 * 만료된 리스를 지우고, 한도 미만이면 슬롯을 점유(리스 등록)한다. 원자적 실행을 위해 Lua.
 * KEYS[1]=키, ARGV=[now, limit, leaseMs, member]. 점유 성공 1, 실패 0.
 */
const ACQUIRE_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local leaseMs = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
if redis.call('ZCARD', key) < limit then
  redis.call('ZADD', key, now + leaseMs, member)
  redis.call('PEXPIRE', key, leaseMs * 2)
  return 1
end
return 0
`;

interface SlotRedis extends Redis {
  acquireSlot(
    key: string,
    now: number,
    limit: number,
    leaseMs: number,
    member: string,
  ): Promise<number>;
}

/**
 * 테넌트별 렌더 동시성 제한(분산 세마포어). Redis 정렬셋에 리스(만료 시각 score)를 등록해
 * 동시에 점유된 슬롯 수를 한도 이하로 유지한다. 워커 크래시로 release 를 못 해도
 * 리스가 만료되면(leaseMs) 자동 회수되어 슬롯이 영구 누수되지 않는다.
 */
@Injectable()
export class TenantConcurrencyService implements OnModuleDestroy {
  private readonly redis: SlotRedis;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.getOrThrow<string>('REDIS_URL')) as SlotRedis;
    this.redis.defineCommand('acquireSlot', { numberOfKeys: 1, lua: ACQUIRE_LUA });
  }

  /** 슬롯 점유를 시도한다. 성공하면 true(리스 등록됨), 한도 초과면 false. */
  async tryAcquire(
    tenantId: string,
    member: string,
    limit: number,
    leaseMs: number,
  ): Promise<boolean> {
    const acquired = await this.redis.acquireSlot(
      this.key(tenantId),
      Date.now(),
      limit,
      leaseMs,
      member,
    );
    return acquired === 1;
  }

  /** 점유한 슬롯을 반환한다. */
  async release(tenantId: string, member: string): Promise<void> {
    await this.redis.zrem(this.key(tenantId), member);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  private key(tenantId: string): string {
    return `papertrail:tenant-render-slots:${tenantId}`;
  }
}
