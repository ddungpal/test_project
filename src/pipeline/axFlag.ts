// AX 단계 전환 플래그 — RAG(매번 말투 프로파일 주입) → AX(내재화) 모드 스위치 골격(§14 모델 라우팅·principles §4 RAG→AX).
//   김짠부가 한 단계에 "이제 됐다" 하면 AX_STAGES에 그 단계를 넣어 그 단계만 내재화 모드로 전환한다.
//   ★ 기본(AX_STAGES 미설정) = 빈 Set → resolveToneInjection이 RAG 컴포넌트를 그대로 반환(바이트 불변·픽스처 보존).
//   ★ 순수 함수만 — DB·LLM·네트워크 0. 입력만으로 결정 → 언제든 롤백(stage 빼면 즉시 RAG 복귀).

import { STAGES } from "../domain/enums.js";

const VALID_STAGES = new Set<string>(STAGES);

/**
 * AX_STAGES(쉼표구분, 예 "script,title_thumb")를 파싱해 내재화 켜진 stage 집합으로.
 * 미설정/빈 문자열 → 빈 Set. 공백 trim·중복 정규화(Set). 알 수 없는 stage는 무시.
 */
export function parseAxStages(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = env.AX_STAGES;
  if (raw === undefined || raw === "") return new Set<string>();
  const out = new Set<string>();
  for (const part of raw.split(",")) {
    const s = part.trim();
    if (s !== "" && VALID_STAGES.has(s)) out.add(s);
  }
  return out;
}

/** 이 stage가 AX(내재화) 모드로 전환됐는가. */
export function isAxStage(stage: string, axStages: Set<string>): boolean {
  return axStages.has(stage);
}

// ponytail: 빈 스위치 — 플래그 켜지면 RAG 프로파일 주입을 '내재화됨' 마커로 대체(실제 few-shot 강화/모델 전환은 데이터·정성판단 후)
export const AX_TONE_MARKER = { internalized: true } as const;

/**
 * stage의 말투 주입을 결정. AX 단계면 AX_TONE_MARKER(내재화 stub),
 * 아니면 ragComponents를 그대로 반환(바이트 불변).
 */
export function resolveToneInjection(stage: string, ragComponents: unknown, axStages: Set<string>): unknown {
  return isAxStage(stage, axStages) ? AX_TONE_MARKER : ragComponents;
}
