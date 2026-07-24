import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { requestContext } from './common/middleware/request-context.middleware.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(requestContext);
  app.setGlobalPrefix('v1');
  app.enableShutdownHooks(); // DatabaseModule 이 종료 시 커넥션 풀을 정리하도록

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`PaperTrail gateway listening on :${port} (prefix /v1)`);
}

void bootstrap();
