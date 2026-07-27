import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

/** 관측성 모듈. MetricsService 는 전역 MetricsInterceptor 에서도 쓰이므로 export 한다. */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
