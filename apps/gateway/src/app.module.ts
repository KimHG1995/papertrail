import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor.js';
import { redisConnection } from './common/redis.js';
import { DatabaseModule } from './database/database.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { HealthModule } from './health/health.module.js';
import { StorageModule } from './storage/storage.module.js';
import { TemplatesModule } from './templates/templates.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';

/**
 * 게이트웨이 루트 모듈.
 * 피처 모듈을 import 하고, 표준 통신 프로토콜의 전역 컴포넌트
 * (응답 정형화 인터셉터, 예외 필터)를 여기서 등록한다.
 * traceId 미들웨어는 라우팅 이전에 동작해야 하므로 main.ts 의 app.use 로 등록한다.
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
    HealthModule,
    TemplatesModule,
    DocumentsModule,
    WebhooksModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
  ],
})
export class AppModule {}
