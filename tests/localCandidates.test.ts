// copy-local-gen: hook/thumbnail localCandidates 훅 통합 — 활성 스켈레톤이 있으면 LLM 없이
//   런 주제로 채운 동형 후보를 반환하고(payload 키·thumbnail_copy/ref_similarity/style_conformance 검증),
//   스타일/스켈레톤 없으면 null(→ callLLM 폴백)을 반환하는지 못박는다.
//   fake Supa: style_profiles 조회 체인만 흉내(component_type 필터로 분기). callLLM·전이는 거치지 않는다.
import { describe, it, expect } from "vitest";
import { hookStageSpec } from "../src/agents/hook_maker/stage.js";
import { thumbnailStageSpec } from "../src/agents/thumbnail_maker/stage.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { HookMakerInput } from "../src/agents/hook_maker/prepare.js";
import type { ThumbnailMakerInput } from "../src/agents/thumbnail_maker/prepare.js";
import type { ThumbnailStylePatterns } from "../src/agents/style_extractor/schema.js";

// 활성 'title' 스타일(스켈레톤 포함) row.
const TITLE_STYLE_ROW = {
  id: "uuid-title-9",
  version: 3,
  patterns: {
    copy: { hook_patterns: [], structure: { description: "", main_copy_notes: "", small_box_notes: "" }, emphasis_words: ["무조건"], length_notes: "" },
    visual: { face: "", layout_archetypes: [], color_usage: "", number_treatment: "", devices: [] },
    banned: ["사색적 톤"],
    skeletons: {
      // 풀세트(3개) — 로컬은 정확히 3개를 채울 때만 단락한다(< 3이면 LLM 폴백).
      title: [
        { template: "{number} 묶이면 무조건 보세요", slots: ["number"] },
        { template: "{topic} 모르면 손해", slots: ["topic"] },
        { template: "{topic} 지금 시작하세요", slots: ["topic"] },
      ],
    },
  } as ThumbnailStylePatterns,
};

// 스켈레톤 2개뿐(< 3) — 로컬이 풀세트를 못 만들어 null(LLM 폴백) 되는지 검증용.
const TITLE_STYLE_ROW_SHORT = {
  ...TITLE_STYLE_ROW,
  patterns: {
    ...TITLE_STYLE_ROW.patterns,
    skeletons: { title: (TITLE_STYLE_ROW.patterns as ThumbnailStylePatterns).skeletons!.title!.slice(0, 2) },
  } as ThumbnailStylePatterns,
};

// 활성 'thumbnail' 스타일(스켈레톤 포함) row.
const THUMB_STYLE_ROW = {
  id: "uuid-thumb-5",
  version: 2,
  patterns: {
    copy: { hook_patterns: [], structure: { description: "", main_copy_notes: "", small_box_notes: "" }, emphasis_words: ["무조건"], length_notes: "" },
    visual: { face: "", layout_archetypes: ["비포/애프터 2분할"], color_usage: "", number_treatment: "", devices: [] },
    banned: [],
    skeletons: {
      // 풀세트(3개) — 로컬은 정확히 3개를 채울 때만 단락한다(< 3이면 LLM 폴백).
      thumbnail: [
        { main: ["{number} 묶이면", "절대 깨지 마"], boxes: ["{topic}", "지금 확인"], slots: ["number", "topic"] },
        { main: ["{topic} 모르면", "손해입니다"], boxes: ["꼭 보기", "필수"], slots: ["topic"] },
        { main: ["{topic} 지금", "시작하세요"], boxes: ["꼭 보기", "추천"], slots: ["topic"] },
      ],
    },
  } as ThumbnailStylePatterns,
};

// 스켈레톤 2개뿐(< 3) — 로컬이 풀세트를 못 만들어 null(LLM 폴백) 되는지 검증용.
const THUMB_STYLE_ROW_SHORT = {
  ...THUMB_STYLE_ROW,
  patterns: {
    ...THUMB_STYLE_ROW.patterns,
    skeletons: { thumbnail: (THUMB_STYLE_ROW.patterns as ThumbnailStylePatterns).skeletons!.thumbnail!.slice(0, 2) },
  } as ThumbnailStylePatterns,
};

/** style_profiles 조회만 처리하는 체이너블 fake Supa. component_type 필터로 row 결정. */
function makeFakeSupa(rowByType: Record<string, unknown | null>): Supa {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    let componentType: string | null = null;
    const self = () => chain;
    chain.select = self;
    chain.eq = (col: string, val: string) => {
      if (table === "style_profiles" && col === "component_type") componentType = val;
      return chain;
    };
    chain.order = self;
    chain.limit = self;
    chain.maybeSingle = async () => {
      if (table === "style_profiles") return { data: (componentType && rowByType[componentType]) ?? null, error: null };
      return { data: null, error: null };
    };
    return chain;
  };
  return { from } as unknown as Supa;
}

