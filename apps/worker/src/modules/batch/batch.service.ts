import { Inject, Injectable, Logger } from '@nestjs/common';
import { batch, type Database } from '@papertrail/db';
import { batchReportKey, type StorageClient } from '@papertrail/storage';
import { and, eq, ne, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../infra/database/database.constants.js';
import { STORAGE } from '../../infra/storage/storage.constants.js';

/** 배치 집계/완료 처리. 문서가 확정될 때마다 카운트를 원자적으로 올리고 완료 시 리포트를 만든다. */
@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(STORAGE) private readonly storage: StorageClient,
  ) {}

  /** 배치 소속 문서가 성공/실패로 확정되면 카운트를 원자적으로 증가시키고 완료를 판정한다. */
  async onDocumentSettled(batchId: string, outcome: 'succeeded' | 'failed'): Promise<void> {
    const set =
      outcome === 'succeeded'
        ? { succeeded: sql`${batch.succeeded} + 1`, status: 'RUNNING' as const }
        : { failed: sql`${batch.failed} + 1`, status: 'RUNNING' as const };

    const rows = await this.db.update(batch).set(set).where(eq(batch.id, batchId)).returning();
    const row = rows[0];
    if (!row) {
      return;
    }
    if (row.succeeded + row.failed < row.total) {
      return;
    }

    // 완료 클레임: 동시 확정 경쟁에서 한 번만 성공한다(행 잠금 + 조건).
    const claimed = await this.db
      .update(batch)
      .set({ status: 'COMPLETED', completedAt: new Date() })
      .where(and(eq(batch.id, batchId), ne(batch.status, 'COMPLETED')))
      .returning();
    if (claimed.length === 0) {
      return;
    }

    await this.generateReport(row.id, row.tenantId);
    this.logger.log(
      `배치 완료: id=${batchId}, succeeded=${row.succeeded}, failed=${row.failed}, total=${row.total}`,
    );
  }

  /** 배치 문서들의 결과를 CSV 리포트로 만들어 S3 에 저장하고 report_key 를 기록한다. */
  private async generateReport(batchId: string, tenantId: string): Promise<void> {
    const docs = await this.db.query.document.findMany({
      where: (d, { eq: e }) => e(d.batchId, batchId),
      orderBy: (d, { asc }) => asc(d.requestedAt),
    });
    const header = 'documentId,status,outputHash,errorCode';
    const lines = docs.map((d) =>
      [d.id, d.status, d.outputHash ?? '', d.errorCode ?? ''].join(','),
    );
    const csv = `${[header, ...lines].join('\n')}\n`;

    const key = batchReportKey(tenantId, batchId);
    await this.storage.put(key, new TextEncoder().encode(csv), 'text/csv');
    await this.db.update(batch).set({ reportKey: key }).where(eq(batch.id, batchId));
  }
}
