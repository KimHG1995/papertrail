import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

/** 헬스체크 모듈. */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
