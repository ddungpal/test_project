// 김짠부 피드백 학습 sweep 코어(submitOwnerFeedbackSweep) 단위 — extract 를 impl 함수 스텁 + 카운터로 격리.
//   ★ vi.fn 지양 규칙: impl 함수 + 카운터로 스텁한다(rejected promise 삼킴 오탐 방지).
//   ★ 서버액션(submitOwnerFeedback)은 requireOwner+createAdminClient 로 이 코어를 감싸는 얇은 래퍼라 직접 테스트 안 함.
//   검증: ① 피드백 있음 → extract 1회 → style_profiles insert(*_owner_rules·status='draft'·version 스코프 max+1).
//          ② 빈 피드백 → extract·insert 미호출, created:false·기존 규칙 수 반환.
//          ③ 활성 규칙(patterns.rules)을 existingRules 로 넘기고 sources 누적.
//          ④ extractOwnerFeedbackRules 빈 피드백 방어 + rules ?? [] 정규화(driver 스텁).
//          ⑤ componentTypeFor·buildOwnerRulesDraftPatterns 순수 매핑.
import { describe, it, expect, beforeEach } from "vitest";
import type { LlmConfig } from "../src/llm/config.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { LlmBackendDriver, LlmUsage } from "../src/llm/types.js";
import { submitOwnerFeedbackSweep } from "../src/performance/ownerRulesRelearn.js";
import type { OwnerFeedbackResult } from "../src/agents/owner_feedback/schema.js";
import { extractOwnerFeedbackRules } from "../src/agents/owner_feedback/step.js";
import { componentTypeFor, buildOwnerRulesDraftPatterns } from "../src/app/actions/copyLearnMap.js";

interface StyleProfileRow {
  id: string;
  component_type: string;
  version: number;
  patterns: unknown;
  status: string;
}
interface Db {
  style_profiles: StyleProfileRow[];
}

let idSeq = 0;
function newId(prefix: string): string {
  return `${prefix}-${++idSeq}`;
}

/** submitOwnerFeedbackSweep 이 쓰는 supa 경로(active 로드 + version select + draft insert)만 흉내내는 인메모리 fake. */
function makeFakeSupa(db: Db): { supa: Supa; inserts: Record<string, unknown>[] } {
  const inserts: Record<string, unknown>[] = [];
  const builder = (table: keyof Db) => {
    const filters: Array<[string, unknown]> = [];
    let op: "select" | "insert" = "select";
    let insertPayload: unknown = null;
    let orderDesc = false;

    const rowsOf = () => db[table] as unknown as Record<string, unknown>[];
    const match = (r: Record<string, unknown>) => filters.every(([c, v]) => r[c] === v);

    const api: Record<string, unknown> = {
      select: () => api,
      insert: (payload: unknown) => {
        op = "insert";
        insertPayload = payload;
        return api;
      },
      eq: (c: string, v: unknown) => {
        filters.push([c, v]);
        return api;
      },
      order: () => {
        orderDesc = true;
        return api;
      },
      limit: () => api,
      maybeSingle: () => {
        const matched = rowsOf().filter(match);
        if (orderDesc) matched.sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0));
        return Promise.resolve({ data: matched[0] ?? null, error: null });
      },
      single: () => {
        if (op === "insert") {
          const raw = insertPayload as Record<string, unknown>;
          inserts.push(raw);
          const row = { id: newId(String(table)), ...raw };
          rowsOf().push(row);
          return Promise.resolve({ data: row, error: null });
        }
        return Promise.resolve({ data: rowsOf().filter(match)[0] ?? null, error: null });
      },
    };
    return api;
  };
  return { supa: { from: (t: keyof Db) => builder(t) } as unknown as Supa, inserts };
}

const CONFIG = { softCapUsd: 7, hardCapUsd: 10 } as unknown as LlmConfig;

beforeEach(() => {
  idSeq = 0;
});

