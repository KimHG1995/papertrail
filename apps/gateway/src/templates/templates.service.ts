import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  HashRef,
  RegisterTemplateRequest,
  TemplateListItem,
  TemplatePublished,
  TemplateTags,
} from '@papertrail/contracts';
import { type Database, newId, template, templateTag, templateVersion } from '@papertrail/db';
import type { PapermakeClient } from '@papertrail/papermake-client';
import { and, desc, eq } from 'drizzle-orm';
import { SchemaValidationException } from '../common/exceptions/problem.exception.js';
import { hashJson } from '../common/hash/canonical-hash.js';
import { DRIZZLE } from '../database/database.constants.js';
import { PAPERMAKE_CLIENT } from '../papermake/papermake.constants.js';
import { SchemaValidatorService } from './schema-validator.service.js';

interface ResolvedTemplate {
  templateName: string;
  templateTag: string | null;
  manifestHash: HashRef;
}

/** template 참조를 name / tag / 고정 해시로 분해한다. */
function parseTemplateRef(ref: string): { name: string; tag: string | null; hash: string | null } {
  const pinIdx = ref.indexOf('@sha256:');
  if (pinIdx !== -1) {
    return { name: ref.slice(0, pinIdx), tag: null, hash: ref.slice(pinIdx + 1) };
  }
  const tagIdx = ref.indexOf(':');
  if (tagIdx !== -1) {
    return { name: ref.slice(0, tagIdx), tag: ref.slice(tagIdx + 1), hash: null };
  }
  return { name: ref, tag: null, hash: null };
}

/** 템플릿 등록/조회 + 렌더용 해석(입력 JSON Schema 검증 포함). */
@Injectable()
export class TemplatesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PAPERMAKE_CLIENT) private readonly papermake: PapermakeClient,
    private readonly validator: SchemaValidatorService,
  ) {}

  /** 템플릿을 등록(publish)하고 태그를 이동한다. schema 가 있으면 유효성부터 확인한다. */
  async register(
    tenantId: string,
    name: string,
    tag: string,
    req: RegisterTemplateRequest,
  ): Promise<TemplatePublished> {
    const schemaHash = req.schema ? hashJson(req.schema) : null;
    if (req.schema) {
      this.validator.assertValidSchema(req.schema);
    }

    const { manifestHash } = await this.papermake.publish({
      name,
      tag,
      source: req.source,
      schema: req.schema,
      author: req.author,
    });

    await this.db
      .insert(template)
      .values({ id: newId('tmpl'), tenantId, name })
      .onConflictDoNothing({ target: [template.tenantId, template.name] });
    const tmpl = await this.findTemplate(tenantId, name);

    await this.db
      .insert(templateVersion)
      .values({
        id: newId('tmplver'),
        templateId: tmpl.id,
        manifestHash,
        schemaHash,
        schema: req.schema ?? null,
        state: 'PUBLISHED',
      })
      .onConflictDoUpdate({
        target: [templateVersion.templateId, templateVersion.manifestHash],
        set: { schema: req.schema ?? null, schemaHash },
      });

    await this.db
      .insert(templateTag)
      .values({ templateId: tmpl.id, tag, manifestHash })
      .onConflictDoUpdate({
        target: [templateTag.templateId, templateTag.tag],
        set: { manifestHash, updatedAt: new Date() },
      });

    return { name, tag, manifestHash, state: 'PUBLISHED', createdAt: new Date().toISOString() };
  }

  /** 테넌트의 템플릿 목록(최신 태그 포함). */
  async list(tenantId: string): Promise<TemplateListItem[]> {
    const tmpls = await this.db.query.template.findMany({
      where: (t, { eq: e }) => e(t.tenantId, tenantId),
      orderBy: (t, { asc }) => asc(t.name),
    });
    return Promise.all(
      tmpls.map(async (t) => {
        const latest = await this.db.query.templateTag.findFirst({
          where: (tt, { eq: e }) => e(tt.templateId, t.id),
          orderBy: (tt, { desc: d }) => d(tt.updatedAt),
        });
        return {
          name: t.name,
          latestTag: latest?.tag ?? null,
          updatedAt: (latest?.updatedAt ?? t.createdAt).toISOString(),
        };
      }),
    );
  }

  /** 템플릿의 태그/버전 목록. */
  async getTags(tenantId: string, name: string): Promise<TemplateTags> {
    const tmpl = await this.findTemplate(tenantId, name);
    const tags = await this.db
      .select({
        tag: templateTag.tag,
        manifestHash: templateTag.manifestHash,
        state: templateVersion.state,
      })
      .from(templateTag)
      .innerJoin(
        templateVersion,
        and(
          eq(templateVersion.templateId, templateTag.templateId),
          eq(templateVersion.manifestHash, templateTag.manifestHash),
        ),
      )
      .where(eq(templateTag.templateId, tmpl.id))
      .orderBy(desc(templateTag.updatedAt));
    return { name, tags };
  }

  /**
   * 렌더용으로 template 참조를 해석하고 입력을 JSON Schema 로 검증한다.
   * 미등록 템플릿/태그는 404, 스키마 위반은 422(SCHEMA_VALIDATION_FAILED).
   */
  async resolveForRender(tenantId: string, ref: string, input: unknown): Promise<ResolvedTemplate> {
    const parsed = parseTemplateRef(ref);
    const tmpl = await this.findTemplate(tenantId, parsed.name);

    const manifestHash = parsed.hash ?? (await this.resolveTagHash(tmpl.id, parsed.tag));
    const version = await this.db.query.templateVersion.findFirst({
      where: (v, { and: a, eq: e }) => a(e(v.templateId, tmpl.id), e(v.manifestHash, manifestHash)),
    });
    if (!version) {
      throw new NotFoundException(`템플릿 버전을 찾을 수 없습니다: ${ref}`);
    }

    if (version.schema && version.schemaHash) {
      const errors = this.validator.validate(version.schemaHash, version.schema, input);
      if (errors.length > 0) {
        throw new SchemaValidationException(errors);
      }
    }

    return {
      templateName: parsed.name,
      templateTag: parsed.tag,
      manifestHash,
    };
  }

  private async resolveTagHash(templateId: string, tag: string | null): Promise<string> {
    if (!tag) {
      throw new NotFoundException('템플릿 태그가 필요합니다(name:tag 또는 name@sha256:...).');
    }
    const row = await this.db.query.templateTag.findFirst({
      where: (tt, { and: a, eq: e }) => a(e(tt.templateId, templateId), e(tt.tag, tag)),
    });
    if (!row) {
      throw new NotFoundException(`태그를 찾을 수 없습니다: ${tag}`);
    }
    return row.manifestHash;
  }

  private async findTemplate(tenantId: string, name: string) {
    const tmpl = await this.db.query.template.findFirst({
      where: (t, { and: a, eq: e }) => a(e(t.tenantId, tenantId), e(t.name, name)),
    });
    if (!tmpl) {
      throw new NotFoundException(`템플릿을 찾을 수 없습니다: ${name}`);
    }
    return tmpl;
  }
}
