import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  FieldError,
  HashRef,
  PreviewResult,
  PreviewTemplateRequest,
  RegisterTemplateRequest,
  TemplateListItem,
  TemplatePublished,
  TemplateState,
  TemplateStateChanged,
  TemplateTags,
} from '@papertrail/contracts';
import { type Database, newId, template, templateTag, templateVersion } from '@papertrail/db';
import { PapermakeError, type PapermakeClient } from '@papertrail/papermake-client';
import { previewKey, type StorageClient } from '@papertrail/storage';
import { and, desc, eq } from 'drizzle-orm';
import {
  ProblemException,
  SchemaValidationException,
} from '../common/exceptions/problem.exception.js';
import { hashJson } from '../common/hash/canonical-hash.js';
import { DRIZZLE } from '../database/database.constants.js';
import { PAPERMAKE_CLIENT } from '../papermake/papermake.constants.js';
import { STORAGE } from '../storage/storage.constants.js';
import { SchemaValidatorService } from './schema-validator.service.js';

/** 미리보기 Signed URL 유효기간(초). */
const PREVIEW_TTL_SECONDS = 300;

interface ResolvedTemplate {
  templateName: string;
  templateTag: string | null;
  manifestHash: HashRef;
}

interface ResolvedTemplateFull extends ResolvedTemplate {
  schema: Record<string, unknown> | null;
  schemaHash: string | null;
  state: TemplateState;
}

