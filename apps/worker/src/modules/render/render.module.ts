import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RENDER_DLQ, RENDER_QUEUE } from '@papertrail/contracts';
import { BatchService } from '../batch/batch.service.js';
import { TenantConcurrencyService } from '../concurrency/tenant-concurrency.service.js';
import { UsageService } from '../usage/usage.service.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { papermakeClientProvider } from '../../infra/papermake/papermake.provider.js';
import { RenderProcessor } from './render.processor.js';

/** 렌더 큐 컨슈머 모듈. 렌더 큐와 DLQ 를 등록하고 프로세서/클라이언트/동시성/배치 집계를 제공한다. */
@Module({
  imports: [
    BullModule.registerQueue({ name: RENDER_QUEUE }),
    BullModule.registerQueue({ name: RENDER_DLQ }),
    WebhookModule,
  ],
  providers: [
    papermakeClientProvider,
    TenantConcurrencyService,
    BatchService,
    UsageService,
    RenderProcessor,
  ],
})
export class RenderModule {}
