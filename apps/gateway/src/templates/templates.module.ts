import { Module } from '@nestjs/common';
import { papermakeClientProvider } from '../papermake/papermake.provider.js';
import { SchemaValidatorService } from './schema-validator.service.js';
import { TemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';

/**
 * 템플릿 등록/조회 모듈. TemplatesService 는 문서 생성 시 템플릿 해석/입력 검증에도
 * 쓰이므로 export 하여 DocumentsModule 이 주입할 수 있게 한다.
 */
@Module({
  controllers: [TemplatesController],
  providers: [papermakeClientProvider, SchemaValidatorService, TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
