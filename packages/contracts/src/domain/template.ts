import { z } from 'zod';
import { HashRef, JsonObject } from './common.js';

/** 템플릿 승인 워크플로 상태. docs/03-api.md §3.4 */
export const TemplateState = z.enum(['DRAFT', 'REVIEWING', 'APPROVED', 'PUBLISHED', 'DEPRECATED']);
export type TemplateState = z.infer<typeof TemplateState>;

/**
 * POST /v1/templates/{name}/publish 요청 본문.
 * 명세(docs/03)는 multipart 이나 M1 은 JSON 으로 단순화한다(asset 파일은 후속).
 * schema 는 렌더 입력을 검증할 JSON Schema(선택, 있으면 문서 생성 시 검증).
 */
export const RegisterTemplateRequest = z.object({
  source: z.string().min(1, 'Typst 소스는 필수입니다.'),
  schema: JsonObject.optional(),
  author: z.string().optional(),
});
export type RegisterTemplateRequest = z.infer<typeof RegisterTemplateRequest>;

/** 템플릿 이름 (URL-safe slug). */
export const TemplateName = z
  .string()
  .min(1, '템플릿 이름은 필수입니다.')
  .regex(/^[a-z0-9][a-z0-9-]*$/, '소문자, 숫자, 하이픈만 사용할 수 있습니다.');
export type TemplateName = z.infer<typeof TemplateName>;

/** POST /v1/templates/{name}/publish 응답 data. */
export const TemplatePublished = z.object({
  name: TemplateName,
  tag: z.string().min(1),
  manifestHash: HashRef,
  state: TemplateState,
  createdAt: z.iso.datetime(),
});
export type TemplatePublished = z.infer<typeof TemplatePublished>;

/** GET /v1/templates 목록 원소. */
export const TemplateListItem = z.object({
  name: TemplateName,
  latestTag: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type TemplateListItem = z.infer<typeof TemplateListItem>;

/** 태그 → manifest 매핑 원소. */
export const TemplateTag = z.object({
  tag: z.string().min(1),
  manifestHash: HashRef,
  state: TemplateState,
});
export type TemplateTag = z.infer<typeof TemplateTag>;

/** GET /v1/templates/{name}/tags 응답 data. */
export const TemplateTags = z.object({
  name: TemplateName,
  tags: z.array(TemplateTag),
});
export type TemplateTags = z.infer<typeof TemplateTags>;

/** POST /v1/templates/{name}/tags/{tag} 요청 본문 (태그 승격). */
export const PromoteTagRequest = z.object({
  manifestHash: HashRef,
});
export type PromoteTagRequest = z.infer<typeof PromoteTagRequest>;

/** POST /v1/templates/{name}/state 요청 본문 (상태 전이). */
export const TransitionStateRequest = z.object({
  manifestHash: HashRef,
  to: TemplateState,
});
export type TransitionStateRequest = z.infer<typeof TransitionStateRequest>;
