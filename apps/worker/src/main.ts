import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

/**
 * 렌더 워커 부트스트랩. HTTP 리스너 없이 애플리케이션 컨텍스트만 띄우면
 * BullMQ 워커(RenderProcessor)가 Redis 에 연결되어 작업을 소비한다.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  new Logger('Bootstrap').log('PaperTrail 렌더 워커 시작 (렌더 큐 대기 중)');
}

void bootstrap();
