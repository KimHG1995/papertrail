'use server';

import {
  RegisterTemplateRequest,
  TemplateName,
  TransitionStateRequest,
} from '@papertrail/contracts';
import { revalidatePath } from 'next/cache';
import { registerTemplate, transitionTemplate } from '@/lib/api';
import type { ActionState } from './action-state';

/** 템플릿 등록(publish) 서버 액션. API Key 는 서버에만 머문다. */
export async function registerTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get('name') ?? '').trim();
  const tag = String(formData.get('tag') ?? '').trim() || 'latest';
  const source = String(formData.get('source') ?? '');
  const author = String(formData.get('author') ?? '').trim();
  const schemaRaw = String(formData.get('schema') ?? '').trim();

  const nameCheck = TemplateName.safeParse(name);
  if (!nameCheck.success) {
    return { ok: false, message: '이름은 소문자, 숫자, 하이픈만 사용할 수 있습니다.' };
  }

  let schema: Record<string, unknown> | undefined;
  if (schemaRaw) {
    try {
      schema = JSON.parse(schemaRaw) as Record<string, unknown>;
    } catch {
      return { ok: false, message: 'JSON Schema 가 올바른 JSON 형식이 아닙니다.' };
    }
  }

  const body = RegisterTemplateRequest.safeParse({
    source,
    author: author || undefined,
    schema,
  });
  if (!body.success) {
    return { ok: false, message: body.error.issues[0]?.message ?? '입력이 올바르지 않습니다.' };
  }

  try {
    const result = await registerTemplate(name, tag, body.data);
    revalidatePath('/templates');
    return { ok: true, message: `등록됨: ${result.name}:${result.tag} (${result.state})` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** 승인 워크플로 상태 전이 서버 액션. */
export async function transitionTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get('name') ?? '');
  const parsed = TransitionStateRequest.safeParse({
    manifestHash: String(formData.get('manifestHash') ?? ''),
    to: String(formData.get('to') ?? ''),
  });
  if (!parsed.success) {
    return { ok: false, message: '상태 전이 요청이 올바르지 않습니다.' };
  }

  try {
    const result = await transitionTemplate(name, parsed.data);
    revalidatePath('/templates');
    return { ok: true, message: `${name} → ${result.state}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
