'use client';

import type { TemplateState } from '@papertrail/contracts';
import { useActionState } from 'react';
import { EMPTY_ACTION_STATE } from './action-state';
import { transitionTemplateAction } from './actions';

interface NextStep {
  to: TemplateState;
  label: string;
  kind: 'primary' | 'secondary';
}

/** 서버의 VALID_TRANSITIONS 를 미러링한 승인 워크플로 버튼 구성. */
const NEXT_STEPS: Record<TemplateState, NextStep[]> = {
  DRAFT: [{ to: 'REVIEWING', label: '검토 요청', kind: 'primary' }],
  REVIEWING: [
    { to: 'APPROVED', label: '승인', kind: 'primary' },
    { to: 'DRAFT', label: '반려', kind: 'secondary' },
  ],
  APPROVED: [
    { to: 'PUBLISHED', label: '발행', kind: 'primary' },
    { to: 'DRAFT', label: '반려', kind: 'secondary' },
  ],
  PUBLISHED: [{ to: 'DEPRECATED', label: '지원 종료', kind: 'secondary' }],
  DEPRECATED: [],
};

/** 한 버전(manifestHash)의 상태 전이 버튼들. 클릭한 버튼의 to 값이 함께 전송된다. */
export function TransitionControls({
  name,
  manifestHash,
  state,
}: {
  name: string;
  manifestHash: string;
  state: TemplateState;
}) {
  const [result, action, pending] = useActionState(transitionTemplateAction, EMPTY_ACTION_STATE);
  const steps = NEXT_STEPS[state];

  if (steps.length === 0) {
    return <span className="mono">-</span>;
  }

  return (
    <form action={action} className="row-actions">
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="manifestHash" value={manifestHash} />
      {steps.map((step) => (
        <button
          key={step.to}
          type="submit"
          name="to"
          value={step.to}
          disabled={pending}
          className={step.kind}
        >
          {step.label}
        </button>
      ))}
      {result.message && (
        <span className={result.ok ? 'ok-msg' : 'fail-msg'}>{result.message}</span>
      )}
    </form>
  );
}
