import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RENDER_QUEUE } from '@papertrail/contracts';
import { TemplatesModule } from '../templates/templates.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

/** 문서 생성/조회 모듈. 렌더 큐 프로듀서를 등록하고 템플릿 해석/검증을 위해 TemplatesModule 을 쓴다. */
@Module({
  imports: [BullModule.registerQueue({ name: RENDER_QUEUE }), TemplatesModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
