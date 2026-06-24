// dev 파이프라인 preflight 진단(Step 0) 단위 테스트 — 순수 로직만(네트워크·env 무관).
import { describe, it, expect } from "vitest";
import {
  resolveAppUrl,
  sameOrigin,
  diagnoseDevPipeline,
  type DevPipelineSignals,
} from "../src/dev/preflight.js";

describe("resolveAppUrl — 기대 앱 URL 해석", () => {
  it("env 없음 → http://localhost:3000", () => {
    expect(resolveAppUrl()).toBe("http://localhost:3000");
  });

  it("APP_URL 빈값/undefined → http://localhost:3000", () => {
    expect(resolveAppUrl({})).toBe("http://localhost:3000");
    expect(resolveAppUrl({ APP_URL: "" })).toBe("http://localhost:3000");
    expect(resolveAppUrl({ APP_URL: undefined })).toBe("http://localhost:3000");
  });

  it("APP_URL 지정 → 그 값", () => {
    expect(resolveAppUrl({ APP_URL: "http://localhost:3001" })).toBe("http://localhost:3001");
    expect(resolveAppUrl({ APP_URL: "https://app.example.com" })).toBe("https://app.example.com");
  });
});

describe("sameOrigin — scheme+host+port 동일 판정", () => {
  it("path/trailing slash 차이는 무시 → true", () => {
    expect(sameOrigin("http://localhost:3000", "http://localhost:3000/api/inngest")).toBe(true);
    expect(sameOrigin("http://localhost:3000/", "http://localhost:3000")).toBe(true);
  });

  it("port 다르면 → false", () => {
    expect(sameOrigin("http://localhost:3000", "http://localhost:3001")).toBe(false);
  });

  it("localhost vs 127.0.0.1 은 다른 origin → false", () => {
    expect(sameOrigin("http://localhost:3000", "http://127.0.0.1:3000")).toBe(false);
  });

  it("깨진 입력 → false", () => {
    expect(sameOrigin("", "http://localhost:3000")).toBe(false);
    expect(sameOrigin("not a url", "http://localhost:3000")).toBe(false);
    expect(sameOrigin("http://localhost:3000", "")).toBe(false);
  });
});

describe("diagnoseDevPipeline — dev 포트 밀림 등 진단", () => {
  const healthy: DevPipelineSignals = {
    expectedAppUrl: "http://localhost:3000",
    appServingInngest: true,
    inngestReachable: true,
    inngestRegisteredUrls: ["http://localhost:3000/api/inngest"],
  };

  it("전부 정상 → []", () => {
    expect(diagnoseDevPipeline(healthy)).toEqual([]);
  });

  it("버그 재현: 앱은 3000인데 Inngest는 3001 등록 → url-mismatch 1건", () => {
    const out = diagnoseDevPipeline({
      expectedAppUrl: "http://localhost:3000",
      appServingInngest: true,
      inngestReachable: true,
      inngestRegisteredUrls: ["http://localhost:3001/api/inngest"],
    });
    expect(out).toHaveLength(1);
    const p = out[0]!;
    expect(p.kind).toBe("url-mismatch");
    if (p.kind === "url-mismatch") {
      expect(p.expected).toBe("http://localhost:3000");
      expect(p.registered).toEqual(["http://localhost:3001/api/inngest"]);
    }
  });

  it("inngest down → inngest-down (행동가능 토막 포함)", () => {
    const out = diagnoseDevPipeline({ ...healthy, inngestReachable: false });
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("inngest-down");
    expect(out[0]!.message).toContain("inngest-cli dev");
  });

  it("app not serving → app-not-serving (행동가능 토막 포함)", () => {
    const out = diagnoseDevPipeline({ ...healthy, appServingInngest: false });
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("app-not-serving");
    expect(out[0]!.message).toContain("next dev -p");
  });

  it("registered [] → 불일치 미발생(거짓양성 금지)", () => {
    const out = diagnoseDevPipeline({ ...healthy, inngestRegisteredUrls: [] });
    expect(out).toEqual([]);
  });

  it("등록 URL 중 하나라도 same-origin이면 정상", () => {
    const out = diagnoseDevPipeline({
      ...healthy,
      inngestRegisteredUrls: [
        "http://localhost:3001/api/inngest",
        "http://localhost:3000/api/inngest",
      ],
    });
    expect(out).toEqual([]);
  });

  it("동시 실패: inngest down + app not serving → 2건", () => {
    const out = diagnoseDevPipeline({
      ...healthy,
      inngestReachable: false,
      appServingInngest: false,
    });
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.kind).sort()).toEqual(["app-not-serving", "inngest-down"]);
  });
});
