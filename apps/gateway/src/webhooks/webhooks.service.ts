import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateWebhookRequest,
  WebhookEndpointCreated,
  WebhookEndpointView,
} from '@papertrail/contracts';
import { type Database, newId, webhookEndpoint } from '@papertrail/db';
import { randomBytes } from 'node:crypto';
import { DRIZZLE } from '../database/database.constants.js';

/** Webhook 엔드포인트 등록/조회. 시크릿은 생성 시 한 번만 반환한다. */
@Injectable()
export class WebhooksService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async create(tenantId: string, req: CreateWebhookRequest): Promise<WebhookEndpointCreated> {
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    const rows = await this.db
      .insert(webhookEndpoint)
      .values({
        id: newId('whep'),
        tenantId,
        url: req.url,
        secret,
        events: req.events,
        active: true,
      })
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('Webhook 엔드포인트 생성에 실패했습니다.');
    }
    return {
      id: row.id,
      url: row.url,
      events: row.events,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      secret,
    };
  }

  async list(tenantId: string): Promise<WebhookEndpointView[]> {
    const rows = await this.db.query.webhookEndpoint.findMany({
      where: (w, { eq }) => eq(w.tenantId, tenantId),
      orderBy: (w, { desc }) => desc(w.createdAt),
    });
    return rows.map((r) => ({
      id: r.id,
      url: r.url,
      events: r.events,
      active: r.active,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
