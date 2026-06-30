// scriptView 인라인 칩(autoflow §D) — getScriptView가 fact를 칩 상세로 매핑하는지.
//   보류(escalated && human_approved=null) fact → pending=true,
//   비보류(verified·자동통과) fact → pending=false. isFactPending 재사용을 round-trip으로 확인.
//   server-only/admin.js는 모킹(getScriptView가 createAdminClient로 admin supa를 만들기 때문).
import { describe, it, expect, vi } from "vitest";

// server-only는 node(vitest)에서 import 즉시 throw → 빈 모듈로 대체.
vi.mock("server-only", () => ({}));

// createAdminClient가 아래 fake supa를 반환하게 한다(DB 없음).
const fakeFactsState = {
  segs: [] as Record<string, unknown>[],
  sfLinks: [] as Record<string, unknown>[],
  facts: [] as Record<string, unknown>[],
};
vi.mock("../src/lib/supabase/admin.js", () => ({
  createAdminClient: () => makeViewSupa(),
}));

function makeViewSupa() {
  return {
    from(table: string) {
      if (table === "script_segments") {
        return {
          select() {
            return { eq() { return { order: async () => ({ data: fakeFactsState.segs, error: null }) }; } };
          },
        };
      }
      if (table === "script_segment_facts") {
        return { select() { return { in: async () => ({ data: fakeFactsState.sfLinks, error: null }) }; } };
      }
      if (table === "script_segment_explanation_assets") {
        return { select() { return { in: async () => ({ data: [], error: null }) }; } };
      }
      if (table === "research_facts") {
        return { select() { return { in: async () => ({ data: fakeFactsState.facts, error: null }) }; } };
      }
      if (table === "explanation_assets") {
        return { select() { return { in: async () => ({ data: [], error: null }) }; } };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

const { getScriptView } = await import("../src/lib/dashboard/scriptView.js");

describe("getScriptView — 인라인 칩 fact 매핑(pending·출처 필드)", () => {
  it("보류 fact는 pending=true, 비보류 verified는 pending=false + 출처 필드 매핑", async () => {
    fakeFactsState.segs = [{ id: "s1", ord: 0, text: "본문", kind: "prose", payload: null }];
    fakeFactsState.sfLinks = [
      { segment_id: "s1", fact_id: "f1" },
      { segment_id: "s1", fact_id: "f2" },
    ];
    fakeFactsState.facts = [
      {
        id: "f1",
        claim: "보류 사실",
        human_approved: null,
        escalated_to_human: true, // → 보류
        verification_status: "could_not_verify",
        source_tier: null,
        primary_source_url: null,
        is_financial: true,
      },
      {
        id: "f2",
        claim: "검증된 사실",
        human_approved: null,
        escalated_to_human: false, // → 자동통과(비보류)
        verification_status: "verified",
        source_tier: "official",
        primary_source_url: "https://nts.go.kr/x",
        is_financial: false,
      },
    ];

    const segs = await getScriptView("run1");
    expect(segs).toHaveLength(1);
    const facts = segs[0]!.facts;
    const f1 = facts.find((f) => f.id === "f1")!;
    const f2 = facts.find((f) => f.id === "f2")!;

    expect(f1.pending).toBe(true); // 보류 → '확인 필요'
    expect(f1.isFinancial).toBe(true);
    expect(f1.verificationStatus).toBe("could_not_verify");

    expect(f2.pending).toBe(false); // 자동통과 → 칩에 보류 표식 없음
    expect(f2.sourceTier).toBe("official");
    expect(f2.primarySourceUrl).toBe("https://nts.go.kr/x");
    expect(f2.verificationStatus).toBe("verified");
  });

  it("사람 승인된(human_approved=true) escalated fact는 pending=false(확인 끝남)", async () => {
    fakeFactsState.segs = [{ id: "s1", ord: 0, text: "본문", kind: "prose", payload: null }];
    fakeFactsState.sfLinks = [{ segment_id: "s1", fact_id: "f1" }];
    fakeFactsState.facts = [
      {
        id: "f1",
        claim: "승인된 사실",
        human_approved: true,
        escalated_to_human: true,
        verification_status: "verified",
        source_tier: "official",
        primary_source_url: null,
        is_financial: true,
      },
    ];
    const segs = await getScriptView("run1");
    expect(segs[0]!.facts[0]!.pending).toBe(false);
  });
});
