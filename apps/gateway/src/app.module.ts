import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard.js';
import { RateLimitGuard } from './auth/rate-limit.guard.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuditInterceptor } from './audit/audit.interceptor.js';
import { BatchesModule } from './batches/batches.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor.js';
import { RateLimiterService } from './common/rate-limiter.service.js';
import { redisConnection } from './common/redis.js';
import { DatabaseModule } from './database/database.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { HealthModule } from './health/health.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { StatsModule } from './stats/stats.module.js';
import { StorageModule } from './storage/storage.module.js';
import { TemplatesModule } from './templates/templates.module.js';
import { UsageModule } from './usage/usage.module.js';
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
    AnalyticsModule,
    AuditModule,
    MetricsModule,
    HealthModule,
    TemplatesModule,
    DocumentsModule,
    BatchesModule,
    WebhooksModule,
    StatsModule,
    UsageModule,
  ],
  providers: [
    RateLimiterService,
    // 전역 가드는 등록 순서대로 실행된다: 인증(테넌트 주입) → 레이트 리밋.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // 인터셉터는 등록 순서대로 감싼다: 응답 정형화(바깥) → 감사(안쪽, 원본 데이터 관찰).
    // 메트릭은 가드 거부까지 포착하도록 main.ts 의 미들웨어에서 기록한다.
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
