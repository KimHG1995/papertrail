import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'PaperTrail Admin',
  description: '버전 관리형 전자문서 생성 및 증적 플랫폼 콘솔',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="topbar">
          <span className="brand">PaperTrail</span>
          <nav>
            <a href="/">대시보드</a>
            <a href="/templates">템플릿</a>
            <a href="/audit">감사 로그</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
