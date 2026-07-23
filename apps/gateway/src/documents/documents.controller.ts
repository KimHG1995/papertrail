import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { CreateDocumentRequest, type CreateDocumentResponse } from '@papertrail/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';

/**
 * 문서 생성/조회. M1 스캐폴딩 단계라 큐/렌더 연동 전 스텁이다.
 * 요청 검증 → 성공 봉투 → 상태코드/에러 정형화가 실제로 도는지 보여주는 데모.
 */
@Controller('documents')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  @Post()
  @HttpCode(202)
  create(
    @Body(new ZodValidationPipe(CreateDocumentRequest))
    body: CreateDocumentRequest,
  ): CreateDocumentResponse {
    // TODO(M1): 멱등성 확인 → 큐 적재 → 문서 레코드 생성. 지금은 스텁 응답.
    const documentId = `doc_stub_${Date.now().toString(36)}`;
    this.logger.log(
      `문서 생성 요청 접수: template=${body.template}, idempotencyKey=${body.idempotencyKey ?? '(none)'}`,
    );
    return {
      documentId,
      status: 'QUEUED',
      templateVersion: `sha256:${'0'.repeat(64)}`,
      statusUrl: `/v1/documents/${documentId}`,
    };
  }

  @Get(':id')
  findOne(@Param('id') id: string): never {
    // TODO(M1): 증적 레코드 조회. 지금은 RFC 7807 에러 정형화 데모.
    throw new NotFoundException(`문서를 찾을 수 없습니다: ${id}`);
  }
}
