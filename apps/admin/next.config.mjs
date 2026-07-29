// 모노레포 루트 .env 를 admin 서버 프로세스에 로드(있으면). Next 는 앱 폴더 기준으로만
// .env 를 읽어 루트 .env(GATEWAY_URL, ADMIN_API_KEY)를 놓치므로 명시적으로 로드한다.
// 없으면 무시하고 lib/api.ts 의 로컬 기본값으로 동작한다. (변경 시 admin dev 재시작 필요)
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url).pathname);
} catch {
  // 루트 .env 없음 → 로컬 기본값 사용
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 워크스페이스 루트를 명시(모노레포에서 파일 추적 경고 방지).
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
};

export default nextConfig;
