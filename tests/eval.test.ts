// 골든셋 회귀 eval(품질 엄밀화) — 녹화된 fixture 출력이 '좋은 산출물' invariant를 지키는지.
//   스키마(형식)를 넘어 품질을 본다: 커버리지·비자명성·증거 보유·발굴 융합·시청자대면 MOCK 누출.
//   프롬프트를 바꿔 재녹화해도 invariant가 깨지면 품질 회귀 → CI에서 잡는다. $0·결정적.
//   ★ 형태 변이에 견고: 레거시/이형 fixture는 건너뛰되, 골든셋이 충분히 남아있는지(개수)는 강제.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const FIX = "fixtures/parity";

function outputs(role: string): any[] {
  const dir = join(FIX, role);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(JSON.parse(readFileSync(join(dir, f), "utf8")).rawJson);
      } catch {
        return null;
      }
    })
    .filter((o) => o !== null);
}

const nonTrivial = (s: unknown, min = 8) => typeof s === "string" && s.trim().length >= min;
/** 기대하는 배열 필드를 가진 출력만(이형/레거시 fixture 제외). */
const withArray = (fx: any[], key: string) => fx.filter((o) => Array.isArray(o?.[key]));

describe("eval: 촉이(topic_scout) 발굴 품질", () => {
  const fx = withArray(outputs("topic_scout"), "candidates");
  it("골든셋 충분(정형 fixture ≥8)", () => expect(fx.length).toBeGreaterThanOrEqual(8));

  it("후보 ≥3 · title·reason 비자명 · evidence_ids 보유", () => {
    for (const o of fx) {
      expect(o.candidates.length).toBeGreaterThanOrEqual(3);
      for (const c of o.candidates) {
        expect(nonTrivial(c.title, 10)).toBe(true); // 낚시 한 단어 금지 — 구체적 제목
        expect(nonTrivial(c.reason)).toBe(true);
        expect(Array.isArray(c.evidence_ids) && c.evidence_ids.length >= 1).toBe(true);
        for (const id of c.evidence_ids) expect(nonTrivial(id, 3)).toBe(true); // 빈/공백 id 금지
      }
    }
  });

  it("발굴 융합 — 외부 신호(web:/yt:)를 evidence로 쓰는 후보가 코퍼스 전반에 존재", () => {
    const external = fx.flatMap((o) => o.candidates).filter((c: any) => (c.evidence_ids ?? []).some((id: string) => id.startsWith("web:") || id.startsWith("yt:")));
    expect(external.length).toBeGreaterThan(0); // 댓글-only가 아니라 외부 트렌드 융합 작동
  });
});

describe("eval: 훅이(hook_maker) 제목·썸네일 품질", () => {
  // 신규 구조(thumbnail_main 배열)만 통과 — 레거시(thumbnail_copy 문자열) fixture는 자동 제외.
  const fx = withArray(outputs("hook_maker"), "candidates").filter((o) =>
    o.candidates.every((c: any) => Array.isArray(c?.thumbnail_main)),
  );
  it("골든셋 존재", () => expect(fx.length).toBeGreaterThan(0));
  it("후보 ≥3 · 제목·메인문구2·박스2·레이아웃 비자명 · evidence 보유", () => {
    for (const o of fx) {
      expect(o.candidates.length).toBeGreaterThanOrEqual(3);
      for (const c of o.candidates) {
        expect(nonTrivial(c.title, 6)).toBe(true);
        expect(Array.isArray(c.thumbnail_main) && c.thumbnail_main.length === 2).toBe(true);
        for (const m of c.thumbnail_main) expect(nonTrivial(m, 2)).toBe(true);
        expect(Array.isArray(c.thumbnail_boxes) && c.thumbnail_boxes.length === 2).toBe(true);
        for (const b of c.thumbnail_boxes) expect(nonTrivial(b, 2)).toBe(true);
        expect(nonTrivial(c.thumbnail_layout)).toBe(true);
        expect((c.evidence_ids ?? []).length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("eval: 구다리(structurer) 구성 품질", () => {
  const fx = withArray(outputs("structurer"), "candidates");
  it("골든셋 존재", () => expect(fx.length).toBeGreaterThan(0));
  it("후보 ≥2 · outline ≥3 섹션 · reason 비자명 · evidence 보유", () => {
    for (const o of fx) {
      expect(o.candidates.length).toBeGreaterThanOrEqual(2);
      for (const c of o.candidates) {
        expect(Array.isArray(c.outline) && c.outline.length >= 3).toBe(true);
        expect(nonTrivial(c.reason)).toBe(true);
        expect((c.evidence_ids ?? []).length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("eval: 짠펜(scribe) 대본 품질", () => {
  const fx = withArray(outputs("scribe"), "segments");
  it("골든셋 존재", () => expect(fx.length).toBeGreaterThan(0));
  it("세그먼트 ≥3 · 각 본문 비자명(≥20자) · ord 보유", () => {
    for (const o of fx) {
      expect(o.segments.length).toBeGreaterThanOrEqual(3);
      for (const s of o.segments) {
        expect(nonTrivial(s.text, 20)).toBe(true);
        expect(typeof s.ord).toBe("number");
      }
    }
  });
});

describe("eval: 반론(critic) — 빈 배열 가능(API parity)", () => {
  const fx = outputs("critic");
  it("골든셋 존재", () => expect(fx.length).toBeGreaterThan(0));
  it("missing·counter_evidence는 (있으면) 배열", () => {
    for (const o of fx) {
      if (o.missing !== undefined) expect(Array.isArray(o.missing)).toBe(true);
      if (o.counter_evidence !== undefined) expect(Array.isArray(o.counter_evidence)).toBe(true);
    }
  });
});

describe("eval: 시청자 대면 출력에 [MOCK] 마커 누출 없음", () => {
  // ★ fact_verifier는 'MOCK이라 사실 아님'을 reasoning에 정당히 인용 → 제외. 시청자가 보는 것만 검사.
  it("후보 제목·대본 본문에 [MOCK] 없음", () => {
    for (const o of withArray(outputs("topic_scout"), "candidates")) for (const c of o.candidates) expect(c.title ?? "").not.toContain("[MOCK]");
    for (const o of withArray(outputs("hook_maker"), "candidates")) for (const c of o.candidates) expect(c.title ?? "").not.toContain("[MOCK]");
    for (const o of withArray(outputs("scribe"), "segments")) for (const s of o.segments) expect(s.text ?? "").not.toContain("[MOCK]");
  });
});
