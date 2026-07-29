import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/**
 * 고정 윈도우 카운터. 첫 요청에서 윈도우 만료(PEXPIRE)를 설정하고 이후 INCR 한다.
 * KEYS[1]=키, ARGV[1]=윈도우(ms). 반환 [count, ttlMs].
 */
const HIT_LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {c, redis.call('PTTL', KEYS[1])}
`;

interface RateRedis extends Redis {
  rateHit(key: string, windowMs: number): Promise<[number, number]>;
}

export interface RateHit {
  count: number;
  ttlMs: number;
}

/** Redis 기반 고정 윈도우 레이트 리미터. */
@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private readonly redis: RateRedis;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379')) as RateRedis;
    this.redis.defineCommand('rateHit', { numberOfKeys: 1, lua: HIT_LUA });
  }

  /** 윈도우 내 요청 수를 1 증가시키고 현재 카운트와 남은 TTL(ms)을 반환한다. */
  async hit(key: string, windowMs: number): Promise<RateHit> {
    const [count, ttlMs] = await this.redis.rateHit(key, windowMs);
    return { count, ttlMs };
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
