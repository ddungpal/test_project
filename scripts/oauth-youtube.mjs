// YouTube Analytics OAuth — refresh token 1회 발급 헬퍼.
//   CTR·시청지속률·기간별 조회수는 채널 소유자 비공개 지표 → OAuth 필수(yt-analytics.readonly).
//   데스크톱 OAuth 클라이언트는 loopback(http://localhost:PORT) 리다이렉트를 임의 포트로 허용한다.
//
//   준비: Google Cloud Console에서
//     1) YouTube Analytics API + YouTube Data API v3 사용 설정
//     2) OAuth 동의화면(외부) 만들고 '테스트 사용자'에 본인(채널 소유 계정) 추가
//     3) 사용자 인증 정보 → OAuth 클라이언트 ID → 애플리케이션 유형 '데스크톱 앱' → Client ID/Secret 복사
//
//   실행 (프로젝트 루트에서): node scripts/oauth-youtube.mjs
//   → CLIENT_ID/SECRET 는 .env 에서 자동 로드. 출력된 URL을 브라우저로 열고 '허용' → 이 창이 refresh token을 출력한다. 그 값을 .env에 넣는다.

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

// .env 에서 CLIENT_ID/SECRET 자동 로드(env로 이미 넘겼으면 그 값 우선). 셸 한 줄 트릭 불필요.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*(YT_OAUTH_CLIENT_ID|YT_OAUTH_CLIENT_SECRET)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const CLIENT_ID = process.env.YT_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.YT_OAUTH_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("YT_OAUTH_CLIENT_ID / YT_OAUTH_CLIENT_SECRET 를 env로 넘겨라.");
  process.exit(1);
}

const PORT = 53682; // 데스크톱 클라이언트 loopback — 임의 포트 허용(사전 등록 불필요).
const REDIRECT = `http://localhost:${PORT}`;
const SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");
const STATE = randomBytes(8).toString("hex");

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline", // refresh_token 발급에 필수
    prompt: "consent", // 매번 refresh_token 재발급(이미 동의했어도)
    state: STATE,
  });

console.log("\n1) 아래 URL을 브라우저에서 열고 '허용'을 누르세요(채널 소유 계정으로 로그인):\n");
console.log(authUrl + "\n");
console.log(`2) 허용하면 이 창이 refresh token을 출력합니다. (대기 중… localhost:${PORT})\n`);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  if (!url.searchParams.get("code")) {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (state !== STATE) {
    res.writeHead(400).end("state 불일치");
    console.error("❌ state 불일치 — 재시도.");
    server.close();
    process.exit(1);
  }
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT,
        grant_type: "authorization_code",
      }),
    });
    const json = await tokenRes.json();
    if (!tokenRes.ok || !json.refresh_token) {
      res.writeHead(500).end("토큰 교환 실패 — 터미널 확인");
      console.error("❌ 토큰 교환 실패:", JSON.stringify(json, null, 2));
      console.error("refresh_token이 없으면: 동의화면에서 prompt=consent + access_type=offline 확인, 또는 계정의 기존 권한 해제 후 재시도.");
      server.close();
      process.exit(1);
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end("<h2>인증 완료 ✅ 터미널로 돌아가세요.</h2>");
    console.log("✅ 인증 완료. 아래 3줄을 .env 에 넣으세요:\n");
    console.log(`YT_OAUTH_CLIENT_ID=${CLIENT_ID}`);
    console.log(`YT_OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`YT_OAUTH_REFRESH_TOKEN=${json.refresh_token}\n`);
    console.log("그리고 PERFORMANCE_SOURCE=youtube 로 바꾸면 실수집이 켜집니다.");
    server.close();
    process.exit(0);
  } catch (e) {
    res.writeHead(500).end("오류");
    console.error("❌", e);
    server.close();
    process.exit(1);
  }
});
server.listen(PORT);
