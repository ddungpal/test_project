// 비유 재학습 sweep 코어(analogyRelearnSweep) 단위 — transcribe·extract 를 impl 함수 스텁 + 호출 카운터로 격리.
//   ★ vi.fn 지양 규칙: rejected promise 삼킴 감지 오탐 방지 → impl 함수 + 카운터로 스텁한다.
//   ★ 서버액션(requestAnalogyRelearn)은 requireOwner+createAdminClient 로 이 코어를 감싸는 얇은 래퍼라 직접 테스트 안 함.
//     대신 코어에 인메모리 fake Supa + 스텁 transcribe/extract 를 주입해 draft INSERT 계약을 검증한다.
//   검증: ① 트랜스크립트 2개 → extract 1회 호출 → style_profiles insert 가 component_type='analogy_style'·status='draft'.
//          ② 빈 폴더(트랜스크립트 0) → extract·insert 미호출.
//          ③ componentTypeFor('analogy') === 'analogy_style'.
import { describe, it, expect, beforeEach } from "vitest";
import type { LlmConfig } from "../src/llm/config.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { ReelTranscript } from "../src/lib/learning/transcribeReels.js";
import { analogyRelearnSweep } from "../src/performance/analogyRelearn.js";
import { componentTypeFor } from "../src/app/actions/copyLearnMap.js";

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

/** analogyRelearnSweep 이 쓰는 supa 경로(version select + draft insert)만 흉내내는 인메모리 fake. */
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

/** impl 함수 스텁 + 호출 카운터(vi.fn 지양 규칙). */
function makeExtractStub(result: unknown | null) {
  let calls = 0;
  const seen: ReelTranscript[][] = [];
  const extract = async (transcripts: ReelTranscript[]) => {
    calls += 1;
    seen.push(transcripts);
    return result;
  };
  return { extract, calls: () => calls, seen };
}

function makeTranscribeStub(transcripts: ReelTranscript[]) {
  let calls = 0;
  const transcribe = async (_dir: string) => {
    calls += 1;
    return transcripts;
  };
  return { transcribe, calls: () => calls };
}

describe("analogyRelearnSweep (코어 — 스텁 deps 주입)", () => {
  it("트랜스크립트 2개 → extract 1회 → style_profiles insert(component_type='analogy_style'·status='draft')", async () => {
    const { supa, inserts } = makeFakeSupa({ style_profiles: [] });
    const transcripts: ReelTranscript[] = [
      { name: "reel-a", transcript: "비유 예시 A" },
      { name: "reel-b", transcript: "비유 예시 B" },
    ];
    const t = makeTranscribeStub(transcripts);
    const e = makeExtractStub({ techniques: ["추상→구체"], target_domains: [], do: [], banned: [], distortion_guard: "왜곡 금지" });

    const res = await analogyRelearnSweep(supa, { config: CONFIG, transcribe: t.transcribe, extract: e.extract });

    expect(res.transcribed).toBe(2);
    expect(res.created).toBe(true);
    expect(res.version).toBe(1);
    expect(e.calls()).toBe(1); // extract 정확히 1회
    expect(e.seen[0]).toHaveLength(2); // 트랜스크립트 2개 그대로 전달
    // draft INSERT 계약
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ component_type: "analogy_style", status: "draft", version: 1 });
  });

  it("빈 폴더(트랜스크립트 0) → extract·insert 미호출, created:false", async () => {
    const { supa, inserts } = makeFakeSupa({ style_profiles: [] });
    const t = makeTranscribeStub([]);
    const e = makeExtractStub({ distortion_guard: "x" });

    const res = await analogyRelearnSweep(supa, { config: CONFIG, transcribe: t.transcribe, extract: e.extract });

    expect(res).toEqual({ transcribed: 0, created: false, version: null, id: null });
    expect(e.calls()).toBe(0); // LLM 미호출
    expect(inserts).toHaveLength(0); // INSERT 미호출
  });

  it("extract 가 null(학습 신호 없음) → insert 미호출, created:false", async () => {
    const { supa, inserts } = makeFakeSupa({ style_profiles: [] });
    const t = makeTranscribeStub([{ name: "r", transcript: "x" }]);
    const e = makeExtractStub(null);

    const res = await analogyRelearnSweep(supa, { config: CONFIG, transcribe: t.transcribe, extract: e.extract });

    expect(res.created).toBe(false);
    expect(res.transcribed).toBe(1);
    expect(e.calls()).toBe(1);
    expect(inserts).toHaveLength(0);
  });

  it("version 은 analogy_style 스코프 max+1(다른 타입과 안 섞임)", async () => {
    // 기존 analogy_style v2 + 무관한 title v9 존재 → 다음 version=3.
    const { supa, inserts } = makeFakeSupa({
      style_profiles: [
        { id: "old", component_type: "analogy_style", version: 2, patterns: {}, status: "retired" },
        { id: "t", component_type: "title", version: 9, patterns: {}, status: "active" },
      ],
    });
    const t = makeTranscribeStub([{ name: "r", transcript: "x" }]);
    const e = makeExtractStub({ distortion_guard: "왜곡 금지" });

    const res = await analogyRelearnSweep(supa, { config: CONFIG, transcribe: t.transcribe, extract: e.extract });

    expect(res.version).toBe(3);
    expect(inserts[0]).toMatchObject({ component_type: "analogy_style", version: 3 });
  });
});

describe("componentTypeFor('analogy')", () => {
  it("'analogy' → 'analogy_style'", () => {
    expect(componentTypeFor("analogy")).toBe("analogy_style");
  });
  it("기존 매핑 무변경", () => {
    expect(componentTypeFor("thumbnail")).toBe("thumbnail_copy");
    expect(componentTypeFor("title")).toBe("title");
  });
});
