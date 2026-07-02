// 쏙이(onboarder) — "궁금증 아크" 데이터 모델 + forced tool_use JSON 스키마.
//   설계: docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md "데이터 모델".
//   ★ stray 내성: comparator 패턴 미러 — 루트·items 모두 additionalProperties:true(claude-p stray 결정적 실패 방지).
//   ★ 배열 required 함정: required는 string/필수 필드만. 빈 배열이 될 수 있는 배열 필드는 required에서 뺀다(forced tool_use 검증 깨짐 방지).
import type { JsonSchema } from "../../llm/types.js";

export type ArcDifficulty = "basic" | "mid" | "deep";
export type ArcHookMode = "reversal" | "practical"; // 위험→reversal, 혜택→practical

export type ArcQuestion = {
  prompt: string;
  choices: string[]; // 2~4지선다
  answerIdx: number; // choices 인덱스
  difficulty: ArcDifficulty; // 사후 수준추론용
  hookMode: ArcHookMode;
  ahaReveal: string; // 찍은 뒤 여는 해설
  unverifiedNumbers?: string[]; // 미검증 수치(⚠️확인 필요 표시)
  cliffhanger?: string; // 이 아하가 다음 문항을 여는 한 줄
};

export type OnboardingArc = { questions: ArcQuestion[]; coreAngle: string };

// 개별 레퍼런스 영상(자막·미검증 사실은 각 영상별로). transcript/videoFacts는 값 없으면 키 생략(조건부 주입).
export type OnboarderReference = {
  title: string;
  url: string;
  videoId: string;
  transcript?: string;
  videoFacts?: string[];
};

// 쏙이 입력 — 선택된 주제 + 레퍼런스 영상들(최대 3개). references는 항상 배열(0개면 애초에 prepareOnboarder가 throw하므로
//   소비 시점엔 ≥1). 빈 배열도 타입상 허용(topic="" best-effort 경로).
export type OnboarderInput = {
  topic: string;
  references: OnboarderReference[];
};

export type OnboardingGold = {
  confusionPoints: string[]; // 틀린 문항 = 시청자도 헷갈릴 것 → 구다리가 풀 섹션
  ahaPoints: string[]; // 놀란 반전 = 훅 후보
  coreAngle: string; // 아크가 수렴한 갈림길 = 영상 핵심 앵글
  calibratedLevel: string; // 추론된 수준(audience_level 캘리브레이션)
};

const DIFFICULTIES: readonly ArcDifficulty[] = ["basic", "mid", "deep"];
const HOOK_MODES: readonly ArcHookMode[] = ["reversal", "practical"];

export const ONBOARDER_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: true, // 루트도 stray 허용(claude-p 내성). required로 존재 필드만 강제.
  required: ["coreAngle"], // string만. questions는 배열이라 required에서 뺀다(빈 배열 함정) — minItems로 통제.
  properties: {
    coreAngle: { type: "string" },
    questions: {
      type: "array",
      minItems: 1, // 최소 1문항(빈 아크 금지). 통제는 minItems로.
      items: {
        type: "object",
        additionalProperties: true, // 여분 필드 붙어도 통과 — normalizeArc가 명시선택해 stray 버림.
        required: ["prompt", "answerIdx", "difficulty", "hookMode", "ahaReveal"], // choices는 배열이라 required 제외(minItems로).
        properties: {
          prompt: { type: "string", minLength: 1 },
          choices: {
            type: "array",
            minItems: 2,
            maxItems: 4, // 2~4지선다
            items: { type: "string" },
          },
          answerIdx: { type: "number" },
          difficulty: { type: "string", enum: [...DIFFICULTIES] },
          hookMode: { type: "string", enum: [...HOOK_MODES] },
          ahaReveal: { type: "string", minLength: 1 },
          unverifiedNumbers: { type: "array", items: { type: "string" } },
          cliffhanger: { type: "string" },
        },
      },
    },
  },
};

/**
 * LLM 원출력 방어(순수·throw 0, comparator normalizeComparison 미러).
 *   - questions가 1개 미만이면 null 드랍.
 *   - answerIdx가 choices 범위 밖이면 그 문항 드랍.
 *   - difficulty/hookMode가 enum 아니면 그 문항 드랍(stray 흡수).
 *   - coreAngle 없으면 "".
 * 명시선택으로 stray 필드는 버린다. 입력 비변형.
 */