describe("hook localCandidates — 제목 로컬 생성(동형)", () => {
  const input: HookMakerInput = {
    topic: "3년 예금",
    tone: null,
    reference_titles: [{ id: "ref:1", text: "예금 모르면 손해" }],
  };

  it("활성 title 스켈레톤이 있으면 LLM 없이 동형 후보를 반환한다", async () => {
    const supa = makeFakeSupa({ title: TITLE_STYLE_ROW });
    const spec = hookStageSpec("run-x");
    const cands = await spec.localCandidates!(supa, { input }, { offset: 0 });

    expect(cands).not.toBeNull();
    expect(cands!.length).toBe(3); // 풀세트(A/B/C)만 단락
    const c0 = cands![0]!;
    // toCandidates 재사용 → 동형 payload(idx·title·ref_similarity).
    expect(c0.idx).toBe(0);
    const payload = c0.payload as Record<string, unknown>;
    expect(payload.title).toBe("3년 묶이면 무조건 보세요"); // {number}=3년 치환
    expect(typeof payload.ref_similarity).toBe("number");
    // 로컬 후보는 스타일 id(style: 접두) + skeleton을 evidence로 단다.
    expect(c0.evidence_ids).toContain("style:uuid-title-9");
    expect(c0.evidence_ids).toContain("skeleton");
    // 빈 슬롯 누출 없음
    expect(payload.title as string).not.toMatch(/\{[a-z]+\}/);
  });

  it("활성 title 스타일이 없으면 null(→ LLM 폴백)", async () => {
    const supa = makeFakeSupa({ title: null });
    const spec = hookStageSpec("run-x");
    expect(await spec.localCandidates!(supa, { input }, { offset: 0 })).toBeNull();
  });

  it("로컬이 3개 미만(스켈레톤 2개)이면 null(→ LLM이 정확히 3개 생성)", async () => {
    const supa = makeFakeSupa({ title: TITLE_STYLE_ROW_SHORT });
    const spec = hookStageSpec("run-x");
    expect(await spec.localCandidates!(supa, { input }, { offset: 0 })).toBeNull();
  });
});

describe("thumbnail localCandidates — 썸네일 로컬 생성(동형)", () => {
  const input: ThumbnailMakerInput = {
    topic: "3년 예금",
    selected_title: "3년 예금 절대 깨지 마세요",
    tone: null,
    reference_thumbnail_copies: [{ id: "ref:1", text: "예금 모르면 손해" }],
  };

  it("활성 thumbnail 스켈레톤이 있으면 LLM 없이 동형 후보를 반환한다", async () => {
    const supa = makeFakeSupa({ thumbnail_copy: THUMB_STYLE_ROW });
    const spec = thumbnailStageSpec("run-y");
    const cands = await spec.localCandidates!(supa, { input }, { offset: 0 });

    expect(cands).not.toBeNull();
    expect(cands!.length).toBe(3); // 풀세트(A/B/C)만 단락
    const c0 = cands![0]!;
    const payload = c0.payload as Record<string, unknown>;
    expect(payload.thumbnail_main).toEqual(["3년 묶이면", "절대 깨지 마"]);
    expect(payload.thumbnail_boxes).toEqual(["3년 예금", "지금 확인"]);
    // 스켈레톤엔 레이아웃이 없으니 활성 스타일의 첫 layout_archetype 사용.
    expect(payload.thumbnail_layout).toBe("비포/애프터 2분할");
    // 파생 thumbnail_copy(단일 문자열) 존재 — summarizeChoicePayload·retrospective back-compat.
    expect(typeof payload.thumbnail_copy).toBe("string");
    expect(payload.thumbnail_copy as string).toContain("3년 묶이면");
    // ref_similarity·style_conformance 동형 부착.
    expect(typeof payload.ref_similarity).toBe("number");
    expect(payload.style_conformance).toBeDefined();
    expect(c0.evidence_ids).toContain("style:uuid-thumb-5");
    expect(c0.evidence_ids).toContain("skeleton");
  });

  it("layout_archetypes가 비면 결정적 기본 레이아웃을 쓴다", async () => {
    const row = { ...THUMB_STYLE_ROW, patterns: { ...THUMB_STYLE_ROW.patterns, visual: { ...THUMB_STYLE_ROW.patterns.visual, layout_archetypes: [] } } };
    const supa = makeFakeSupa({ thumbnail_copy: row });
    const spec = thumbnailStageSpec("run-y");
    const cands = await spec.localCandidates!(supa, { input }, { offset: 0 });
    const payload = cands![0]!.payload as Record<string, unknown>;
    expect(payload.thumbnail_layout).toBe("인물 우측·상단 메인카피 2줄·하단 박스 2개");
  });

  it("활성 thumbnail 스타일이 없으면 null(→ LLM 폴백)", async () => {
    const supa = makeFakeSupa({ thumbnail_copy: null });
    const spec = thumbnailStageSpec("run-y");
    expect(await spec.localCandidates!(supa, { input }, { offset: 0 })).toBeNull();
  });

  it("로컬이 3개 미만(스켈레톤 2개)이면 null(→ LLM이 정확히 3개 생성)", async () => {
    const supa = makeFakeSupa({ thumbnail_copy: THUMB_STYLE_ROW_SHORT });
    const spec = thumbnailStageSpec("run-y");
    expect(await spec.localCandidates!(supa, { input }, { offset: 0 })).toBeNull();
  });
});
