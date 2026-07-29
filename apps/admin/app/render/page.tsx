import { ErrorPanel } from '../_components/error-panel';
import { getTemplateTags, listTemplates } from '@/lib/api';
import { RenderConsole, type RenderVersion } from './render-console';

export const dynamic = 'force-dynamic';

export default async function RenderPage() {
  let versions: RenderVersion[];
  try {
    const templates = await listTemplates();
    const all = await Promise.all(
      templates.map(async (t) =>
        (await getTemplateTags(t.name)).tags.map((tag) => ({
          name: t.name,
          tag: tag.tag,
          manifestHash: tag.manifestHash,
          state: tag.state,
        })),
      ),
    );
    versions = all.flat().filter((v) => v.state === 'PUBLISHED');
  } catch (error) {
    return (
      <>
        <h1>문서 생성 / 렌더</h1>
        <ErrorPanel error={error} />
      </>
    );
  }

  return (
    <>
      <h1>문서 생성 / 렌더</h1>
      <p className="mono">
        실제 파이프라인(문서 생성 → 큐 → 워커 렌더 → S3 저장 → 서명 URL)으로 PDF 를 만들고, 증적
        해시와 재현성까지 확인합니다. 워커(`pnpm --filter @papertrail/worker dev`)가 떠 있어야
        합니다.
      </p>
      <RenderConsole versions={versions} />
    </>
  );
}
