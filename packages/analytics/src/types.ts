import type { StatsOverview } from '@papertrail/contracts';

/** render_event 한 행에 대응하는 렌더 이벤트. */
export interface RenderEvent {
  eventTime: Date;
  tenantId: string;
  documentId: string;
  batchId: string;
  templateName: string;
  templateHash: string;
  inputHash: string;
  outputHash: string;
  pdfStandard: string;
  status: 'SUCCEEDED' | 'FAILED';
  errorCode: string;
  attempt: number;
  durationMs: number;
}

/** ClickHouse 접속 설정. */
export interface ClickHouseAnalyticsOptions {
  url: string;
  database: string;
  username: string;
  password: string;
}

/** 분석 포트. 워커는 적재, 게이트웨이는 조회에 사용한다. */
export interface AnalyticsClient {
  recordRenderEvent(event: RenderEvent): Promise<void>;
  getOverview(tenantId: string, from: Date, to: Date): Promise<StatsOverview>;
}
