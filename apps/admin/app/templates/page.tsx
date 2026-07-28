import { ErrorPanel } from '../_components/error-panel';
import { listTemplates } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  let templates;
  try {
    templates = await listTemplates();
  } catch (error) {
    return (
      <>
        <h1>템플릿</h1>
        <ErrorPanel error={error} />
      </>
    );
  }

  return (
    <>
      <h1>템플릿</h1>
      {templates.length === 0 ? (
        <p className="mono">등록된 템플릿이 없습니다.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>이름</th>
              <th>최신 태그</th>
              <th>수정 시각</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.name}>
                <td>{t.name}</td>
                <td className="mono">{t.latestTag ?? '-'}</td>
                <td className="mono">{new Date(t.updatedAt).toLocaleString('ko-KR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
