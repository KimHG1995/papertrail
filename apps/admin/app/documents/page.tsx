import { ErrorPanel } from '../_components/error-panel';
import { listDocuments } from '@/lib/api';

export const dynamic = 'force-dynamic';

const shortHash = (h: string | null) => (h ? `${h.replace('sha256:', '').slice(0, 10)}…` : '-');
const fmt = (t: string | null) => (t ? new Date(t).toLocaleString('ko-KR') : '-');

export default async function DocumentsPage() {
  let docs;
  try {
    docs = await listDocuments({ limit: 100 });
  } catch (error) {
    return (
      <>
        <h1>문서</h1>
        <ErrorPanel error={error} />
      </>
    );
  }

  return (
    <>
      <h1>문서</h1>
      {docs.length === 0 ? (
        <p className="mono">
          생성된 문서가 없습니다. <a href="/render">문서 렌더</a>에서 만들어 보세요.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>문서 ID</th>
              <th>상태</th>
              <th>템플릿</th>
              <th>표준</th>
              <th>outputHash</th>
              <th>요청 시각</th>
              <th>소요</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.documentId}>
                <td className="mono">{d.documentId}</td>
                <td>
                  <span className={`badge ${d.status.toLowerCase()}`}>{d.status}</span>
                </td>
                <td className="mono">
                  {d.templateName}
                  {d.templateTag ? `:${d.templateTag}` : ''}
                </td>
                <td className="mono">{d.pdfStandard}</td>
                <td className="mono">{shortHash(d.outputHash)}</td>
                <td className="mono">{fmt(d.requestedAt)}</td>
                <td className="mono">{d.durationMs != null ? `${d.durationMs}ms` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