/** extract 스텁 함수 시그니처(non-optional — deps.extract 로 넘김). */
type ExtractFn = (
  input: { component: "title" | "thumbnail"; existingRules: string[]; candidates: unknown; feedback: string },
) => Promise<OwnerFeedbackResult>;

/** impl 함수 스텁 + 호출 카운터(vi.fn 지양 규칙). extract 는 병합 규칙셋을 그대로 반환. */
function makeExtractStub(rules: string[]): { extract: ExtractFn; calls: () => number; seen: unknown[] } {
  let calls = 0;
  const seen: unknown[] = [];
  const extract: ExtractFn = async (input) => {
    calls += 1;
    seen.push(input);
    return { rules, change_note: "test note" };
  };
  return { extract, calls: () => calls, seen };
}

describe("submitOwnerFeedbackSweep (코어 — 스텁 deps 주입)", () => {
  it("피드백 있음 → extract 1회 → style_profiles insert(title_owner_rules·draft·version 1)", async () => {
    const { supa, inserts } = makeFakeSupa({ style_profiles: [] });
    const e = makeExtractStub(["제목엔 구체 수치를 포함한다"]);

    const res = await submitOwnerFeedbackSweep(
      supa,
      { component: "title", candidates: ["제목 A", "제목 B"], feedback: "숫자 없으면 안 눌러" },
      { config: CONFIG, extract: e.extract },
    );

    expect(res.created).toBe(true);
    expect(res.version).toBe(1);
    expect(res.ruleCount).toBe(1);
    expect(e.calls()).toBe(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ component_type: "title_owner_rules", status: "draft", version: 1 });
    const p = inserts[0]!.patterns as { rules: string[]; sources: unknown[] };
    expect(p.rules).toEqual(["제목엔 구체 수치를 포함한다"]);
    expect(p.sources).toHaveLength(1);
  });

  it("빈 피드백(공백) → extract·insert 미호출, created:false·기존 규칙 수 반환", async () => {
    const { supa, inserts } = makeFakeSupa({
      style_profiles: [
        { id: "a", component_type: "title_owner_rules", version: 3, patterns: { rules: ["r1", "r2"], sources: [] }, status: "active" },
      ],
    });
    const e = makeExtractStub(["should not be used"]);

    const res = await submitOwnerFeedbackSweep(
      supa,
      { component: "title", candidates: [], feedback: "   " },
      { config: CONFIG, extract: e.extract },
    );

    expect(res).toEqual({ created: false, version: null, id: null, ruleCount: 2 });
    expect(e.calls()).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it("활성 규칙을 existingRules 로 넘기고, version=스코프 max+1·sources 누적", async () => {
    // 활성 title_owner_rules v2(rules 2·sources 1) + 무관 title v9 → 다음 version=3, sources=2.
    const { supa, inserts } = makeFakeSupa({
      style_profiles: [
        { id: "own", component_type: "title_owner_rules", version: 2, patterns: { rules: ["기존1", "기존2"], sources: [{ feedback: "옛날", candidates: [] }] }, status: "active" },
        { id: "t", component_type: "title", version: 9, patterns: {}, status: "active" },
      ],
    });
    const e = makeExtractStub(["기존1", "기존2", "신규3"]);

    const res = await submitOwnerFeedbackSweep(
      supa,
      { component: "title", topic: "노후 준비", candidates: ["제목 X"], feedback: "구체적으로 써" },
      { config: CONFIG, extract: e.extract },
    );

    // existingRules 를 추출기에 넘겼는지
    expect(e.seen[0]).toMatchObject({ existingRules: ["기존1", "기존2"] } as object);
    expect(res.version).toBe(3);
    expect(inserts[0]).toMatchObject({ component_type: "title_owner_rules", version: 3 });
    const p = inserts[0]!.patterns as { rules: string[]; sources: Array<{ topic?: string; feedback: string }> };
    expect(p.rules).toEqual(["기존1", "기존2", "신규3"]);
    expect(p.sources).toHaveLength(2); // 이전 1 + 이번 1
    expect(p.sources[1]).toMatchObject({ topic: "노후 준비", feedback: "구체적으로 써" });
  });

  it("thumbnail → thumbnail_owner_rules 스코프", async () => {
    const { supa, inserts } = makeFakeSupa({ style_profiles: [] });
    const e = makeExtractStub(["낚시성 과장은 쓰지 않는다"]);

    await submitOwnerFeedbackSweep(
      supa,
      { component: "thumbnail", candidates: [{ main: ["충격", "실화"], box: ["월 300", "실화냐"] }], feedback: "낚시 별로" },
      { config: CONFIG, extract: e.extract },
    );

    expect(inserts[0]).toMatchObject({ component_type: "thumbnail_owner_rules" });
  });
});

/** driver 스텁 — owner_feedback_extractor 응답의 rawJson 을 지정. */
function makeDriver(rawJson: string): { driver: LlmBackendDriver; calls: () => number } {
  let calls = 0;
  const usage: LlmUsage = { inTok: 10, outTok: 10, cachedInTok: 0 };
  const driver: LlmBackendDriver = {
    name: "claude-p",
    async invoke() {
      calls += 1;
      return { rawJson, usage };
    },
  };
  return { driver, calls: () => calls };
}

describe("extractOwnerFeedbackRules (빈 입력 방어 + rules ?? [] 정규화)", () => {
  it("feedback 공백뿐 → LLM 미호출, 기존 규칙 그대로 반환", async () => {
    const { driver, calls } = makeDriver("{}");
    const res = await extractOwnerFeedbackRules(
      { component: "title", existingRules: ["r1"], candidates: [], feedback: "  " },
      CONFIG,
      { driver },
    );
    expect(res).toEqual({ rules: ["r1"], change_note: "" });
    expect(calls()).toBe(0); // LLM 미호출
  });

  it("모델이 rules 누락(change_note 만) → rules ?? [] 로 빈 배열 정규화(critic 사건 회귀)", async () => {
    const { driver } = makeDriver(JSON.stringify({ change_note: "변경 없음" }));
    const res = await extractOwnerFeedbackRules(
      { component: "title", existingRules: ["r1"], candidates: ["제목 A"], feedback: "숫자 넣어" },
      CONFIG,
      { driver },
    );
    expect(res.rules).toEqual([]);
    expect(res.change_note).toBe("변경 없음");
  });

  it("정상 응답 → rules·change_note 그대로", async () => {
    const { driver } = makeDriver(JSON.stringify({ rules: ["a", "b"], change_note: "규칙 2개" }));
    const res = await extractOwnerFeedbackRules(
      { component: "title", existingRules: [], candidates: ["제목 A"], feedback: "구체적으로" },
      CONFIG,
      { driver },
    );
    expect(res.rules).toEqual(["a", "b"]);
    expect(res.change_note).toBe("규칙 2개");
  });
});

describe("componentTypeFor / buildOwnerRulesDraftPatterns (순수 매핑)", () => {
  it("'title_owner'→'title_owner_rules', 'thumbnail_owner'→'thumbnail_owner_rules'", () => {
    expect(componentTypeFor("title_owner")).toBe("title_owner_rules");
    expect(componentTypeFor("thumbnail_owner")).toBe("thumbnail_owner_rules");
  });
  it("기존 매핑 무변경", () => {
    expect(componentTypeFor("thumbnail")).toBe("thumbnail_copy");
    expect(componentTypeFor("title")).toBe("title");
    expect(componentTypeFor("analogy")).toBe("analogy_style");
  });
  it("buildOwnerRulesDraftPatterns 는 rules 그대로 + sources 누적", () => {
    const prev = [{ feedback: "옛날", candidates: [] as string[] }];
    const out = buildOwnerRulesDraftPatterns(prev, ["r1", "r2"], { feedback: "새것", candidates: ["제목 A"], topic: "T" });
    expect(out.rules).toEqual(["r1", "r2"]);
    expect(out.sources).toHaveLength(2);
    expect(out.sources[1]).toEqual({ feedback: "새것", candidates: ["제목 A"], topic: "T" });
  });
});
