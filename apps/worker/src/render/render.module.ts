import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RENDER_DLQ, RENDER_QUEUE } from '@papertrail/contracts';
import { TenantConcurrencyService } from '../concurrency/tenant-concurrency.service.js';
import { papermakeClientProvider } from './papermake.provider.js';
import { RenderProcessor } from './render.processor.js';

/** 렌더 큐 컨슈머 모듈. 렌더 큐와 DLQ 를 등록하고 프로세서/클라이언트/동시성 제어를 제공한다. */
@Module({
  imports: [
    BullModule.registerQueue({ name: RENDER_QUEUE }),
    BullModule.registerQueue({ name: RENDER_DLQ }),
  ],
  providers: [papermakeClientProvider, TenantConcurrencyService, RenderProcessor],
})
export class RenderModule {}
