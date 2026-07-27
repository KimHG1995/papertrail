import { Inject, Injectable } from '@nestjs/common';
import type { AuditEntry } from '@papertrail/contracts';
import { auditLog, type Database, newId } from '@papertrail/db';
import { DRIZZLE } from '../database/database.constants.js';

interface AuditRecordInput {
  tenantId: string;
  apiKeyId: string | null;
  action: string;
  resourceId: string | null;
  statusCode: number;
  traceId: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** 감사 로그 기록/조회. */
@Injectable()
export class AuditService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** 변경 요청 한 건을 append-only 로 기록한다. */
  async record(input: AuditRecordInput): Promise<void> {
    await this.db.insert(auditLog).values({
      id: newId('audit'),
      tenantId: input.tenantId,
      apiKeyId: input.apiKeyId,
      action: input.action,
      resourceId: input.resourceId,
      statusCode: input.statusCode,
      traceId: input.traceId,
    });
  }

  /** 테넌트의 최근 감사 기록을 최신순으로 조회한다. */
  async list(tenantId: string, limit: number | undefined): Promise<AuditEntry[]> {
    const requested = Number.isFinite(limit) ? limit! : DEFAULT_LIMIT;
    const capped = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(requested)));
    const rows = await this.db.query.auditLog.findMany({
      where: (a, { eq }) => eq(a.tenantId, tenantId),
      orderBy: (a, { desc }) => desc(a.createdAt),
      limit: capped,
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      resourceId: r.resourceId,
      statusCode: r.statusCode,
      apiKeyId: r.apiKeyId,
      traceId: r.traceId,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
