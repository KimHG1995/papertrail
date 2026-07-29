import { ErrorPanel } from '../_components/error-panel';
import { listBatches } from '@/lib/api';

export const dynamic = 'force-dynamic';

const fmt = (t: string | null) => (t ? new Date(t).toLocaleString('ko-KR') : '-');
const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 100);

export default async function BatchesPage() {
  let batches;
  try {
    batches = await listBatches(100);
  } catch (error) {
    return (
      <>
        <h1>배치</h1>
        <ErrorPanel error={error} />
      </>
    );
  }

  return (
    <>
      <h1>배치 (CSV 대량 생성)</h1>
      {batches.length === 0 ? (
        <p className="mono">생성된 배치가 없습니다.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>배치 ID</th>
              <th>상태</th>
              <th>템플릿</th>
              <th>진행률</th>
              <th>총건</th>
              <th>성공</th>
              <th>실패</th>
              <th>생성 시각</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.batchId}>
                <td className="mono">{b.batchId}</td>
                <td>
                  <span className={`badge ${b.status.toLowerCase()}`}>{b.status}</span>
                </td>
                <td className="mono">{b.templateRef}</td>
                <td className="mono">{pct(b.succeeded + b.failed, b.total)}%</td>
                <td className="mono">{b.total}</td>
                <td className="mono">{b.succeeded}</td>
                <td className="mono">{b.failed}</td>
                <td className="mono">{fmt(b.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
