import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  RegisterTemplateRequest,
  TemplateName,
  type TemplateListItem,
  type TemplatePublished,
  type TemplateTags,
} from '@papertrail/contracts';
import { CurrentTenant } from '../auth/current-tenant.decorator.js';
import { RequiredScopes } from '../auth/scopes.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { TemplatesService } from './templates.service.js';

/** 템플릿 등록/조회 엔드포인트. 라우팅과 검증만 담당하고 로직은 TemplatesService 에 위임한다. */
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequiredScopes('templates:read')
  list(@CurrentTenant() tenantId: string): Promise<TemplateListItem[]> {
    return this.templates.list(tenantId);
  }

  @Post(':name/publish')
  @HttpCode(201)
  @RequiredScopes('templates:write')
  register(
    @CurrentTenant() tenantId: string,
    @Param('name', new ZodValidationPipe(TemplateName)) name: string,
    @Query('tag') tag: string | undefined,
    @Body(new ZodValidationPipe(RegisterTemplateRequest)) body: RegisterTemplateRequest,
  ): Promise<TemplatePublished> {
    return this.templates.register(tenantId, name, tag ?? 'latest', body);
  }

  @Get(':name/tags')
  @RequiredScopes('templates:read')
  tags(
    @CurrentTenant() tenantId: string,
    @Param('name', new ZodValidationPipe(TemplateName)) name: string,
  ): Promise<TemplateTags> {
    return this.templates.getTags(tenantId, name);
  }
}
