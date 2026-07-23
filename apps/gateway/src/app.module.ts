import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { ResponseTransformInterceptor } from './common/response-transform.interceptor.js';
import { DocumentsController } from './documents/documents.controller.js';
import { HealthController } from './health/health.controller.js';

/**
 * 게이트웨이 루트 모듈.
 * 표준 통신 프로토콜의 전역 컴포넌트(응답 정형화 인터셉터, 예외 필터)를 여기서 등록한다.
 * traceId 미들웨어는 라우팅 이전에 동작해야 하므로 main.ts 의 app.use 로 등록한다.
 */
@Module({
  controllers: [HealthController, DocumentsController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
  ],
})
export class AppModule {}
