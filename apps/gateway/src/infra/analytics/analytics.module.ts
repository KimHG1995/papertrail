import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AnalyticsClient, ClickHouseAnalyticsClient } from '@papertrail/analytics';
import { ANALYTICS } from './analytics.constants.js';

/** ClickHouse 분석 클라이언트를 전역으로 제공한다(설정은 CLICKHOUSE_* 환경변수). */
@Global()
@Module({
  providers: [
    {
      provide: ANALYTICS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AnalyticsClient =>
        new ClickHouseAnalyticsClient({
          url: config.get<string>('CLICKHOUSE_URL', 'http://localhost:8123'),
          database: config.get<string>('CLICKHOUSE_DATABASE', 'papertrail'),
          username: config.get<string>('CLICKHOUSE_USER', 'papermake'),
          password: config.get<string>('CLICKHOUSE_PASSWORD', 'papermake123'),
        }),
    },
  ],
  exports: [ANALYTICS],
})
export class AnalyticsModule {}
