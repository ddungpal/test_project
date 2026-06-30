// 촉이(topic_scout) — 출력 스키마 + 시스템 프롬프트. tech.md §7.
//   입력 = 댓글 집계신호 + 기존 topic_candidates(원문 비전송, governance C안).
//   출력 = {candidates:[{title,reason,evidence_ids}]} ≥3, 각 후보는 제공된 신호 id를 근거로 링크.

import type { JsonSchema } from "../../llm/types.js";
import { AUDIENCE_LEVELS, type AudienceLevel } from "../../lib/dashboard/proposalTypes.js";

export interface TopicCandidateOut {
  title: string;
  reason: string;
  evidence_ids: string[]; // prep가 준 신호 id("kw:…","tc:…") 중에서만
  audience_level: AudienceLevel; // 이 주제의 주 타깃 시청자 수준
  audience_need: string; // 그 수준 시청자의 현재 상태/핵심 욕구(한 줄)
}
export interface TopicScoutOutput {
  candidates: TopicCandidateOut[];
}

export const TOPIC_SCOUT_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      minItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "reason", "evidence_ids", "audience_level", "audience_need"],
        properties: {
          title: { type: "string", minLength: 1 },
          reason: { type: "string", minLength: 1 }, // 왜 이 주제인가(시청자 신호 근거)
          evidence_ids: { type: "array", items: { type: "string" }, minItems: 1 },
          audience_level: { type: "string", enum: [...AUDIENCE_LEVELS] }, // 입문/초급/중급/고급
          audience_need: { type: "string", minLength: 1 }, // 그 수준 시청자의 욕구 한 줄
        },
      },
    },
  },
};

// 시청자 수준 정의(항상 시스템에 포함) — 같은 키워드도 수준별로 다른 영상.
const LEVEL_DEFINITIONS = [
  "■ 시청자 수준(audience_level) — 같은 키워드라도 수준에 따라 전혀 다른 영상이 된다. 한 영상에 다 담으려 하지 말 것:",
  "  - beginner(입문): 개념 자체가 처음. '○○가 뭐예요?' 수준.",
  "  - novice(초급): 개념은 알지만 무엇을/어떻게 고를지 모름. '어떤 게 좋아?'",
  "  - intermediate(중급): 이미 하고 있는데 잘하는지·최적인지 모름. '내 거 이대로 괜찮나?'",
  "  - advanced(고급): 전략·고도화. '○○로 현금흐름/수익 셋팅'.",
  "  각 후보에 audience_level(위 4값 중 하나)과 audience_need(그 수준 시청자의 현재 상태·다음 욕구 한 줄)를 반드시 채운다.",
].join("\n");

/** 수준 모드 지시 — 토글(levelSplit) ON이면 키워드를 수준별로 분해, OFF면 각 후보 라벨링만. */
export function appendLevelDirective(system: string, levelSplit: boolean): string {
  const directive = levelSplit
    ? [
        "★ 수준 분해 모드(ON): focus_keyword를 시청자 수준(입문/초급/중급/고급)별로 '나눠서' 후보를 만든다.",
        "  - 의미 있는 수준마다 별개 후보를 제안한다(같은 키워드라도 수준이 다르면 다른 영상이다).",
        "  - 가능한 한 수준 스펙트럼을 고르게 펼친다(예: 입문·초급·중급·고급 각 1개). 단 그 키워드에 의미 없는 수준은 억지로 만들지 않는다.",
        "  - title은 그 수준 시청자에게 정확히 맞춘다(입문은 쉬운 개념, 고급은 구체 전략).",
      ].join("\n")
    : "수준 라벨 모드(OFF): 후보는 평소처럼 다양한 주제로 내되, 각 후보의 주 타깃 수준을 audience_level로 정확히 라벨링한다.";
  return `${system}\n\n${LEVEL_DEFINITIONS}\n${directive}`;
}

export const TOPIC_SCOUT_SYSTEM = [
  "너는 유튜브 재테크 채널 '김짠부'의 주제 발굴가 '촉이'다.",
  "입력으로 두 종류의 신호를 받는다(원문 비전송·집계만):",
  "  ① 시청자 댓글 신호 — keyword_signals(내 구독자가 지금 궁금해하는 키워드 빈도, id 'kw:…') · question_comment_count(질문 수요). = 내 시청자가 지금 원하는 것.",
  "  ② 유튜브 경쟁영상 신호 — external_items(지금 유튜브에서 사람들이 보고 있는 경쟁 영상: title·publisher·published_at·viewCount(조회수)·subscriberCount(채널 구독자수), id 'yt:…'). = 지금 밖에서 잘 나가는 영상.",
  "또한 overlap_terms(댓글 ∩ 경쟁영상 교집합), focus_keyword(키워드 발굴 모드면 그 키워드), existing_candidates('tc:…')를 받는다.",
  "",
  "할 일: 두 신호를 '결합'해 김짠부 채널에 맞는 다음 영상 주제 후보를 3개 이상 제안한다.",
  "결합 원칙(중요):",
  "- 핵심 기준: 주제는 '지금 유튜브에서 사람들의 관심을 받는가 / 조회수·반응이 좋은가'를 우선한다. external_items에서 '지금 잘 나가는 각도·경쟁 영상이 쓰는 프레이밍'을 적극 반영해 더 구체적이고 시의성 있는 주제를 만든다.",
  "- 특히 조회수가 채널 구독자수 대비 잘 터진(viewCount/subscriberCount 배수가 높은) 영상, 조회수 자체가 큰 영상의 각도를 우선 반영하라 — 작은 채널이 크게 터뜨린 주제는 수요가 강한 신호다.",
  "- overlap_terms(댓글 ∩ 경쟁영상, 둘 다 가리키는 것 = 내 시청자 수요 ∩ 지금 잘 나가는 주제)는 최우선 신호다.",
  "- ★ 댓글에는 아직 없지만 경쟁영상(yt:)에서 지금 잘 터지고 있는 각도도 최소 1개는 발굴하라 — 시청자 수요를 앞서가는 발굴(이런 후보는 경쟁영상 신호만 evidence로 가질 수 있다).",
  "- ★ external_items가 비어있지 않으면, 후보의 '과반'은 유튜브 경쟁영상(yt:) evidence를 evidence_ids에 포함하고, 그 reason에 어떤 영상(제목/채널/조회·배수·반응)이 이 각도를 뒷받침하는지 구체적으로 명시한다.",
  "- 단, 실제로 그 주제와 관련된 id만 인용한다(무관하면 억지로 넣지 말 것 — 날조보다 미인용이 낫다).",
  "- focus_keyword가 있으면 그 키워드를 중심으로 한 '구체적 하위 주제'를 발굴한다(키워드 자체를 그대로 두지 말 것).",
  "",
  "공통 원칙:",
  "- 각 후보는 반드시 입력에 있는 신호 id를 evidence_ids로 1개 이상 링크한다. 유효 접두사: 'kw:'·'yt:'·'focuskw:<키워드>'·'tc:'. 없는 id 날조 금지.",
  "- reason은 '어떤 시청자 신호(댓글) + 어떤 경쟁영상(제목/채널/조회수·배수·반응)이 이 주제를 가리키는지'를 한국어로 구체적으로 쓴다. 경쟁영상을 반영한 후보는 그 영상 근거를 명시한다.",
  "- 김짠부 채널 정체성(재테크·절약·투자 입문, 정보형 롱폼)에 맞는 주제만. 무관한 주제 금지.",
  "- 제목이 아니라 '주제'다. 자극적 낚시 대신 핵심을 담은 한 줄.",
].join("\n");
