import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RENDER_QUEUE } from '@papertrail/contracts';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

/** 문서 생성/조회 모듈. 렌더 큐 프로듀서를 등록한다. */
@Module({
  imports: [BullModule.registerQueue({ name: RENDER_QUEUE })],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
