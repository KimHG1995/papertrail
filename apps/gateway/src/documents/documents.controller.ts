import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import {
  CreateDocumentRequest,
  type CreateDocumentResponse,
  type DocumentDetail,
} from '@papertrail/contracts';
import type { Request, Response } from 'express';
import { CurrentTenant } from '../auth/current-tenant.decorator.js';
import { RequiredScopes } from '../auth/scopes.decorator.js';
import {
  DEFAULT_DOWNLOAD_TTL_SECONDS,
  MAX_DOWNLOAD_TTL_SECONDS,
  MIN_DOWNLOAD_TTL_SECONDS,
} from '../common/constants.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';
import { successEnvelope } from '../common/envelope.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { DocumentsService } from './documents.service.js';

/** ttl 쿼리 파라미터를 허용 범위로 제한한다(기본/최소/최대). */
function clampTtl(raw: string | undefined): number {
  const parsed = raw ? Number(raw) : DEFAULT_DOWNLOAD_TTL_SECONDS;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DOWNLOAD_TTL_SECONDS;
  }
  return Math.min(MAX_DOWNLOAD_TTL_SECONDS, Math.max(MIN_DOWNLOAD_TTL_SECONDS, Math.trunc(parsed)));
}

/**
 * 문서 생성/조회/다운로드 엔드포인트. 라우팅과 요청 검증만 담당하고,
 * 비즈니스 로직은 DocumentsService 에 위임한다.
 */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @HttpCode(202)
  @RequiredScopes('documents:write')
  create(
    @CurrentTenant() tenantId: string,
    @Body(new ZodValidationPipe(CreateDocumentRequest))
    body: CreateDocumentRequest,
  ): Promise<CreateDocumentResponse> {
    return this.documents.enqueue(tenantId, body);
  }

  @Get(':id')
  @RequiredScopes('documents:read')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string): Promise<DocumentDetail> {
    return this.documents.getDetail(tenantId, id);
  }

  /**
   * 결과 PDF 다운로드. 기본은 Signed URL 로 302 redirect, `?format=json` 이면
   * {url, expiresAt, outputHash} 정형화 응답. `?ttl` 로 URL 유효기간(초)을 조정한다.
   */
  @Get(':id/download')
  @RequiredScopes('documents:read')
  @SkipResponseTransform()
  async download(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query('ttl') ttl: string | undefined,
    @Query('format') format: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const info = await this.documents.getDownload(tenantId, id, clampTtl(ttl));
    if (format === 'json') {
      const path = req.originalUrl.split('?')[0] ?? req.originalUrl;
      res.status(200).json(successEnvelope(info, path, req.traceId ?? ''));
      return;
    }
    res.redirect(302, info.url);
  }
}
