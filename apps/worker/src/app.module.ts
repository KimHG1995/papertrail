import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AnalyticsModule } from './infra/analytics/analytics.module.js';
import { redisConnection } from './infra/redis/redis.js';
import { DatabaseModule } from './infra/database/database.module.js';
import { RenderModule } from './modules/render/render.module.js';
import { StorageModule } from './infra/storage/storage.module.js';
import { WebhookModule } from './modules/webhook/webhook.module.js';

/**
 * 렌더 워커 루트 모듈. ConfigModule/BullMQ(Redis)/DatabaseModule 를 구성하고
 * 렌더 컨슈머 모듈을 로드한다. HTTP 서버 없이 애플리케이션 컨텍스트로 동작한다.
 */
@Module({
  imports: [
    // .env 없이도 로컬 도커 값(각 설정의 기본값)으로 동작한다. 루트 .env 가 있으면
    // cwd 가 apps/worker(예: pnpm --filter ... dev)든 모노레포 루트든 덮어쓴다.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(config.get<string>('REDIS_URL', 'redis://localhost:6379')),
      }),
    }),
    DatabaseModule,
    StorageModule,
    AnalyticsModule,
    WebhookModule,
    RenderModule,
  ],
})
export class AppModule {}
