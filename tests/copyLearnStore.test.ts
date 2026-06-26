// 카피 학습 저장(copy-learning-admin step0) 단위 테스트 — 순수 매핑 함수만(DB·네트워크 무관).
//   라이브 저장은 서버액션 saveCopyAbResults(requireOwner·service-role) 경유.
import { describe, it, expect } from "vitest";
import { mapCopyAbToRows, mapCtr24hToMetricRow, componentTypeFor, buildLearningVideoStub, buildCorrectionRow, type CopyAbInput } from "../src/app/actions/copyLearnMap.js";
import { judgeComponent, type AbScoreInput } from "../src/performance/abVerdict.js";

const TH = { decisiveMargin: 0.1, marginalMargin: 0.03 };
const CID = "content-uuid-1";

// 썸네일 3변형(A 38.8 > C 34.0 > B 27.1) + 제목 A/B 3변형(A 50 > B 30 > C 20).
const AB_INPUT: CopyAbInput = {
  contentId: CID,
  ctr24h: 6.4,
  views24h: 120000,
  thumbnail: [
    { variant: "A", copyMain: ["절대 깨지 마세요"], copyBoxes: ["3년"], watchShare: 38.8 },
    { variant: "B", copyMain: ["이것만 알면 ISA"], copyBoxes: [], watchShare: 27.1 },
    { variant: "C", copyMain: ["ETF 팔기 전"], copyBoxes: ["5억원"], watchShare: 34.0 },
  ],
  title: {
    hasAbTest: true,
    variants: [
      { variant: "A", text: "ISA 3년 만기 전략", watchShare: 50 },
      { variant: "B", text: "ISA 이것만 알면", watchShare: 30 },
      { variant: "C", text: "ISA 깨면 손해", watchShare: 20 },
    ],
  },
};

// 제목 단일 모드(A/B 없음) — 썸네일은 동일.
const SINGLE_TITLE_INPUT: CopyAbInput = {
  contentId: CID,
  ctr24h: 5.0,
  views24h: 80000,
  thumbnail: AB_INPUT.thumbnail,
  title: { hasAbTest: false, variants: [{ variant: "A", text: "최종 제목 하나", watchShare: null }] },
};

describe("mapCopyAbToRows — 썸네일 매핑", () => {
  it("썸네일 3변형 모두 component_type='thumbnail'·content_id 채움", () => {
    const { abRows } = mapCopyAbToRows(AB_INPUT, CID, TH);
    const thumbs = abRows.filter((r) => r.component_type === "thumbnail");
    expect(thumbs).toHaveLength(3);
    for (const r of thumbs) expect(r.content_id).toBe(CID);
  });

  it("payload는 {copy_main, copy_boxes}, ctr_pct=watchShare", () => {
    const { abRows } = mapCopyAbToRows(AB_INPUT, CID, TH);
    const a = abRows.find((r) => r.component_type === "thumbnail" && r.variant === "A");
    const p = a?.payload as Record<string, unknown>;
    expect(p.copy_main).toEqual(["절대 깨지 마세요"]);
    expect(p.copy_boxes).toEqual(["3년"]);
    expect(a?.ctr_pct).toBe(38.8);
    expect(a?.impressions).toBeNull();
    expect(a?.weight).toBeNull();
  });

  it("빈 문자열·공백은 payload에서 제거(누출 차단)", () => {
    const dirty: CopyAbInput = {
      ...AB_INPUT,
      thumbnail: [{ variant: "A", copyMain: ["  유효  ", "", "   "], copyBoxes: [""], watchShare: 10 }],
    };
    const { abRows } = mapCopyAbToRows(dirty, CID, TH);
    const p = abRows.find((r) => r.component_type === "thumbnail")?.payload as Record<string, unknown>;
    expect(p.copy_main).toEqual(["유효"]);
    expect(p.copy_boxes).toEqual([]);
  });

  it("rank·is_winner는 judgeComponent('thumbnail') 재계산과 일치(입력 맹신 안 함)", () => {
    const { abRows, thumbnailVerdict } = mapCopyAbToRows(AB_INPUT, CID, TH);
    const scoreInputs: AbScoreInput[] = AB_INPUT.thumbnail.map((t) => ({ variant: t.variant, ctr_pct: t.watchShare, impressions: null }));
    const verdict = judgeComponent("thumbnail", scoreInputs, TH);
    for (const rv of verdict.ranked) {
      const row = abRows.find((r) => r.component_type === "thumbnail" && r.variant === rv.variant);
      expect(row?.rank).toBe(rv.rank);
      expect(row?.is_winner).toBe(rv.is_winner);
    }
    // 38.8 > 34.0 > 27.1 → A(rank1·winner) > C(rank2) > B(rank3).
    expect(abRows.find((r) => r.component_type === "thumbnail" && r.variant === "A")?.rank).toBe(1);
    expect(abRows.find((r) => r.component_type === "thumbnail" && r.variant === "A")?.is_winner).toBe(true);
    expect(abRows.find((r) => r.component_type === "thumbnail" && r.variant === "C")?.rank).toBe(2);
    expect(abRows.find((r) => r.component_type === "thumbnail" && r.variant === "B")?.is_winner).toBe(false);
    expect(thumbnailVerdict?.winner).toBe("A");
  });
});

