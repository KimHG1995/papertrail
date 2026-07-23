import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  CreateDocumentRequest,
  type CreateDocumentResponse,
  type DocumentDetail,
} from '@papertrail/contracts';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { DocumentsService } from './documents.service.js';

/**
 * 문서 생성/조회 엔드포인트. 라우팅과 요청 검증만 담당하고,
 * 비즈니스 로직은 DocumentsService 에 위임한다.
 */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @HttpCode(202)
  create(
    @Body(new ZodValidationPipe(CreateDocumentRequest))
    body: CreateDocumentRequest,
  ): CreateDocumentResponse {
    return this.documents.enqueue(body);
  }

  @Get(':id')
  findOne(@Param('id') id: string): DocumentDetail {
    return this.documents.getDetail(id);
  }
}
