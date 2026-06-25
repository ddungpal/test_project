// 훅이 외부 레퍼런스 추림/게이트 테스트 — 순수함수 결정성 + 옵트인 게이트(오프라인·$0).
//   ★ 네트워크 의존 금지: pickTopExternalTitles는 순수, gatherTitleReferences는 플래그 off에서 호출조차 안 함.
import { describe, it, expect, afterEach } from "vitest";
import { pickTopExternalTitles, gatherTitleReferences } from "../src/agents/hook_maker/externalRefs.js";
import type { ExternalItem } from "../src/agents/topic_scout/externalSignals.js";

function yt(id: string, title: string, viewCount: number | null): ExternalItem {
  return {
    id,
    source: "youtube",
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    publisher: "어떤채널",
    published_at: null,
    snippet: "",
    viewCount,
    subscriberCount: null,
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
    subscriberCount: null,
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

  it("ExternalTitleRef 형태(id·title·viewCount·url·publisher)를 그대로 매핑", () => {
    const out = pickTopExternalTitles([yt("a", "제목", 77)], 1);
    expect(out[0]).toEqual({
      id: "a",
      title: "제목",
      viewCount: 77,
      url: "https://www.youtube.com/watch?v=a",
      publisher: "어떤채널",
    });
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
