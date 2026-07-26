-- 렌더 이벤트(append-only 분석). docs/04-data-model.md §4.2.
-- 개인정보 원문은 넣지 않는다(해시/코드/시간만).
CREATE TABLE IF NOT EXISTS papertrail.render_event (
  event_time    DateTime64(3),
  tenant_id     LowCardinality(String),
  document_id   String,
  batch_id      String,
  template_name LowCardinality(String),
  template_hash String,
  input_hash    String,
  output_hash   String,
  pdf_standard  LowCardinality(String),
  status        LowCardinality(String),
  error_code    LowCardinality(String),
  attempt       UInt8,
  duration_ms   UInt32
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_time)
ORDER BY (tenant_id, template_name, event_time);
