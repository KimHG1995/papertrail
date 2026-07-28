import { ErrorPanel } from './_components/error-panel';
import { getStats, getUsage } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let usage;
  let stats;
  try {
    [usage, stats] = await Promise.all([getUsage(), getStats()]);
  } catch (error) {
    return (
      <>
        <h1>대시보드</h1>
        <ErrorPanel error={error} />
      </>
    );
  }

  const successPct = (stats.successRate * 100).toFixed(1);
  return (
    <>
      <h1>대시보드</h1>
      <div className="tiles">
        <div className="tile">
          <div className="label">이번 달 렌더</div>
          <div className="value">{usage.rendered}</div>
        </div>
        <div className="tile">
          <div className="label">이번 달 실패</div>
          <div className="value">{usage.failed}</div>
        </div>
        <div className="tile">
          <div className="label">쿼터 잔여</div>
          <div className="value">{usage.remaining}</div>
        </div>
        <div className="tile">
          <div className="label">성공률(기간)</div>
          <div className="value">{successPct}%</div>
        </div>
        <div className="tile">
          <div className="label">p95 지연(ms)</div>
          <div className="value">{stats.p95DurationMs}</div>
        </div>
      </div>

      <h2>
        템플릿별 통계 ({stats.from.slice(0, 10)} ~ {stats.to.slice(0, 10)})
      </h2>
      {stats.byTemplate.length === 0 ? (
        <p className="mono">집계된 렌더 이벤트가 없습니다.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>템플릿</th>
              <th>합계</th>
              <th>성공</th>
              <th>실패</th>
              <th>p95(ms)</th>
            </tr>
          </thead>
          <tbody>
            {stats.byTemplate.map((t) => (
              <tr key={t.templateName}>
                <td>{t.templateName}</td>
                <td>{t.total}</td>
                <td>{t.succeeded}</td>
                <td>{t.failed}</td>
                <td>{t.p95DurationMs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {stats.byErrorCode.length > 0 && (
        <>
          <h2>오류 코드</h2>
          <table>
            <thead>
              <tr>
                <th>코드</th>
                <th>건수</th>
              </tr>
            </thead>
            <tbody>
              {stats.byErrorCode.map((e) => (
                <tr key={e.errorCode}>
                  <td className="mono">{e.errorCode}</td>
                  <td>{e.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
