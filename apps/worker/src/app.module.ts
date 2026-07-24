import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisConnection } from './common/redis.js';
import { DatabaseModule } from './database/database.module.js';
import { RenderModule } from './render/render.module.js';
import { StorageModule } from './storage/storage.module.js';

/**
 * 렌더 워커 루트 모듈. ConfigModule/BullMQ(Redis)/DatabaseModule 를 구성하고
 * 렌더 컨슈머 모듈을 로드한다. HTTP 서버 없이 애플리케이션 컨텍스트로 동작한다.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(config.getOrThrow<string>('REDIS_URL')),
      }),
    }),
    DatabaseModule,
    StorageModule,
    RenderModule,
  ],
})
export class AppModule {}
