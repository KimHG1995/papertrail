import { type ClickHouseClient, createClient } from '@clickhouse/client';
import type { ErrorCodeStat, StatsOverview, TemplateStat } from '@papertrail/contracts';
import type { AnalyticsClient, ClickHouseAnalyticsOptions, RenderEvent } from './types.js';

/** Date → ClickHouse DateTime64(3) 문자열('YYYY-MM-DD HH:MM:SS.sss', UTC). */
function toClickHouseDateTime(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

const WHERE =
  'tenant_id = {tenant:String} AND event_time >= parseDateTimeBestEffort({from:String}) AND event_time <= parseDateTimeBestEffort({to:String})';

interface OverallRow {
  total: string;
  succeeded: string;
  failed: string;
  p95: number | null;
}
interface TemplateRow extends OverallRow {
  template_name: string;
}
interface ErrorRow {
  error_code: string;
  count: string;
}

/** ClickHouse 기반 분석 어댑터. render_event 적재 + 기간 집계 조회. */
export class ClickHouseAnalyticsClient implements AnalyticsClient {
  private readonly client: ClickHouseClient;

  constructor(options: ClickHouseAnalyticsOptions) {
    this.client = createClient({
      url: options.url,
      database: options.database,
      username: options.username,
      password: options.password,
    });
  }

  async recordRenderEvent(e: RenderEvent): Promise<void> {
    await this.client.insert({
      table: 'render_event',
      format: 'JSONEachRow',
      values: [
        {
          event_time: toClickHouseDateTime(e.eventTime),
          tenant_id: e.tenantId,
          document_id: e.documentId,
          batch_id: e.batchId,
          template_name: e.templateName,
          template_hash: e.templateHash,
          input_hash: e.inputHash,
          output_hash: e.outputHash,
          pdf_standard: e.pdfStandard,
          status: e.status,
          error_code: e.errorCode,
          attempt: e.attempt,
          duration_ms: e.durationMs,
        },
      ],
    });
  }

  async getOverview(tenantId: string, from: Date, to: Date): Promise<StatsOverview> {
    const params = { tenant: tenantId, from: from.toISOString(), to: to.toISOString() };

    const overallRows = await this.queryRows<OverallRow>(
      `SELECT count() AS total, countIf(status = 'SUCCEEDED') AS succeeded,
              countIf(status = 'FAILED') AS failed, round(quantile(0.95)(duration_ms)) AS p95
       FROM render_event WHERE ${WHERE}`,
      params,
    );
    const overall = overallRows[0];
    const total = Number(overall?.total ?? 0);
    const succeeded = Number(overall?.succeeded ?? 0);
    const failed = Number(overall?.failed ?? 0);

    const templateRows = await this.queryRows<TemplateRow>(
      `SELECT template_name, count() AS total, countIf(status = 'SUCCEEDED') AS succeeded,
              countIf(status = 'FAILED') AS failed, round(quantile(0.95)(duration_ms)) AS p95
       FROM render_event WHERE ${WHERE} GROUP BY template_name ORDER BY total DESC`,
      params,
    );
    const byTemplate: TemplateStat[] = templateRows.map((t) => ({
      templateName: t.template_name,
      total: Number(t.total),
      succeeded: Number(t.succeeded),
      failed: Number(t.failed),
      p95DurationMs: Number(t.p95 ?? 0),
    }));

    const errorRows = await this.queryRows<ErrorRow>(
      `SELECT error_code, count() AS count FROM render_event
       WHERE ${WHERE} AND status = 'FAILED' AND error_code != '' GROUP BY error_code ORDER BY count DESC`,
      params,
    );
    const byErrorCode: ErrorCodeStat[] = errorRows.map((e) => ({
      errorCode: e.error_code,
      count: Number(e.count),
    }));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      total,
      succeeded,
      failed,
      successRate: total > 0 ? succeeded / total : 0,
      p95DurationMs: Number(overall?.p95 ?? 0),
      byTemplate,
      byErrorCode,
    };
  }

  private async queryRows<T>(query: string, query_params: Record<string, unknown>): Promise<T[]> {
    const rs = await this.client.query({ query, query_params, format: 'JSONEachRow' });
    return rs.json<T>();
  }
}
