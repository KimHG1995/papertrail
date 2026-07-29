import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthGuard } from './modules/auth/auth.guard.js';
import { RateLimitGuard } from './modules/auth/rate-limit.guard.js';
import { AnalyticsModule } from './infra/analytics/analytics.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuditInterceptor } from './modules/audit/audit.interceptor.js';
import { BatchesModule } from './modules/batches/batches.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor.js';
import { RateLimiterService } from './common/services/rate-limiter.service.js';
import { redisConnection } from './infra/redis/redis.js';
import { DatabaseModule } from './infra/database/database.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MetricsModule } from './modules/metrics/metrics.module.js';
import { StatsModule } from './modules/stats/stats.module.js';
import { StorageModule } from './infra/storage/storage.module.js';
import { TemplatesModule } from './modules/templates/templates.module.js';
import { UsageModule } from './modules/usage/usage.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';

/**
 * 게이트웨이 루트 모듈.
 * 피처 모듈을 import 하고, 표준 통신 프로토콜의 전역 컴포넌트
 * (응답 정형화 인터셉터, 예외 필터)를 여기서 등록한다.
 * traceId 미들웨어는 라우팅 이전에 동작해야 하므로 main.ts 의 app.use 로 등록한다.
 */
@Module({
  imports: [
    // .env 없이도 로컬 도커 값(각 설정의 기본값)으로 동작한다. 루트 .env 가 있으면
    // cwd 가 apps/gateway(예: pnpm --filter ... dev)든 모노레포 루트든 덮어쓴다.
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
