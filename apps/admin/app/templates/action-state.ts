/**
 * 서버 액션 결과 타입. 'use server' 파일은 async 함수만 export 할 수 있어
 * 상수/타입은 별도 모듈로 분리한다.
 */
export interface ActionState {
  ok: boolean;
  message: string;
}

export const EMPTY_ACTION_STATE: ActionState = { ok: false, message: '' };