/** 승인 워크플로에서 허용된 상태 전이. */
const VALID_TRANSITIONS: Record<TemplateState, TemplateState[]> = {
  DRAFT: ['REVIEWING'],
  REVIEWING: ['APPROVED', 'DRAFT'],
  APPROVED: ['PUBLISHED', 'DRAFT'],
  PUBLISHED: ['DEPRECATED'],
  DEPRECATED: [],
};

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
    @Inject(STORAGE) private readonly storage: StorageClient,
    private readonly validator: SchemaValidatorService,
  ) {}

  /**
   * 템플릿을 등록(publish)하고 태그를 이동한다. 새 버전은 DRAFT 로 시작하며,
   * 렌더에 쓰이려면 승인 워크플로를 거쳐 PUBLISHED 가 되어야 한다.
   * 재등록(같은 manifestHash)은 스키마만 갱신하고 기존 상태는 보존한다.
   */
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

    const { manifestHash } = await this.publishOrMap({
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

    const versions = await this.db
      .insert(templateVersion)
      .values({
        id: newId('tmplver'),
        templateId: tmpl.id,
        manifestHash,
        schemaHash,
        schema: req.schema ?? null,
        state: 'DRAFT',
      })
      .onConflictDoUpdate({
        target: [templateVersion.templateId, templateVersion.manifestHash],
        set: { schema: req.schema ?? null, schemaHash },
      })
      .returning();
    const version = versions[0];
    if (!version) {
      throw new Error('템플릿 버전 생성에 실패했습니다.');
    }

    await this.db
      .insert(templateTag)
      .values({ templateId: tmpl.id, tag, manifestHash })
      .onConflictDoUpdate({
        target: [templateTag.templateId, templateTag.tag],
        set: { manifestHash, updatedAt: new Date() },
      });

    return {
      name,
      tag,
      manifestHash,
      state: version.state,
      createdAt: version.createdAt.toISOString(),
    };
  }

  /**
   * Papermake publish 를 호출하되 실패를 도메인 에러로 매핑한다.
   * 4xx(잘못된 Typst 소스 등 호출자 입력 문제) → 400, 5xx/네트워크 → 502 RENDER_UPSTREAM.
   */
  private async publishOrMap(
    input: Parameters<PapermakeClient['publish']>[0],
  ): ReturnType<PapermakeClient['publish']> {
    try {
      return await this.papermake.publish(input);
    } catch (err) {
      if (err instanceof PapermakeError) {
        if (err.isClientError) {
          throw new ProblemException('BAD_REQUEST', `템플릿 등록 실패(Papermake): ${err.message}`);
        }
        throw new ProblemException('RENDER_UPSTREAM', `렌더 엔진 오류: ${err.message}`);
      }
      throw new ProblemException('RENDER_UPSTREAM', '렌더 엔진에 연결하지 못했습니다.');
    }
  }

  /**
   * 미리보기 동기 렌더를 호출하되 실패를 도메인 에러로 매핑한다.
   * 4xx(Typst 컴파일 오류 등 작성자 입력 문제) → 400, 그 외 → 502 RENDER_UPSTREAM.
   */
  private async renderOrMap(
    input: Parameters<PapermakeClient['render']>[0],
  ): ReturnType<PapermakeClient['render']> {
    try {
      return await this.papermake.render(input);
    } catch (err) {
      if (err instanceof PapermakeError) {
        if (err.isClientError) {
          throw new ProblemException(
            'BAD_REQUEST',
            `미리보기 렌더 실패(Papermake): ${err.message}`,
          );
        }
        throw new ProblemException('RENDER_UPSTREAM', `렌더 엔진 오류: ${err.message}`);
      }
      throw new ProblemException('RENDER_UPSTREAM', '렌더 엔진에 연결하지 못했습니다.');
    }
  }

  /**
   * 템플릿 버전의 상태를 전이한다(승인 워크플로). 허용되지 않는 전이는 400.
   * 승인자 권한(templates:approve)이 필요하다(라우트에서 게이팅).
   */
  async transitionState(
    tenantId: string,
    name: string,
    manifestHash: string,
    to: TemplateState,
  ): Promise<TemplateStateChanged> {
    const tmpl = await this.findTemplate(tenantId, name);
    const version = await this.db.query.templateVersion.findFirst({
      where: (v, { and: a, eq: e }) => a(e(v.templateId, tmpl.id), e(v.manifestHash, manifestHash)),
    });
    if (!version) {
      throw new NotFoundException(`템플릿 버전을 찾을 수 없습니다: ${name} ${manifestHash}`);
    }
    if (!VALID_TRANSITIONS[version.state].includes(to)) {
      throw new ProblemException(
        'BAD_REQUEST',
        `허용되지 않는 상태 전이입니다: ${version.state} → ${to}`,
      );
    }
    await this.db
      .update(templateVersion)
      .set({ state: to })
      .where(eq(templateVersion.id, version.id));
    return { name, manifestHash, state: to };
  }

  /**
   * 특정 버전을 큐/발행 게이트를 우회해 동기 렌더한다(작성자 미리보기).
   * DRAFT 등 미발행 버전도 미리 볼 수 있다. 스키마가 있으면 입력을 검증한다.
   */
  async preview(
    tenantId: string,
    name: string,
    req: PreviewTemplateRequest,
  ): Promise<PreviewResult> {
    const tmpl = await this.findTemplate(tenantId, name);
    const version = await this.db.query.templateVersion.findFirst({
      where: (v, { and: a, eq: e }) =>
        a(e(v.templateId, tmpl.id), e(v.manifestHash, req.manifestHash)),
    });
    if (!version) {
      throw new NotFoundException(`템플릿 버전을 찾을 수 없습니다: ${name} ${req.manifestHash}`);
    }
    if (version.schema && version.schemaHash) {
      const errors = this.validator.validate(version.schemaHash, version.schema, req.data);
      if (errors.length > 0) {
        throw new SchemaValidationException(errors);
      }
    }

    const result = await this.renderOrMap({
      template: `${name}@${req.manifestHash}`,
      pdfStandard: req.pdfStandard,
      data: req.data,
      recipient: req.recipient ?? null,
    });
    const key = previewKey(tenantId, result.outputHash.replace('sha256:', ''));
    await this.storage.put(key, result.pdf, 'application/pdf');
    const { url, expiresAt } = await this.storage.presignGet(key, PREVIEW_TTL_SECONDS);
    return { url, expiresAt: expiresAt.toISOString(), outputHash: result.outputHash };
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
   * template 참조를 해석해 매니페스트 해시와 스키마를 반환한다(입력 검증은 하지 않음).
   * 미등록 템플릿/태그는 404. 배치처럼 한 번 해석하고 여러 입력을 검증할 때 쓴다.
   */
  async resolveTemplate(tenantId: string, ref: string): Promise<ResolvedTemplateFull> {
    const parsed = parseTemplateRef(ref);
    const tmpl = await this.findTemplate(tenantId, parsed.name);

    const manifestHash = parsed.hash ?? (await this.resolveTagHash(tmpl.id, parsed.tag));
    const version = await this.db.query.templateVersion.findFirst({
      where: (v, { and: a, eq: e }) => a(e(v.templateId, tmpl.id), e(v.manifestHash, manifestHash)),
    });
    if (!version) {
      throw new NotFoundException(`템플릿 버전을 찾을 수 없습니다: ${ref}`);
    }

    return {
      templateName: parsed.name,
      templateTag: parsed.tag,
      manifestHash,
      schema: version.schema,
      schemaHash: version.schemaHash,
      state: version.state,
    };
  }

  /** 렌더 가능(PUBLISHED) 상태인지 확인한다. 아니면 409(TEMPLATE_NOT_PUBLISHED). */
  assertPublished(resolved: Pick<ResolvedTemplateFull, 'state' | 'templateName'>): void {
    if (resolved.state !== 'PUBLISHED') {
      throw new ProblemException(
        'TEMPLATE_NOT_PUBLISHED',
        `템플릿이 발행(PUBLISHED) 상태가 아닙니다: ${resolved.templateName} (현재 ${resolved.state})`,
      );
    }
  }

  /** 해석된 템플릿의 스키마로 입력을 검증한다(스키마 없으면 빈 배열). */
  validateInput(
    resolved: Pick<ResolvedTemplateFull, 'schema' | 'schemaHash'>,
    input: unknown,
  ): FieldError[] {
    if (resolved.schema && resolved.schemaHash) {
      return this.validator.validate(resolved.schemaHash, resolved.schema, input);
    }
    return [];
  }

  /**
   * 렌더용으로 template 참조를 해석하고 입력을 JSON Schema 로 검증한다.
   * 미등록 템플릿/태그는 404, 스키마 위반은 422(SCHEMA_VALIDATION_FAILED).
   */
  async resolveForRender(tenantId: string, ref: string, input: unknown): Promise<ResolvedTemplate> {
    const resolved = await this.resolveTemplate(tenantId, ref);
    this.assertPublished(resolved);
    const errors = this.validateInput(resolved, input);
    if (errors.length > 0) {
      throw new SchemaValidationException(errors);
    }
    return {
      templateName: resolved.templateName,
      templateTag: resolved.templateTag,
      manifestHash: resolved.manifestHash,
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
