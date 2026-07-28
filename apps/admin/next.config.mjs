/** @type {import('next').NextConfig} */
const nextConfig = {
  // 워크스페이스 루트를 명시(모노레포에서 파일 추적 경고 방지).
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
};

export default nextConfig;
