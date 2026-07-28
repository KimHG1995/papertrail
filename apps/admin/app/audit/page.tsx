import { ErrorPanel } from '../_components/error-panel';
import { listAudit } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  let entries;
  try {
    entries = await listAudit();
  } catch (error) {
    return (
      <>
        <h1>감사 로그</h1>
        <ErrorPanel error={error} />
      </>
    );
  }

  return (
    <>
      <h1>감사 로그</h1>
      {entries.length === 0 ? (
        <p className="mono">감사 기록이 없습니다.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>시각</th>
              <th>액션</th>
              <th>리소스</th>
              <th>상태</th>
              <th>API Key</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="mono">{new Date(e.createdAt).toLocaleString('ko-KR')}</td>
                <td className="mono">{e.action}</td>
                <td className="mono">{e.resourceId ?? '-'}</td>
                <td>{e.statusCode}</td>
                <td className="mono">{e.apiKeyId ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
