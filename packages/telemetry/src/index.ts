import { trace, type Tracer } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-node';

let started = false;

function truthy(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

/**
 * 익스포터를 환경변수로 고른다.
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP/HTTP 로 배치 전송(프로덕션)
 * - TELEMETRY_CONSOLE=true: 콘솔로 즉시 출력(로컬 검증)
 * - 둘 다 없으면 트레이싱 비활성(오버헤드 없음)
 */
function resolveProcessors(): SpanProcessor[] {
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return [new BatchSpanProcessor(new OTLPTraceExporter())];
  }
  if (truthy(process.env.TELEMETRY_CONSOLE)) {
    return [new SimpleSpanProcessor(new ConsoleSpanExporter())];
  }
  return [];
}

/**
 * OpenTelemetry NodeSDK 를 시작한다. NestFactory 이전에 호출해야 한다(멱등).
 * W3C 트레이스 컨텍스트 전파가 기본으로 설정되어 게이트웨이↔워커 간 트레이스가 이어진다.
 */
export function initTelemetry(serviceName: string): void {
  if (started) {
    return;
  }
  const spanProcessors = resolveProcessors();
  if (spanProcessors.length === 0) {
    return;
  }
  started = true;
  process.env.OTEL_SERVICE_NAME ??= serviceName;
  const sdk = new NodeSDK({ spanProcessors });
  sdk.start();
}

/** 애플리케이션용 트레이서(전역 프로바이더에서). */
export function getTracer(name = 'papertrail'): Tracer {
  return trace.getTracer(name);
}

export { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
export type { Span } from '@opentelemetry/api';