describe("mapCopyAbToRows — 제목 A/B 모드", () => {
  it("제목 3변형, payload={title}, judgeComponent('title') 재계산", () => {
    const { abRows } = mapCopyAbToRows(AB_INPUT, CID, TH);
    const titles = abRows.filter((r) => r.component_type === "title");
    expect(titles).toHaveLength(3);
    const a = titles.find((r) => r.variant === "A");
    expect((a?.payload as Record<string, unknown>).title).toBe("ISA 3년 만기 전략");
    // 50 > 30 > 20 → A 승자.
    expect(a?.rank).toBe(1);
    expect(a?.is_winner).toBe(true);
    expect(titles.find((r) => r.variant === "C")?.rank).toBe(3);
  });
});

describe("mapCopyAbToRows — 제목 단일 모드", () => {
  it("variant='A' 1행, ctr_pct=null, is_winner=true, A/B 판정 안 함", () => {
    const { abRows } = mapCopyAbToRows(SINGLE_TITLE_INPUT, CID, TH);
    const titles = abRows.filter((r) => r.component_type === "title");
    expect(titles).toHaveLength(1);
    const a = titles[0];
    expect(a?.variant).toBe("A");
    expect((a?.payload as Record<string, unknown>).title).toBe("최종 제목 하나");
    expect(a?.ctr_pct).toBeNull();
    expect(a?.is_winner).toBe(true);
    expect(a?.rank).toBe(1);
  });
});

describe("mapCtr24hToMetricRow — performance d1 overall", () => {
  it("1행, metric_window='d1', ab_variant='overall', ctr=ctr24h, views=views24h", () => {
    const row = mapCtr24hToMetricRow(AB_INPUT, CID, "2026-06-25T00:00:00.000Z");
    expect(row.content_id).toBe(CID);
    expect(row.metric_window).toBe("d1");
    expect(row.ab_variant).toBe("overall");
    expect(row.ctr).toBe(6.4);
    expect(row.views).toBe(120000); // views24h 가 d1 overall 행에 실린다(§13.2 조회수 신뢰도).
    expect(row.recorded_at).toBe("2026-06-25T00:00:00.000Z");
  });

  it("ctr24h=null이면 ctr=null", () => {
    const row = mapCtr24hToMetricRow({ ...AB_INPUT, ctr24h: null }, CID, "2026-06-25T00:00:00.000Z");
    expect(row.ctr).toBeNull();
  });

  it("views24h=null이면 views=null(하위호환 — vconf 무가중)", () => {
    const row = mapCtr24hToMetricRow({ ...AB_INPUT, views24h: null }, CID, "2026-06-25T00:00:00.000Z");
    expect(row.views).toBeNull();
  });
});

describe("componentTypeFor — UI component → style_profiles.component_type (step2)", () => {
  it("'thumbnail' → 'thumbnail_copy'", () => {
    expect(componentTypeFor("thumbnail")).toBe("thumbnail_copy");
  });
  it("'title' → 'title'", () => {
    expect(componentTypeFor("title")).toBe("title");
  });
});

describe("buildLearningVideoStub — 학습 영상 stub 빌더", () => {
  it("source='produced'·status='in_production' 고정, title trim", () => {
    const stub = buildLearningVideoStub({ title: "  ISA 만기 전략  " });
    expect(stub.source).toBe("produced");
    expect(stub.status).toBe("in_production");
    expect(stub.title).toBe("ISA 만기 전략");
  });

  it("옵셔널 필드는 값이 있을 때만 키 포함(trim 적용)", () => {
    const stub = buildLearningVideoStub({
      title: "영상",
      youtubeVideoId: "  abc123  ",
      uploadDate: " 2026-06-25 ",
      thumbnailUrl: " https://i.ytimg.com/x.jpg ",
    });
    expect(stub.youtube_video_id).toBe("abc123");
    expect(stub.upload_date).toBe("2026-06-25");
    expect(stub.thumbnail_url).toBe("https://i.ytimg.com/x.jpg");
  });

  it("옵셔널 필드 미지정 시 키 자체가 없음(undefined 대입 안 함)", () => {
    const stub = buildLearningVideoStub({ title: "영상" });
    expect("youtube_video_id" in stub).toBe(false);
    expect("upload_date" in stub).toBe(false);
    expect("thumbnail_url" in stub).toBe(false);
  });

  it("빈 문자열·공백 옵셔널 필드는 제외(빈 값 누출 차단)", () => {
    const stub = buildLearningVideoStub({
      title: "영상",
      youtubeVideoId: "   ",
      uploadDate: "",
      thumbnailUrl: "  ",
    });
    expect("youtube_video_id" in stub).toBe(false);
    expect("upload_date" in stub).toBe(false);
    expect("thumbnail_url" in stub).toBe(false);
  });

  it("source를 'imported'로 만들지 않는다(참조편 드롭다운 오염 방지)", () => {
    const stub = buildLearningVideoStub({ title: "영상", youtubeVideoId: "vid" });
    expect(stub.source).not.toBe("imported");
    expect(stub.source).toBe("produced");
  });
});

