import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  CreateBatchRequest,
  type BatchListItem,
  type BatchProgress,
  type CreateBatchResponse,
} from '@papertrail/contracts';
import { CurrentTenant } from '../auth/current-tenant.decorator.js';
import { RequiredScopes } from '../auth/scopes.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { BatchesService } from './batches.service.js';

/** 배치(대량) 생성/진행률 엔드포인트. 문서 스코프를 재사용한다. */
@Controller('batches')
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Post()
  @HttpCode(202)
  @RequiredScopes('documents:write')
  create(
    @CurrentTenant() tenantId: string,
    @Body(new ZodValidationPipe(CreateBatchRequest)) body: CreateBatchRequest,
  ): Promise<CreateBatchResponse> {
    return this.batches.create(tenantId, body);
  }

  @Get()
  @RequiredScopes('documents:read')
  list(
    @CurrentTenant() tenantId: string,
    @Query('limit') limit: string | undefined,
  ): Promise<BatchListItem[]> {
    return this.batches.list(tenantId, limit ? Number(limit) : undefined);
  }

  @Get(':id')
  @RequiredScopes('documents:read')
  progress(@CurrentTenant() tenantId: string, @Param('id') id: string): Promise<BatchProgress> {
    return this.batches.getProgress(tenantId, id);
  }
}
