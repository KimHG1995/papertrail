'use client';

import { useActionState } from 'react';
import { EMPTY_ACTION_STATE } from './action-state';
import { registerTemplateAction } from './actions';

const SAMPLE_SOURCE = `#set page(paper: "a4", margin: 2cm)
= 문서 제목
본문 내용을 여기에 작성합니다.`;

/** 템플릿 등록 폼. 제출 시 서버 액션이 게이트웨이로 publish 한다. */
export function RegisterForm() {
  const [state, action, pending] = useActionState(registerTemplateAction, EMPTY_ACTION_STATE);

  return (
    <form action={action} className="card form">
      <div className="form-row">
        <label>
          이름 (slug)
          <input name="name" placeholder="training-notice" required />
        </label>
        <label>
          태그
          <input name="tag" placeholder="latest" defaultValue="latest" />
        </label>
        <label>
          작성자
          <input name="author" placeholder="선택" />
        </label>
      </div>
      <label>
        Typst 소스
        <textarea name="source" rows={7} placeholder={SAMPLE_SOURCE} required />
      </label>
      <label>
        입력 JSON Schema (선택)
        <textarea
          name="schema"
          rows={4}
          placeholder='{ "type": "object", "properties": { ... } }'
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="primary" disabled={pending}>
          {pending ? '등록 중...' : '템플릿 등록'}
        </button>
        {state.message && <span className={state.ok ? 'ok-msg' : 'fail-msg'}>{state.message}</span>}
      </div>
    </form>
  );
}
