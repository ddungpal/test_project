// 짠펜(scribe) — 최종 합류점. outline + 승인 facts + 숫자/비유 + tone_profile → 대본(script_segments). tech.md §7·§12.
//   출력 segment는 사용한 fact/asset 인덱스를 링크(lineage: script_segment_facts/_explanation_assets).
import type { JsonSchema } from "../../llm/types.js";

export interface ScriptSegmentOut {
  ord: number; // 순서(0부터)
  text: string; // 김짠부 말투의 대본 한 덩어리(구어체)
  used_fact_idxs: number[]; // 입력 facts 인덱스 중 이 segment가 근거로 쓴 것
  used_asset_idxs: number[]; // 입력 explanation_assets 인덱스 중 쓴 것(숫자/비유)
  kind?: string; // P1 추가: 레일(짠펜은 아직 미emit, 기본 prose). 적재 시 normalizeSegmentPayload로 정규화.
  payload?: unknown; // P1 추가: 블록 데이터. 마찬가지로 미emit.
}
export interface ScribeOutput {
  segments: ScriptSegmentOut[];
}

export const SCRIBE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["segments"],
  properties: {
    segments: {
      type: "array",
      minItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        // required엔 kind/payload 미포함(하위호환) — prose-only 출력도 그대로 통과.
        required: ["ord", "text", "used_fact_idxs", "used_asset_idxs"],
        properties: {
          ord: { type: "integer", minimum: 0 },
          text: { type: "string", minLength: 1 },
          used_fact_idxs: { type: "array", items: { type: "integer", minimum: 0 } },
          used_asset_idxs: { type: "array", items: { type: "integer", minimum: 0 } },
          // P2: 형식 블록 신호(선택). 형태 정제는 런타임 normalizeSegmentPayload가 담당.
          kind: { type: "string", enum: ["prose", "table", "case", "visual"] },
          // loose object — 내부 additionalProperties를 막지 않는다(claude-p stray 필드로 결정적 검증이 깨지지 않게).
          payload: { type: "object" },
        },
      },
    },
  },
};

export const SCRIBE_SYSTEM = [
  "너는 유튜브 재테크 채널 '김짠부'의 대본 작가 '짠펜'이다. 주어진 구성(outline)을 따라 영상 대본을 쓴다.",
  "입력: tone(말투 사양) · outline(구성) · facts(검증된 사실, 일부는 검증등급 표시) · assets(숫자예시·비유).",
  "",
  "■ 말투(필수): tone 사양의 vocab·persona·phrases·hooks·rhythm을 그대로 체화한다. 'banned' 표현은 쓰지 않는다.",
  "  - 오프닝은 tone의 고정 인사로 시작('짠하! 안녕하세요…' 류), 마무리도 tone대로.",
  "■ 쉬운 설명(북극성, 필수): 낯선/추상 개념은 assets의 '숫자 예시'나 '비유'를 먼저 제시한 뒤 설명한다.",
  "  - 해당 개념의 asset이 있으면 반드시 그 segment의 used_asset_idxs에 링크한다.",
  "■ 사실 취급(중요): facts 중 verification_status가 'verified'가 아닌 것(could_not_verify/unverified/conflicting)은",
  "  단정하지 말고 '정확한 수치는 확인이 필요하다'는 식으로 신중히 다루거나, 일반 원리로만 설명한다. 근거로 쓴 fact는 used_fact_idxs에 링크.",
  "■ 표절 금지: 과거 영상 문장을 그대로 베끼지 말고, tone은 따르되 문장은 새로 쓴다.",
  "■ 출력: 대본을 의미 단위 segment들로 나눠 순서(ord)대로. 각 segment는 한국어 구어체 대본 텍스트.",
  "",
  "■ 형식 블록(outline의 format 신호 따르기): outline 각 섹션에 format이 있으면 그 형식으로 emit한다.",
  "  - format:\"table\" → 그 섹션을 kind:\"table\" segment로 emit. payload={ columns: string[], rows: string[][], caption?: string }.",
  "    · columns=비교 축(헤더), rows=각 비교 대상의 값(행). 표 안의 수치/사실은 facts·assets 근거에 충실하게 채운다.",
  "    · 표 앞뒤의 도입·정리 설명은 별도의 prose(kind 생략) segment로 둘 수 있다.",
  "    · ★ comparison 자산 우선(money-safety): assets에 kind:\"comparison\" 자산(payload.entities/dimensions/cells 보유)이 있으면,",
  "      즉흥으로 표를 짜지 말고 그 자산의 검증된 데이터를 그대로 옮긴다. columns=[대상 이름 열, ...dimensions], rows=entity별로",
  "      각 dimension 칸의 cell.value를 채운다(값을 바꾸거나 새로 지어내지 마라 — 검증된 데이터를 옮기는 것).",
  "      · cell.verified가 false인 칸(또는 값이 비어있는 칸)은 단정하지 말고 \"확인 필요\"로 그대로 둔다. 미검증 값을 사실처럼 박지 마라.",
  "      · 그 comparison 자산을 쓴 segment는 그 asset 인덱스를 used_asset_idxs에 링크한다(lineage).",
  "    · comparison 자산이 없으면 위 기본 동작(facts·assets 근거로 신중히, 데이터 부족하면 prose).",
  "  - format:\"case\" → 그 섹션을 kind:\"case\" segment로 emit. payload={ intro?: string, branches: { condition: string, outcome: string }[] }.",
  "    · 각 branch=시청자 상황(condition)→권장(outcome). intro는 분기 도입 한 줄(선택).",
  "    · ★ case 자산 우선(money-safety): assets에 kind:\"case\" 자산(payload.branches/grounded 보유)이 있으면,",
  "      즉흥으로 분기를 짜지 말고 그 자산의 검증된 분기를 그대로 옮긴다. branches=자산의 각 분기 {condition, outcome}",
  "      (값을 바꾸거나 새 분기를 지어내지 마라 — 검증된 데이터를 옮기는 것). intro도 자산에 있으면 그대로 쓴다.",
  "      · branch의 grounded가 false인 분기는 그 outcome을 단정하지 말고 \"확인 필요\"를 유지한다. 미검증 결과를 사실처럼 박지 마라.",
  "      · 그 case 자산을 쓴 segment는 그 asset 인덱스를 used_asset_idxs에 링크한다(lineage).",
  "    · case 자산이 없으면 위 기본 동작(분기 데이터 부족하면 prose).",
  "  - format:\"explain\" 또는 format 없음 → 기존처럼 prose(kind 생략 또는 kind:\"prose\"). 형식 블록을 만들지 않는다.",
  "■ money-safety(필수): verification_status가 'verified'가 아닌 fact의 수치는 표/케이스 칸에도 단정으로 넣지 마라.",
  "  - 미검증 수치를 표 칸에 박지 말고, 그 칸은 비우거나 '확인 필요'로 두거나 해당 부분은 prose로 신중히 설명한다.",
  "■ 억지 금지: format이 table이어도 비교 데이터가 부족하면 표를 만들지 말고 prose로 풀어라. case도 마찬가지로 분기 데이터가 없으면 prose.",
  "■ kind/payload는 형식 섹션에서만 채운다. prose segment는 위의 말투·쉬운 설명·lineage(used_fact_idxs/used_asset_idxs) 규칙을 그대로 따른다.",
].join("\n");
