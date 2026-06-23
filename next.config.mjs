/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 서버 전용 비밀(API 키·service role)은 NEXT_PUBLIC_ 접두사 금지 → 클라이언트 번들 유출 차단.
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // 코드베이스는 ESM 관례로 상대 import에 .js 확장자를 쓴다(tsc/tsx는 .ts로 해석).
  // webpack 번들러도 .js → .ts/.tsx 로 해석하도록 매핑(없으면 app/ 라우트에서 src 모듈 resolve 실패).
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
