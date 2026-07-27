/** 사용량 집계 기간 키(월, UTC). 예: 2026-07. usage_counter.period 에 쓴다. */
export function usagePeriod(at: Date = new Date()): string {
  const yyyy = at.getUTCFullYear();
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}
