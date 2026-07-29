'use client';

import { useState } from 'react';

export interface RenderVersion {
  name: string;
  tag: string;
  manifestHash: string;
  state: string;
}

interface DocDetail {
  status: string;
  templateName?: string;
  templateTag?: string | null;
  templateHash?: string | null;
  inputHash?: string;
  outputHash?: string | null;
  pdfStandard?: string;
  durationMs?: number | null;
  downloadUrl?: string | null;
  maskedPreview?: unknown;
}

interface VerifyOutcome {
  reproducible: boolean;
  inputHash: { matches: boolean };
  outputHash: { matches: boolean };
}

// 예제 템플릿(training-notice)용 샘플. 다른 템플릿을 고르면 그 스키마에 맞게 수정하세요.
const SAMPLE = JSON.stringify(
  {
    org: 'PaperTrail Institute',
    refNo: 'TRN-2026-000123',
    recipient: { name: 'Jane Doe', employeeId: 'E-10482', department: 'Safety & Compliance' },
    course: {
      title: 'Workplace Safety Fundamentals',
      period: '2026-07-06 ~ 2026-07-24',
      totalHours: 16,
    },
    sessions: [
      { date: '2026-07-06', topic: 'Hazard Identification', hours: 4 },
      { date: '2026-07-13', topic: 'Emergency Response Drills', hours: 6 },
      { date: '2026-07-24', topic: 'Assessment and Review', hours: 6 },
    ],
    result: { passed: true, score: 92 },
    issuedAt: '2026-07-29',
    issuer: { name: 'Alex Kim', title: 'Training Director' },
  },
  null,
  2,
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 실제 문서 파이프라인(생성 → 비동기 렌더 → 다운로드 → 재현성 검증)을 어드민에서 실행한다. */
export function RenderConsole({ versions }: { versions: RenderVersion[] }) {
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [docId, setDocId] = useState('');
  const [verify, setVerify] = useState<VerifyOutcome | null>(null);

  const addLog = (line: string) => setLogs((prev) => [...prev, line]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setDoc(null);
    setVerify(null);
    setLogs([]);
    const fd = new FormData(e.currentTarget);
    const [name, tag] = String(fd.get('version') ?? '').split('::');
    const pdfStandard = String(fd.get('pdfStandard') ?? 'pdf-1.7');
    let data: unknown;
    try {
      data = JSON.parse(String(fd.get('data') ?? '{}'));
    } catch {
      setError('데이터가 올바른 JSON 이 아닙니다.');
      return;
    }
    if (!name || !tag) {
      setError('템플릿 버전을 선택하세요.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          template: `${name}:${tag}`,
          document: data,
          pdfStandard,
          storeInput: true,
        }),
      });
      const created = (await res.json()) as {
        documentId?: string;
        status?: string;
        error?: string;
      };
      if (!res.ok || !created.documentId) {
        setError(created.error ?? '문서 생성 실패');
        setBusy(false);
        return;
      }
      setDocId(created.documentId);
      addLog(`생성됨: ${created.documentId} (${created.status})`);

      for (let i = 1; i <= 40; i++) {
        await sleep(1000);
        const r = await fetch(`/api/documents/${created.documentId}`, { cache: 'no-store' });
        const d = (await r.json()) as DocDetail & { error?: string };
        if (d.error) {
          setError(d.error);
          break;
        }
        addLog(`[${i}] ${d.status}`);
        if (d.status === 'SUCCEEDED') {
          setDoc(d);
          break;
        }
        if (d.status === 'FAILED') {
          setDoc(d);
          setError('렌더 실패 (워커 로그 확인)');
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  async function onVerify() {
    setVerify(null);
    const r = await fetch(`/api/documents/${docId}/verify`, { method: 'POST' });
    const v = (await r.json()) as VerifyOutcome & { error?: string };
    if (v.error) {
      setError(v.error);
      return;
    }
    setVerify(v);
  }

  if (versions.length === 0) {
    return (
      <p className="mono">
        렌더할 수 있는 PUBLISHED 템플릿이 없습니다. 먼저 <a href="/templates">템플릿</a>에서
        등록하고 승인 워크플로로 PUBLISHED 상태로 만드세요.
      </p>
    );
  }

  return (
    <>
      <form onSubmit={onSubmit} className="card form">
        <div className="form-row">
          <label>
            템플릿 버전 (PUBLISHED)
            <select name="version" required>
              {versions.map((v) => (
                <option key={`${v.name}:${v.tag}`} value={`${v.name}::${v.tag}`}>
                  {v.name}:{v.tag}
                </option>
              ))}
            </select>
          </label>
          <label>
            PDF 표준
            <select name="pdfStandard" defaultValue="a-3b">
              <option value="pdf-1.7">PDF 1.7</option>
              <option value="a-2b">PDF/A-2b</option>
              <option value="a-3b">PDF/A-3b</option>
            </select>
          </label>
        </div>
        <label>
          변수값 (document JSON)
          <textarea name="data" rows={14} defaultValue={SAMPLE} spellCheck={false} />
        </label>
        <div className="form-actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? '렌더 중...' : '문서 생성 및 렌더'}
          </button>
          {error && <span className="fail-msg">{error}</span>}
        </div>
      </form>

      {logs.length > 0 && (
        <div className="render-log mono">
          {logs.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}

      {doc && doc.status === 'SUCCEEDED' && (
        <div className="render-result">
          <h2>증적 (Audit Trail)</h2>
          <div className="kv mono">
            <span>templateHash</span>
            <span>{doc.templateHash}</span>
            <span>inputHash</span>
            <span>{doc.inputHash}</span>
            <span>outputHash</span>
            <span>{doc.outputHash}</span>
            <span>pdfStandard</span>
            <span>{doc.pdfStandard}</span>
            <span>durationMs</span>
            <span>{doc.durationMs}</span>
          </div>

          <div className="form-actions">
            {doc.downloadUrl && (
              <a className="btn-link" href={doc.downloadUrl} target="_blank" rel="noreferrer">
                PDF 새 탭에서 열기 / 다운로드
              </a>
            )}
            <button type="button" className="secondary" onClick={onVerify}>
              재현성 검증
            </button>
            {verify && (
              <span className={verify.reproducible ? 'ok-msg' : 'fail-msg'}>
                reproducible={String(verify.reproducible)} · input=
                {String(verify.inputHash.matches)} · output={String(verify.outputHash.matches)}
              </span>
            )}
          </div>

          {doc.downloadUrl && (
            <iframe className="render-frame" src={doc.downloadUrl} title="PDF 미리보기" />
          )}

          {doc.maskedPreview != null && (
            <>
              <h2>저장된 입력 (PII 마스킹됨)</h2>
              <pre className="render-log mono">{JSON.stringify(doc.maskedPreview, null, 2)}</pre>
            </>
          )}
        </div>
      )}
    </>
  );
}
