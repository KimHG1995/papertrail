import { ErrorPanel } from '../_components/error-panel';
import { getTemplateTags, listTemplates } from '@/lib/api';
import { RegisterForm } from './register-form';
import { TransitionControls } from './transition-controls';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  let blocks: { name: string; tags: Awaited<ReturnType<typeof getTemplateTags>>['tags'] }[];
  try {
    const templates = await listTemplates();
    blocks = await Promise.all(
      templates.map(async (t) => ({
        name: t.name,
        tags: (await getTemplateTags(t.name)).tags,
      })),
    );
  } catch (error) {
    return (
      <>
        <h1>템플릿</h1>
        <RegisterForm />
        <ErrorPanel error={error} />
      </>
    );
  }

  return (
    <>
      <h1>템플릿</h1>
      <RegisterForm />

      <h2>등록된 템플릿 · 승인 워크플로</h2>
      {blocks.length === 0 ? (
        <p className="mono">등록된 템플릿이 없습니다. 위에서 첫 템플릿을 등록하세요.</p>
      ) : (
        blocks.map((block) => (
          <section key={block.name} className="tpl-block">
            <h3>{block.name}</h3>
            <table>
              <thead>
                <tr>
                  <th>태그</th>
                  <th>버전 (manifestHash)</th>
                  <th>상태</th>
                  <th>승인 워크플로</th>
                </tr>
              </thead>
              <tbody>
                {block.tags.map((tag) => (
                  <tr key={`${tag.tag}:${tag.manifestHash}`}>
                    <td className="mono">{tag.tag}</td>
                    <td className="mono">{tag.manifestHash.slice(0, 23)}…</td>
                    <td>
                      <span className={`badge ${tag.state.toLowerCase()}`}>{tag.state}</span>
                    </td>
                    <td>
                      <TransitionControls
                        name={block.name}
                        manifestHash={tag.manifestHash}
                        state={tag.state}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </>
  );
}
