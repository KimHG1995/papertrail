import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Histogram, Registry } from 'prom-client';

/**
 * Prometheus 메트릭 레지스트리. 기본(프로세스/GC) 메트릭과 HTTP RED 히스토그램을 담는다.
 * 히스토그램의 _count 로 요청 수(Rate), buckets 로 지연(Duration), status_code 라벨로 오류(Errors)를 본다.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly httpDuration: Histogram<'method' | 'route' | 'status_code'>;

  constructor() {
    this.registry.setDefaultLabels({ app: 'papertrail-gateway' });
    collectDefaultMetrics({ register: this.registry });
    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP 요청 처리 시간(초)',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
  }

  /** Prometheus 텍스트 노출 형식. */
  render(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
