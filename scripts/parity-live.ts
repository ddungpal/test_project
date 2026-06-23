// 라이브 parity 검증(§17 P1) — claude-p(CLI) vs api(Anthropic) 실호출 비교.
// 크레덴셜·CLI 있을 때만. 개발 일상엔 불필요(replay가 $0). 운영 모델 확정 전 1회 실증용.
//
//   ANTHROPIC_API_KEY=... pnpm parity:live
//
// 같은 (system,input,schema)에 대해 두 백엔드의 출력이 모두 스키마를 통과하고
// 핵심 필드가 동형인지 확인한다. 다르면 어댑터의 "호출부 동일=parity" 가정이 깨진 것.

import { claudePDriver } from "../src/llm/backends/claudeP.js";
import { apiDriver } from "../src/llm/backends/api.js";
import { parseAndValidate } from "../src/llm/schema.js";

const SCHEMA = {
  type: "object",
  required: ["headline", "oneLineReason"],
  additionalProperties: false,
  properties: { headline: { type: "string" }, oneLineReason: { type: "string" } },
} as Record<string, unknown>;

const SYSTEM = "너는 유튜브 제목 카피라이터다. 자극적이지 않게 핵심을 한 줄로 뽑는다.";
const INPUT = { topic: "ISA 3년 만기 후 갈아타기", tone: "직설" };

async function main() {
  const args = { roleId: "parity_live", system: SYSTEM, input: INPUT, schema: SCHEMA, model: "sonnet" as const, maxTokens: 512, cache: "none" as const };

  console.log("claude-p 호출…");
  const cp = await claudePDriver.invoke(args);
  const cpData = parseAndValidate<Record<string, unknown>>("parity_live", SCHEMA, cp.rawJson);

  console.log("api 호출…");
  const api = await apiDriver.invoke(args);
  const apiData = parseAndValidate<Record<string, unknown>>("parity_live", SCHEMA, api.rawJson);

  const sameKeys = JSON.stringify(Object.keys(cpData).sort()) === JSON.stringify(Object.keys(apiData).sort());
  console.log("\n--- PARITY 결과 ---");
  console.log("claude-p:", cpData);
  console.log("api     :", apiData);
  console.log("스키마 통과: 양쪽 OK");
  console.log("키 동형:", sameKeys ? "OK ✅" : "불일치 ❌");
  if (!sameKeys) {
    console.error("\n⚠️ parity 깨짐: 두 백엔드의 출력 형태가 다름. 어댑터 프롬프트·tool 강제 방식 재점검 필요.");
    process.exit(1);
  }
  console.log("\nparity OK — '개발 $0(claude-p)→운영(api)' 스위치의 구조화 출력 동형성 확인.");
}

main().catch((e) => {
  console.error("parity-live 실패:", e);
  process.exit(1);
});