describe("buildCorrectionRow — 교정쌍 행 빌더(교정 학습 step0)", () => {
  it("썸네일: gen/ideal payload는 {copy_main, copy_boxes} 모양(ab_variants 일치)", () => {
    const row = buildCorrectionRow({
      componentType: "thumbnail",
      genMain: ["AI 메인"], genBoxes: ["AI 박스"],
      idealMain: ["이상 메인"], idealBoxes: ["이상 박스"],
    });
    expect(row.component_type).toBe("thumbnail");
    const gen = row.gen_payload as Record<string, unknown>;
    const ideal = row.ideal_payload as Record<string, unknown>;
    expect(gen.copy_main).toEqual(["AI 메인"]);
    expect(gen.copy_boxes).toEqual(["AI 박스"]);
    expect(ideal.copy_main).toEqual(["이상 메인"]);
    expect(ideal.copy_boxes).toEqual(["이상 박스"]);
  });

  it("썸네일: 빈 문자열·공백은 제거(cleanStrings 재사용)", () => {
    const row = buildCorrectionRow({
      componentType: "thumbnail",
      genMain: ["  유효  ", "", "   "], genBoxes: [""],
      idealMain: ["이상"], idealBoxes: ["  박스  ", ""],
    });
    const gen = row.gen_payload as Record<string, unknown>;
    const ideal = row.ideal_payload as Record<string, unknown>;
    expect(gen.copy_main).toEqual(["유효"]);
    expect(gen.copy_boxes).toEqual([]);
    expect(ideal.copy_main).toEqual(["이상"]);
    expect(ideal.copy_boxes).toEqual(["박스"]);
  });

  it("제목: gen/ideal payload는 {title} 모양(trim 적용)", () => {
    const row = buildCorrectionRow({
      componentType: "title",
      genTitle: "  AI 제목  ",
      idealTitle: " 이상 제목 ",
    });
    expect(row.component_type).toBe("title");
    expect((row.gen_payload as Record<string, unknown>).title).toBe("AI 제목");
    expect((row.ideal_payload as Record<string, unknown>).title).toBe("이상 제목");
  });

  it("제목 미지정 입력은 빈 문자열 title(검증은 액션 계층)", () => {
    const row = buildCorrectionRow({ componentType: "title" });
    expect((row.gen_payload as Record<string, unknown>).title).toBe("");
    expect((row.ideal_payload as Record<string, unknown>).title).toBe("");
  });

  it("topic: trim 후 값 있을 때만 키 추가(undefined 대입 안 함)", () => {
    const withTopic = buildCorrectionRow({ componentType: "title", topic: "  ISA 만기  ", idealTitle: "x" });
    expect(withTopic.topic).toBe("ISA 만기");
    const noTopic = buildCorrectionRow({ componentType: "title", idealTitle: "x" });
    expect("topic" in noTopic).toBe(false);
    const blankTopic = buildCorrectionRow({ componentType: "title", topic: "   ", idealTitle: "x" });
    expect("topic" in blankTopic).toBe(false);
  });

  it("learned_at·diff는 넣지 않는다(step1/step2 책임)", () => {
    const row = buildCorrectionRow({ componentType: "title", idealTitle: "x" });
    expect("learned_at" in row).toBe(false);
    expect("diff" in row).toBe(false);
  });

  it("썸네일 미지정 배열은 빈 배열로 처리(undefined 누출 없음)", () => {
    const row = buildCorrectionRow({ componentType: "thumbnail" });
    const gen = row.gen_payload as Record<string, unknown>;
    expect(gen.copy_main).toEqual([]);
    expect(gen.copy_boxes).toEqual([]);
  });
});

describe("멱등성 — 같은 입력 2회 동일 결과", () => {
  it("ab_variants 매핑 2회 동일(A/B 모드)", () => {
    const first = mapCopyAbToRows(AB_INPUT, CID, TH);
    const second = mapCopyAbToRows(AB_INPUT, CID, TH);
    expect(second.abRows).toEqual(first.abRows);
  });

  it("ab_variants 매핑 2회 동일(단일 제목 모드)", () => {
    const first = mapCopyAbToRows(SINGLE_TITLE_INPUT, CID, TH);
    const second = mapCopyAbToRows(SINGLE_TITLE_INPUT, CID, TH);
    expect(second.abRows).toEqual(first.abRows);
  });

  it("onConflict 키(content_id·component_type·variant)가 유일", () => {
    const { abRows } = mapCopyAbToRows(AB_INPUT, CID, TH);
    const keys = abRows.map((r) => `${r.content_id}:${r.component_type}:${r.variant}`);
    expect(new Set(keys).size).toBe(abRows.length);
  });
});
