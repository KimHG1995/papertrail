import { Global, Module } from '@nestjs/common';
import { UsageController } from './usage.controller.js';
import { UsageService } from './usage.service.js';

/** 사용량/쿼터 모듈. UsageService 는 문서/배치 생성 시 쿼터 강제에도 쓰이므로 전역 export 한다. */
@Global()
@Module({
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
