// dev 파이프라인 preflight — 런 돌리기 전 앱/Inngest 포트 일치를 눈으로 대조.
//   실행: npx tsx scripts/dev-preflight.ts   (또는 npm run preflight)
//
// step0 순수함수(src/dev/preflight.ts)에 실제 로컬 신호를 넣어 진단한다.
// 신호 수집은 전부 best-effort — 어떤 fetch도 throw로 스크립트를 죽이지 않는다.

import {
  resolveAppUrl,
  diagnoseDevPipeline,
  type DevPipelineSignals,
} from "../src/dev/preflight.js";

const TIMEOUT_MS = 2000;

/** fetch가 2xx로 응답하는지. 실패·타임아웃·비2xx는 모두 false. */
async function fetchOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

/** 서버에 연결만 되면 true(상태코드 무관). 연결 거부·타임아웃은 false. */
async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const appUrl = resolveAppUrl(process.env);

  // 항상 기대 URL을 찍어 사람이 눈으로 대조 가능하게.
  console.log(`▶ 기대 앱 URL: ${appUrl} · Inngest dev: http://localhost:8288`);

  const signals: DevPipelineSignals = {
    expectedAppUrl: appUrl,
    appServingInngest: await fetchOk(`${appUrl}/api/inngest`),
    inngestReachable: await reachable("http://localhost:8288"),
    // Inngest dev 서버의 sync된 앱 URL 목록은 API 경로가 불확실 → []로 둬 url-mismatch 거짓경고 방지.
    inngestRegisteredUrls: [],
  };

  const problems = diagnoseDevPipeline(signals);

  if (problems.length === 0) {
    console.log(`✅ dev 파이프라인 정상 (앱 ${appUrl} · Inngest 8288)`);
    process.exit(0);
  }

  for (const p of problems) {
    console.error(`❌ ${p.message}`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error("preflight 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
