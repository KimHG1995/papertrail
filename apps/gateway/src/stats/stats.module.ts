import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller.js';
import { StatsService } from './stats.service.js';

/** 통계 모듈. AnalyticsClient(전역)로 ClickHouse 집계를 조회한다. */
@Module({
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
