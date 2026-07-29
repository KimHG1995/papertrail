import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FakePapermakeClient,
  HttpPapermakeClient,
  type PapermakeClient,
} from '@papertrail/papermake-client';
import { PAPERMAKE_CLIENT } from './papermake.constants.js';

/**
 * PAPERMAKE_DRIVER 로 렌더 클라이언트를 고른다.
 * - fake (기본): Papermake(Rust) 없이 파이프라인을 돌리는 결정적 가짜 렌더러
 * - http: 실제 Papermake 서버 호출(PAPERMAKE_URL 필요)
 */
export const papermakeClientProvider: Provider = {
  provide: PAPERMAKE_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): PapermakeClient => {
    const driver = config.get<string>('PAPERMAKE_DRIVER', 'http');
    const logger = new Logger('PapermakeClient');
    if (driver === 'fake') {
      logger.log('fake 드라이버 사용(Papermake 없이 로컬 개발)');
      return new FakePapermakeClient();
    }
    const baseUrl = config.get<string>('PAPERMAKE_URL', 'http://localhost:3100');
    logger.log(`http 드라이버 사용: ${baseUrl}`);
    return new HttpPapermakeClient({ baseUrl });
  },
};
