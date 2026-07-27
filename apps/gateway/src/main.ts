import 'reflect-metadata';
import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { requestContext } from './common/middleware/request-context.middleware.js';
import { createMetricsMiddleware } from './metrics/metrics.middleware.js';
import { MetricsService } from './metrics/metrics.service.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(requestContext);
  app.use(createMetricsMiddleware(app.get(MetricsService)));
  // /metrics 는 스크레이퍼 관례에 맞춰 버전 프리픽스를 붙이지 않는다.
  app.setGlobalPrefix('v1', { exclude: [{ path: 'metrics', method: RequestMethod.GET }] });
  app.enableShutdownHooks(); // DatabaseModule 이 종료 시 커넥션 풀을 정리하도록

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`PaperTrail gateway listening on :${port} (prefix /v1)`);
}

void bootstrap();
