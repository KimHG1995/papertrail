/** 게이트웨이 조회 실패 시 표시하는 패널. */
export function ErrorPanel({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="error">
      데이터를 불러오지 못했습니다. 게이트웨이가 실행 중인지 확인하세요.
      <br />
      <span className="mono">{message}</span>
    </div>
  );
}
