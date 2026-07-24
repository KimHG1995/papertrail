import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  CreateWebhookRequest,
  type WebhookEndpointCreated,
  type WebhookEndpointView,
} from '@papertrail/contracts';
import { CurrentTenant } from '../auth/current-tenant.decorator.js';
import { RequiredScopes } from '../auth/scopes.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { WebhooksService } from './webhooks.service.js';

/** Webhook 엔드포인트 등록/조회 엔드포인트. */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post()
  @HttpCode(201)
  @RequiredScopes('webhooks:write')
  create(
    @CurrentTenant() tenantId: string,
    @Body(new ZodValidationPipe(CreateWebhookRequest)) body: CreateWebhookRequest,
  ): Promise<WebhookEndpointCreated> {
    return this.webhooks.create(tenantId, body);
  }

  @Get()
  @RequiredScopes('webhooks:read')
  list(@CurrentTenant() tenantId: string): Promise<WebhookEndpointView[]> {
    return this.webhooks.list(tenantId);
  }
}
