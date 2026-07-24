/**
 * PaperTrail PostgreSQL 스키마 (Drizzle ORM).
 *
 * docs/04-data-model.md §4.1 을 그대로 옮긴 것이다. 컬럼명은 문서와 동일하게
 * snake_case 로 고정하고, TS 필드는 camelCase 로 노출한다. 상태/표준 등 열거형은
 * @papertrail/contracts 의 타입을 재사용해 게이트웨이와 표현을 일치시킨다.
 *
 * drizzle-kit 호환을 위해 스키마는 이 단일 파일로 유지한다(상대 경로 import 없음).
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  BatchStatus,
  DocumentStatus,
  PdfStandard,
  TemplateState,
  WebhookEventType,
} from '@papertrail/contracts';

// contracts 로 노출하지 않는 운영 측 열거형은 여기서 정의한다.
type TenantStatus = 'ACTIVE' | 'SUSPENDED';
type UserRole = 'OWNER' | 'ADMIN' | 'REVIEWER' | 'VIEWER';
type WebhookDeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED';

/** 테넌트(고객 조직). 모든 리소스의 격리 경계. */
export const tenant = pgTable('tenant', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').$type<TenantStatus>().notNull().default('ACTIVE'),
  concurrencyLimit: integer('concurrency_limit').notNull().default(4),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 콘솔 운영자 계정. */
export const appUser = pgTable('app_user', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').references(() => tenant.id),
  email: text('email').notNull().unique(),
  role: text('role').$type<UserRole>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** API Key. 원문은 저장하지 않고 해시만 보관한다. */
export const apiKey = pgTable(
  'api_key',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenant.id),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    scopes: text('scopes').array().notNull().default([]),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('api_key_tenant_idx').on(table.tenantId)],
);

/** 템플릿(논리 단위). 테넌트 안에서 이름이 유일하다. */
export const template = pgTable(
  'template',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenant.id),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('template_tenant_name_uq').on(table.tenantId, table.name)],
);

/** 템플릿 버전(콘텐츠 주소로 고정). manifest 해시로 유일하다. */
export const templateVersion = pgTable(
  'template_version',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id')
      .notNull()
      .references(() => template.id),
    manifestHash: text('manifest_hash').notNull(),
    // 입력 검증용 JSON Schema 와 그 해시. 스키마가 없으면 둘 다 NULL.
    schemaHash: text('schema_hash'),
    schema: jsonb('schema').$type<Record<string, unknown>>(),
    state: text('state').$type<TemplateState>().notNull(),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('template_version_manifest_uq').on(table.templateId, table.manifestHash)],
);

/** 가변 태그 → manifest 매핑(production, staging, 2026-v2 등). */
export const templateTag = pgTable(
  'template_tag',
  {
    templateId: text('template_id')
      .notNull()
      .references(() => template.id),
    tag: text('tag').notNull(),
    manifestHash: text('manifest_hash').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.templateId, table.tag] })],
);

/** 배치(대량) 작업. */
export const batch = pgTable(
  'batch',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenant.id),
    templateRef: text('template_ref').notNull(),
    sourceCsvKey: text('source_csv_key'),
    total: integer('total').notNull(),
    succeeded: integer('succeeded').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    status: text('status').$type<BatchStatus>().notNull(),
    reportKey: text('report_key'),
    callbackUrl: text('callback_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [index('batch_tenant_idx').on(table.tenantId)],
);

/**
 * 문서 작업 + 증적. 재현성의 근간이 되는 해시들을 담는다.
 *
 * template_hash / output_hash 는 렌더 시점에 확정되므로 접수(QUEUED) 시에는
 * NULL 일 수 있다. input_hash 는 접수 시점에 입력 JSON 을 정규화해 즉시 계산한다.
 * 멱등성은 (tenant_id, idempotency_key) partial unique index 로 DB 가 보증한다.
 */
export const document = pgTable(
  'document',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenant.id),
    batchId: text('batch_id'),
    idempotencyKey: text('idempotency_key'),

    templateName: text('template_name').notNull(),
    templateTag: text('template_tag'),
    templateHash: text('template_hash'),

    inputHash: text('input_hash').notNull(),
    outputHash: text('output_hash'),
    pdfStandard: text('pdf_standard').$type<PdfStandard>().notNull().default('pdf-1.7'),

    inputObjectKey: text('input_object_key'),
    storageKey: text('storage_key'),
    callbackUrl: text('callback_url'),
    maskedPreview: jsonb('masked_preview').$type<Record<string, unknown>>(),

    status: text('status').$type<DocumentStatus>().notNull(),
    errorCode: text('error_code'),
    attemptCount: integer('attempt_count').notNull().default(0),

    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
  },
  (table) => [
    uniqueIndex('document_tenant_idempotency_uq')
      .on(table.tenantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    index('document_tenant_status_idx').on(table.tenantId, table.status),
    index('document_batch_idx').on(table.batchId),
    index('document_requested_at_idx').on(table.requestedAt),
  ],
);

/** Webhook 수신 엔드포인트. HMAC 시크릿은 해시로 저장한다. */
export const webhookEndpoint = pgTable(
  'webhook_endpoint',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenant.id),
    url: text('url').notNull(),
    secretHash: text('secret_hash').notNull(),
    events: text('events').array().$type<WebhookEventType[]>().notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('webhook_endpoint_tenant_idx').on(table.tenantId)],
);

/** Webhook 전송 시도 이력(재시도 추적). */
export const webhookDelivery = pgTable(
  'webhook_delivery',
  {
    id: text('id').primaryKey(),
    endpointId: text('endpoint_id')
      .notNull()
      .references(() => webhookEndpoint.id),
    documentId: text('document_id'),
    event: text('event').$type<WebhookEventType>().notNull(),
    status: text('status').$type<WebhookDeliveryStatus>().notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastResponseCode: integer('last_response_code'),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('webhook_delivery_endpoint_idx').on(table.endpointId)],
);

/** 사용량 카운터(빌링 선행 스키마). 테넌트 x 기간(월). */
export const usageCounter = pgTable(
  'usage_counter',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenant.id),
    period: text('period').notNull(),
    rendered: bigint('rendered', { mode: 'number' }).notNull().default(0),
    failed: bigint('failed', { mode: 'number' }).notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.period] })],
);

/** 문서 레코드의 select 타입(증적 매핑에 사용). */
export type DocumentRow = typeof document.$inferSelect;
/** 문서 레코드의 insert 타입. */
export type NewDocumentRow = typeof document.$inferInsert;
