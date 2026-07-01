import { describe, it, expect } from "vitest";
import { subscriptionEnv } from "../src/llm/backends/claudeP.js";

describe("subscriptionEnv — claude-p는 구독으로만 (API 키 제거)", () => {
  it("ANTHROPIC_API_KEY/AUTH_TOKEN을 제거한다", () => {
    const out = subscriptionEnv({ PATH: "/bin", ANTHROPIC_API_KEY: "sk-x", ANTHROPIC_AUTH_TOKEN: "tok" });
    expect(out.ANTHROPIC_API_KEY).toBeUndefined();
    expect(out.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(out.PATH).toBe("/bin"); // 나머지 env는 보존
  });
  it("키가 없어도 안전(다른 env 보존)", () => {
    const out = subscriptionEnv({ PATH: "/bin", HOME: "/h" });
    expect(out).toEqual({ PATH: "/bin", HOME: "/h" });
  });
});
