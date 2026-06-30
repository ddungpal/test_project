// 썸네일 아웃라이어 레퍼런스 추림/게이트 테스트 — 순수함수 결정성 + 옵트인 게이트(오프라인·$0).
//   ★ 네트워크 의존 금지: pickTopOutlierThumbnails는 순수, gatherOutlierThumbnails는 플래그 off에서 호출조차 안 함.
import { describe, it, expect, afterEach } from "vitest";
import { pickTopOutlierThumbnails, gatherOutlierThumbnails } from "../src/agents/hook_maker/externalRefs.js";
import type { ExternalItem } from "../src/agents/topic_scout/externalSignals.js";

function yt(
  id: string,
  title: string,
  viewCount: number | null,
  subscriberCount: number | null = null,
  thumbnailUrl: string | null = `https://i.ytimg.com/vi/${id}/hq.jpg`,
  publisher: string | null = "어떤채널",
): ExternalItem {
  return {
    id,
    source: "youtube",
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    publisher,
    published_at: null,
    snippet: "",
    viewCount,
    likeCount: null,
    commentCount: null,
    subscriberCount,
    thumbnailUrl,
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
    thumbnailUrl: "https://example.com/thumb.jpg", // web은 thumbnailUrl 있어도 제외
    sourceQuery: null,
  };
}

describe("pickTopOutlierThumbnails (순수함수)", () => {
  it("① 배수 desc로 상위 n개 — 소형채널 아웃라이어가 앞", () => {
    const items: ExternalItem[] = [
      yt("big", "대형채널 100만", 1_000_000, 1_000_000), // 배수 1
      yt("outlier", "소형 아웃라이어", 200_000, 5_000), // 배수 40
      yt("mid", "중형", 100_000, 20_000), // 배수 5
    ];
    const out = pickTopOutlierThumbnails(items, 2);
    expect(out.map((r) => r.title)).toEqual(["소형 아웃라이어", "중형"]);
    expect(out.map((r) => r.multiplier)).toEqual([40, 5]);
  });

  it("② web 소스·viewCount null·thumbnailUrl null 제외", () => {
    const items: ExternalItem[] = [
      web("w0", "웹 제목"), // web → 제외
      yt("y0", "조회수 없음", null), // viewCount null → 제외
      yt("y1", "썸네일 없음", 50, 1_000, null), // thumbnailUrl null → 제외
      yt("y2", "정상", 50, 2_000),
    ];
    const out = pickTopOutlierThumbnails(items, 5);
    expect(out.map((r) => r.title)).toEqual(["정상"]);
  });

  it("③ 김짠부 자기 채널 제외(채널명·핸들 휴리스틱)", () => {
    const items: ExternalItem[] = [
      yt("own1", "내 영상(채널명)", 500_000, 3_000, undefined, "김짠부"), // 제외
      yt("own2", "내 영상(핸들)", 600_000, 3_000, undefined, "ZZANBOO official"), // 제외(대소문자 무관)
      yt("ext", "외부 영상", 100_000, 5_000, undefined, "다른채널"),
    ];
    const out = pickTopOutlierThumbnails(items, 5);
    expect(out.map((r) => r.title)).toEqual(["외부 영상"]);
  });

  it("④ url 중복 제거(첫 등장·배수 높은 것 유지)", () => {
    const dupUrl = "https://www.youtube.com/watch?v=dup";
    const a = yt("a", "같은 url 고배수", 200_000, 5_000); // 배수 40
    const b = yt("b", "같은 url 저배수", 50_000, 5_000); // 배수 10
    a.url = dupUrl;
    b.url = dupUrl;
    const out = pickTopOutlierThumbnails([a, b], 5);
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe("같은 url 고배수");
  });

  it("⑤ 빈 입력 → 빈 배열", () => {
    expect(pickTopOutlierThumbnails([], 5)).toEqual([]);
  });

  it("⑥ 배수 null(구독 비공개)은 배수 있는 항목보다 뒤", () => {
    const items: ExternalItem[] = [
      yt("hidden", "구독 비공개·고조회", 5_000_000, null), // 배수 null
      yt("mult", "배수 있음·저조회", 50_000, 5_000), // 배수 10
    ];
    const out = pickTopOutlierThumbnails(items, 2);
    expect(out.map((r) => r.title)).toEqual(["배수 있음·저조회", "구독 비공개·고조회"]);
    expect(out.map((r) => r.multiplier)).toEqual([10, null]);
  });

  it("⑦ FLOOR_SUBS 미만 채널은 배수 null 취급 → 후순위", () => {
    const items: ExternalItem[] = [
      yt("tiny", "초소형 과장배수", 10_000, 10), // FLOOR_SUBS(1000) 미만 → 배수 null
      yt("normal", "정상 배수 5배", 10_000, 2_000), // 배수 5
    ];
    const out = pickTopOutlierThumbnails(items, 2);
    expect(out.map((r) => r.title)).toEqual(["정상 배수 5배", "초소형 과장배수"]);
    expect(out.map((r) => r.multiplier)).toEqual([5, null]);
  });

  it("⑧ 배수 둘 다 null이면 조회수 desc 보조 → 동률은 id asc(결정적)", () => {
    const items: ExternalItem[] = [
      yt("zzz", "지", 100, null),
      yt("aaa", "에이", 100, null),
      yt("hi", "고조회", 500, null),
    ];
    const out = pickTopOutlierThumbnails(items, 3);
    expect(out.map((r) => r.id)).toEqual(["hi", "aaa", "zzz"]);
  });

  it("⑨ OutlierThumbnailRef 형태를 그대로 매핑", () => {
    const out = pickTopOutlierThumbnails([yt("a", "제목", 100000, 5000)], 1);
    expect(out[0]).toEqual({
      id: "a",
      title: "제목",
      thumbnailUrl: "https://i.ytimg.com/vi/a/hq.jpg",
      url: "https://www.youtube.com/watch?v=a",
      publisher: "어떤채널",
      viewCount: 100000,
      subscriberCount: 5000,
      multiplier: 20, // 100000 / 5000
    });
  });

  it("⑩ n보다 적으면 있는 만큼만", () => {
    const items: ExternalItem[] = [yt("a", "하나", 10, 2_000), yt("b", "둘", 20, 2_000)];
    expect(pickTopOutlierThumbnails(items, 10)).toHaveLength(2);
  });
});

describe("gatherOutlierThumbnails (옵트인 게이트)", () => {
  const prev = process.env.TITLE_REFERENCES;
  afterEach(() => {
    if (prev === undefined) delete process.env.TITLE_REFERENCES;
    else process.env.TITLE_REFERENCES = prev;
  });

  it("플래그 미설정이면 네트워크 없이 즉시 [] 반환", async () => {
    delete process.env.TITLE_REFERENCES;
    await expect(gatherOutlierThumbnails("연봉 3천", 6)).resolves.toEqual([]);
  });

  it("TITLE_REFERENCES=off 도 [] 반환", async () => {
    process.env.TITLE_REFERENCES = "off";
    await expect(gatherOutlierThumbnails("연봉 3천", 6)).resolves.toEqual([]);
  });
});
