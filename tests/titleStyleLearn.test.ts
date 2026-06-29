// 제목 스타일 학습 코어(titleStyleLearn) 단위 테스트 — DB·LLM 실접근 없음(과금 0).
//   핵심 계약:
//   ① saveTitleStyleDraft 가 version 을 component_type='title' 스코프 max+1 로 잡고 status='draft' 로 INSERT 하는지.
//      supa 를 최소 stub 으로 흉내내(select·eq·order·limit·maybeSingle → insert·select·single) 순수 검증.
//      특히 eq('component_type','title') 가 실제 호출되는지(타입 필터)와 insert payload(status/version) 를 assert.
//   ② extractTitleStylePatterns 의 경계: 유효 제목 0개(빈 배열·공백만) → callLLM 실호출 없이 null 반환.
import { describe, it, expect } from "vitest";
import { saveTitleStyleDraft, extractTitleStylePatterns } from "../src/performance/titleStyleLearn.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { ChannelTitle } from "../src/ingest/channelTitles.js";
import type { LlmConfig } from "../src/llm/config.js";

/**
 * saveTitleStyleDraft 가 부르는 supa 체인만 흉내내는 최소 stub.
 *   select(...).eq(...).order(...).limit(...).maybeSingle()  → version 조회(maxVersion 주입)
 *   insert(payload).select(...).single()                     → 저장(payload 캡처)
 * 호출 인자(특히 eq('component_type','title'))와 insert payload 를 spy 로 보존한다.
 */
function makeSupaStub(maxVersion: number | null) {
  const calls = {
    fromArgs: [] as string[],
    eqArgs: [] as Array<[string, unknown]>,
    insertPayload: null as Record<string, unknown> | null,
  };

  const selectApi = {
    select: () => selectApi,
    eq: (col: string, val: unknown) => {
      calls.eqArgs.push([col, val]);
      return selectApi;
    },
    order: () => selectApi,
    limit: () => selectApi,
    maybeSingle: async () => ({
      data: maxVersion === null ? null : { version: maxVersion },
      error: null,
    }),
  };

  const insertApi = {
    select: () => insertApi,
    single: async () => ({
      data: { id: "sp-1", version: calls.insertPayload?.version, status: "draft" },
      error: null,
    }),
  };

  const supa = {
    from: (table: string) => {
      calls.fromArgs.push(table);
      return {
        select: () => selectApi,
        insert: (payload: Record<string, unknown>) => {
          calls.insertPayload = payload;
          return insertApi;
        },
      };
    },
  } as unknown as Supa;

  return { supa, calls };
}

const PATTERNS = { copy: { hook_patterns: ["연봉 N 이하 꼭 보세요"] }, visual: {}, banned: [] };

describe("saveTitleStyleDraft (version=title 스코프 max+1 · draft INSERT 계약)", () => {
  it("기존 title 프로파일이 없으면 version=1 로 draft INSERT", async () => {
    const { supa, calls } = makeSupaStub(null);
    const res = await saveTitleStyleDraft(supa, PATTERNS);

    expect(res.version).toBe(1);
    expect(calls.insertPayload?.version).toBe(1);
    expect(calls.insertPayload?.status).toBe("draft"); // 활성화 절대 안 함(사람 게이트).
    expect(calls.insertPayload?.component_type).toBe("title");
    expect(calls.fromArgs).toContain("style_profiles");
  });

  it("기존 max version=4 면 version=5(max+1) 로 INSERT", async () => {
    const { supa, calls } = makeSupaStub(4);
    const res = await saveTitleStyleDraft(supa, PATTERNS);

    expect(res.version).toBe(5);
    expect(calls.insertPayload?.version).toBe(5);
    expect(calls.insertPayload?.status).toBe("draft");
  });

  it("version 조회를 component_type='title' 로 필터한다(다른 타입과 섞지 않음)", async () => {
    const { supa, calls } = makeSupaStub(2);
    await saveTitleStyleDraft(supa, PATTERNS);

    // eq('component_type','title') 가 실제로 호출됐는지(타입 스코프 필터 핵심 계약).
    expect(calls.eqArgs).toContainEqual(["component_type", "title"]);
  });

  it("INSERT payload 에 patterns 가 그대로 실린다", async () => {
    const { supa, calls } = makeSupaStub(0);
    await saveTitleStyleDraft(supa, PATTERNS);
    expect(calls.insertPayload?.patterns).toBe(PATTERNS);
  });
});

describe("extractTitleStylePatterns (유효 제목 0개 경계 — callLLM 실호출 없음)", () => {
  // config 는 null 분기에서 LLM 까지 도달하지 않으므로 형태만 갖춘 더미면 충분(callLLM 미호출).
  const config = {} as unknown as LlmConfig;

  it("빈 배열 입력 → null 반환(학습할 신호 없음)", async () => {
    const res = await extractTitleStylePatterns([], config);
    expect(res).toBeNull();
  });

  it("공백·비-문자열 title 뿐이면 → null 반환", async () => {
    const titles: ChannelTitle[] = [
      { video_id: "a", title: "   ", published_at: null },
      { video_id: "b", title: "", published_at: null },
    ];
    expect(await extractTitleStylePatterns(titles, config)).toBeNull();
  });
});