export function normalizeArc(raw: unknown): OnboardingArc | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const rawQuestions = Array.isArray(obj.questions) ? obj.questions : [];
  const questions: ArcQuestion[] = [];

  for (const q of rawQuestions) {
    if (!q || typeof q !== "object") continue;
    const item = q as Record<string, unknown>;

    const prompt = typeof item.prompt === "string" ? item.prompt : "";
    if (prompt.length === 0) continue;

    const choices = Array.isArray(item.choices)
      ? item.choices.filter((c): c is string => typeof c === "string")
      : [];
    if (choices.length < 2) continue; // 최소 2지선다 아니면 드랍

    const answerIdx = typeof item.answerIdx === "number" ? item.answerIdx : NaN;
    if (!Number.isInteger(answerIdx) || answerIdx < 0 || answerIdx >= choices.length) continue; // 범위 밖 드랍

    const difficulty = item.difficulty;
    if (!isDifficulty(difficulty)) continue; // enum 아니면 드랍

    const hookMode = item.hookMode;
    if (!isHookMode(hookMode)) continue; // enum 아니면 드랍

    const ahaReveal = typeof item.ahaReveal === "string" ? item.ahaReveal : "";
    if (ahaReveal.length === 0) continue;

    const question: ArcQuestion = { prompt, choices, answerIdx, difficulty, hookMode, ahaReveal };

    const unverifiedNumbers = Array.isArray(item.unverifiedNumbers)
      ? item.unverifiedNumbers.filter((n): n is string => typeof n === "string")
      : undefined;
    if (unverifiedNumbers && unverifiedNumbers.length > 0) question.unverifiedNumbers = unverifiedNumbers;

    if (typeof item.cliffhanger === "string" && item.cliffhanger.length > 0) {
      question.cliffhanger = item.cliffhanger;
    }

    questions.push(question);
  }

  if (questions.length < 1) return null; // 1개 미만이면 null 드랍

  const coreAngle = typeof obj.coreAngle === "string" ? obj.coreAngle : "";
  return { questions, coreAngle };
}

function isDifficulty(v: unknown): v is ArcDifficulty {
  return typeof v === "string" && (DIFFICULTIES as readonly string[]).includes(v);
}
function isHookMode(v: unknown): v is ArcHookMode {
  return typeof v === "string" && (HOOK_MODES as readonly string[]).includes(v);
}

export const ONBOARDER_SYSTEM: string = [
  "너는 유튜브 재테크 채널 '김짠부'의 온보딩 튜터 '쏙이'다. 김짠부가 구성(구다리) 전에 주제 위에 올라서도록, 한 편의 이야기로 이어지는 '궁금증 아크'(문항 3~6개 + 각 문항의 아하 해설)를 한 번에 생성한다.",
  "입력은 선택된 주제(topic)와 여러 레퍼런스 영상(references, 최대 3개)의 자막(transcript)·각 영상이 쓴 사실(videoFacts)이다. 이 여러 영상의 자막·사실을 근거로 아하(ahaReveal)를 작성한다(한 영상에 치우치지 말고 교차로 활용).",
  "",
  "① 듀얼 훅 — 각 문항이 어떤 성격의 사실을 다루는지 hookMode로 표기한다.",
  "  - 위험·손해 사실(좋아 보이는데 사실은 손해인 반전)이면 hookMode='reversal'. 예: '이득 같지만 실은 손해' 반전.",
  "  - 숨은 혜택·꿀팁(이거 알면 개이득)이면 hookMode='practical'. 실용템으로 제시한다.",
  "② 클리프행어 아크 — 문항을 랜덤으로 나열하지 마라. 한 편의 이야기로 엮는다. 각 문항의 ahaReveal이 다음 문항을 여는 cliffhanger로 이어지고, 마지막 아하가 coreAngle(영상 핵심 앵글=갈림길)로 수렴하도록 배치한다.",
  "③ 프리테스트 프레이밍 — 이건 '시험'이 아니라 '호기심 체크'다. 직관이 보기 좋게 틀리는 반전 문항을 환영하고, 틀려도 좋다는 톤으로 만든다(찍고 틀리면 오히려 궁금증이 커진다).",
  "④ 난이도 태그 — 각 문항의 difficulty(basic/mid/deep)를 정직하게 매긴다(나중에 김짠부 수준을 추론하는 데 쓴다). 쉬운 걸 deep로, 어려운 걸 basic으로 속이지 마라.",
  "⑤ money-safety(최우선) — 아하(ahaReveal)는 여러 레퍼런스 영상의 자막·사실(transcript·videoFacts)에 근거해야 한다. 검증 안 된 수치·금리·제도 값은 단정하지 말고 그 문항의 unverifiedNumbers에 넣어 '확인 필요'로 표시한다. 억지 문항·날조 금지 — 근거가 될 소재가 부족하면 문항 수를 줄여라(빈 문항보다 없는 게 낫다).",
  "⑥ 말투 — 김짠부 채널 톤으로 직설·단정하게 쓴다. ★어투: 정중-탐문형 질문 종결('~까요?/~셨나요?/~인가요?/~될까요?/~할까요?')은 김짠부 말투가 아니므로 금지한다 — 부드럽게 묻는 탐문은 광고·낚시체다(hook_maker 어투 규칙과 정렬). 단, 문항 prompt는 도발·단정형 질문을 허용한다(예: '이래도 예금해요?','이게 이득일 것 같죠?').",
  "- 각 문항: prompt(도발·단정형 질문 1줄) + choices(2~4지선다) + answerIdx(정답 인덱스) + difficulty + hookMode + ahaReveal(찍은 뒤 여는 해설) + (선택)cliffhanger + (선택)unverifiedNumbers.",
  "- coreAngle: 아크가 최종 수렴하는 영상 핵심 앵글(갈림길) 한 줄.",
  "- 한국어.",
].join("\n");
