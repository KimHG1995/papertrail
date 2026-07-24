import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WEBHOOK_QUEUE } from '@papertrail/contracts';
import { WebhookDispatcher } from './webhook-dispatcher.service.js';
import { WebhookProcessor } from './webhook.processor.js';

/**
 * Webhook 전송 모듈. 전송 큐를 등록하고 dispatcher(프로듀서)/processor(컨슈머)를 제공한다.
 * dispatcher 는 렌더 완료 시 이벤트를 팬아웃하도록 RenderModule 에 export 한다.
 */
@Module({
  imports: [BullModule.registerQueue({ name: WEBHOOK_QUEUE })],
  providers: [WebhookDispatcher, WebhookProcessor],
  exports: [WebhookDispatcher],
})
export class WebhookModule {}
