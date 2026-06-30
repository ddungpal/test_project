// 훅이 외부 레퍼런스 추림/게이트 테스트 — 순수함수 결정성 + 옵트인 게이트(오프라인·$0).
//   ★ 네트워크 의존 금지: pickTopExternalTitles는 순수, gatherTitleReferences는 플래그 off에서 호출조차 안 함.
import { describe, it, expect, afterEach } from "vitest";
import { pickTopExternalTitles, gatherTitleReferences } from "../src/agents/hook_maker/externalRefs.js";
import type { ExternalItem } from "../src/agents/topic_scout/externalSignals.js";

function yt(id: string, title: string, viewCount: number | null, subscriberCount: number | null = null): ExternalItem {
  return {
    id,
    source: "youtube",
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    publisher: "어떤채널",
    published_at: null,
    snippet: "",
    viewCount,
    likeCount: null,
    commentCount: null,
    subscriberCount,
    thumbnailUrl: null,
    sourceQuery: null,
  };
}
function web(id: string, title: string): ExternalItem {
  return {
    id,
    source: "web",
    title,
    url: `https://example.com/${id}`,
    publisher: "어떤매체",
    published_at: null,
    snippet: "",
    viewCount: 999999, // web은 viewCount가 있어도 제외되어야 함
    likeCount: null,
    commentCount: null,
    subscriberCount: null,
    thumbnailUrl: null,
    sourceQuery: null,
  };
}

describe("pickTopExternalTitles (순수함수)", () => {
  it("① 조회수 내림차순으로 상위 n개", () => {
    const items: ExternalItem[] = [
      yt("a", "제목 A", 100),
      yt("b", "제목 B", 500),
      yt("c", "제목 C", 300),
      yt("d", "제목 D", 200),
    ];
    const out = pickTopExternalTitles(items, 2);
    expect(out.map((r) => r.title)).toEqual(["제목 B", "제목 C"]);
    expect(out.map((r) => r.viewCount)).toEqual([500, 300]);
  });

  it("② web 소스·viewCount null 제외(youtube & viewCount!=null만)", () => {
    const items: ExternalItem[] = [
      web("w0", "웹 제목"), // 제외
      yt("y0", "조회수 없음", null), // 제외
      yt("y1", "정상", 50),
    ];
    const out = pickTopExternalTitles(items, 5);
    expect(out.map((r) => r.title)).toEqual(["정상"]);
  });

  it("③ 제목 중복 제거(첫 등장·고조회 유지)", () => {
    const items: ExternalItem[] = [
      yt("a", "같은 제목", 400),
      yt("b", "같은 제목", 100),
      yt("c", "다른 제목", 200),
    ];
    const out = pickTopExternalTitles(items, 5);
    expect(out.map((r) => r.title)).toEqual(["같은 제목", "다른 제목"]);
    expect(out).toHaveLength(2);
  });

  it("④ 빈 입력 → 빈 배열", () => {
    expect(pickTopExternalTitles([], 5)).toEqual([]);
  });

  it("⑤ n보다 적으면 있는 만큼만", () => {
    const items: ExternalItem[] = [yt("a", "하나", 10), yt("b", "둘", 20)];
    const out = pickTopExternalTitles(items, 10);
    expect(out).toHaveLength(2);
  });

  it("동률 viewCount는 id로 안정 정렬(결정적)", () => {
    const items: ExternalItem[] = [
      yt("zzz", "지", 100),
      yt("aaa", "에이", 100),
      yt("mmm", "엠", 100),
    ];
    const out = pickTopExternalTitles(items, 3);
    expect(out.map((r) => r.id)).toEqual(["aaa", "mmm", "zzz"]);
  });

  it("ExternalTitleRef 형태(id·title·viewCount·url·publisher·multiplier·subscriberCount)를 그대로 매핑", () => {
    const out = pickTopExternalTitles([yt("a", "제목", 100000, 5000)], 1);
    expect(out[0]).toEqual({
      id: "a",
      title: "제목",
      viewCount: 100000,
      url: "https://www.youtube.com/watch?v=a",
      publisher: "어떤채널",
      multiplier: 20, // 100000 / 5000
      subscriberCount: 5000,
    });
  });

  it("⑥ 배수 desc 우선 — 조회수 낮아도 구독 대비 배수 큰 영상이 앞", () => {
    const items: ExternalItem[] = [
      // 조회 100만·구독 100만 → 배수 1
      yt("big", "대형채널 100만 조회", 1_000_000, 1_000_000),
      // 조회 20만·구독 5천 → 배수 40 (아웃라이어)
      yt("outlier", "소형채널 아웃라이어", 200_000, 5_000),
    ];
    const out = pickTopExternalTitles(items, 2);
    expect(out.map((r) => r.title)).toEqual(["소형채널 아웃라이어", "대형채널 100만 조회"]);
    expect(out.map((r) => r.multiplier)).toEqual([40, 1]);
  });

  it("⑦ 배수 null(구독 비공개) 항목은 배수 있는 항목보다 뒤로", () => {
    const items: ExternalItem[] = [
      yt("hidden", "구독 비공개·고조회", 5_000_000, null), // 배수 null
      yt("mult", "배수 있음·저조회", 50_000, 5_000), // 배수 10
    ];
    const out = pickTopExternalTitles(items, 2);
    expect(out.map((r) => r.title)).toEqual(["배수 있음·저조회", "구독 비공개·고조회"]);
    expect(out.map((r) => r.multiplier)).toEqual([10, null]);
  });

  it("⑧ FLOOR_SUBS 미만 채널은 배수 null 취급 → 후순위", () => {
    const items: ExternalItem[] = [
      // 구독 10명·조회 1만 = 1000배지만 FLOOR_SUBS(1000) 미만 → 배수 null
      yt("tiny", "초소형 과장배수", 10_000, 10),
      // 구독 2천·조회 1만 = 5배 (정상 랭킹)
      yt("normal", "정상 배수 5배", 10_000, 2_000),
    ];
    const out = pickTopExternalTitles(items, 2);
    expect(out.map((r) => r.title)).toEqual(["정상 배수 5배", "초소형 과장배수"]);
    expect(out.map((r) => r.multiplier)).toEqual([5, null]);
  });

  it("⑨ 배수 둘 다 null이면 조회수 desc 보조 정렬(기존 동작 보존)", () => {
    const items: ExternalItem[] = [
      yt("a", "저조회", 100, null),
      yt("b", "고조회", 500, null),
    ];
    const out = pickTopExternalTitles(items, 2);
    expect(out.map((r) => r.title)).toEqual(["고조회", "저조회"]);
    expect(out.map((r) => r.multiplier)).toEqual([null, null]);
  });
});

describe("gatherTitleReferences (옵트인 게이트)", () => {
  const prev = process.env.TITLE_REFERENCES;
  afterEach(() => {
    if (prev === undefined) delete process.env.TITLE_REFERENCES;
    else process.env.TITLE_REFERENCES = prev;
  });

  it("플래그 미설정이면 네트워크 없이 즉시 [] 반환", async () => {
    delete process.env.TITLE_REFERENCES;
    await expect(gatherTitleReferences("연봉 3천")).resolves.toEqual([]);
  });

  it("TITLE_REFERENCES=off 도 [] 반환", async () => {
    process.env.TITLE_REFERENCES = "off";
    await expect(gatherTitleReferences("연봉 3천")).resolves.toEqual([]);
  });
});
