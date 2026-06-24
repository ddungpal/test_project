// dev 파이프라인 preflight 진단 — 순수 로직만.
// 네트워크·fetch·DB·LLM·process.env 직접 접근 금지(인자로 받은 값만 사용).
// 배경: dev 포트가 3000→3001로 밀리면 Inngest가 죽은 포트를 때려 런이 조용히 깨진다.
// 런 전에 신호만 받아 행동가능한 진단을 돌려준다.

/** 기대 앱 URL을 env에서 해석. 기본 http://localhost:3000. (config.ts의 envStr 패턴, 단 인자 env에서 읽음) */
export function resolveAppUrl(env?: Record<string, string | undefined>): string {
  const v = env?.["APP_URL"];
  return v === undefined || v === "" ? "http://localhost:3000" : v;
}

/** 두 URL이 같은 origin(scheme+host+port)인지. path/trailing slash 차이는 무시, 파싱 불가는 false. */
export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

export interface DevPipelineSignals {
  expectedAppUrl: string;
  appServingInngest: boolean;
  inngestReachable: boolean;
  inngestRegisteredUrls: string[];
}

export type DevPipelineProblem =
  | { kind: "inngest-down"; message: string }
  | { kind: "app-not-serving"; message: string }
  | { kind: "url-mismatch"; expected: string; registered: string[]; message: string };

/** dev 파이프라인 신호를 진단. 발견된 문제 모두 반환(정의된 순서), 문제 없으면 []. */
export function diagnoseDevPipeline(s: DevPipelineSignals): DevPipelineProblem[] {
  const problems: DevPipelineProblem[] = [];

  if (s.inngestReachable === false) {
    problems.push({
      kind: "inngest-down",
      message: `Inngest dev가 안 떠 있다 → \`npx inngest-cli dev -u ${s.expectedAppUrl}/api/inngest\` 실행`,
    });
  }

  if (s.appServingInngest === false) {
    problems.push({
      kind: "app-not-serving",
      message: `앱이 ${s.expectedAppUrl}에 없다(다른 포트로 밀렸거나 안 떴다) → \`next dev -p 3000\` 으로 고정 기동`,
    });
  }

  // 포트 불일치: Inngest는 떠 있고 등록 URL이 있는데, 그 중 expected와 same-origin이 하나도 없을 때만.
  // 등록 URL이 비어 있으면 판정 생략(거짓양성 금지).
  if (
    s.inngestReachable === true &&
    s.inngestRegisteredUrls.length > 0 &&
    !s.inngestRegisteredUrls.some((u) => sameOrigin(s.expectedAppUrl, u))
  ) {
    problems.push({
      kind: "url-mismatch",
      expected: s.expectedAppUrl,
      registered: s.inngestRegisteredUrls,
      message: `Inngest가 ${s.inngestRegisteredUrls.join(", ")}에 등록됨, 앱은 ${s.expectedAppUrl} — 포트 불일치. Inngest를 \`-u ${s.expectedAppUrl}/api/inngest\`로 재기동`,
    });
  }

  return problems;
}
