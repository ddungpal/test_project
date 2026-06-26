// 교정쌍 payload → 사람이 읽는 텍스트 변환(순수 함수). DB·server-only 무관 → vitest 가 직접 import.
//   payload 모양은 buildCorrectionRow(copyLearnMap.ts)와 일치: 썸네일 {copy_main,copy_boxes} | 제목 {title}.
//   analyzeCorrectionDiff 가 gen/ideal payload 를 이 함수로 텍스트화해 LLM 입력에 넣는다.

import type { Json } from "../../lib/supabase/database.types.js";

/** Json 값에서 string[] 안전 추출(배열 아니면 [], 문자열 아닌 원소 제거·trim·빈문자 제거). */
function asStringArray(v: Json | undefined): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * thumbnail_corrections 의 payload(gen 또는 ideal) 1개를 사람이 읽는 텍스트로 변환.
 *   - 썸네일: "메인카피: ... / 박스카피: ..." 형태. 항목이 여러 개면 ' | ' 로 잇는다.
 *   - 제목: 제목 텍스트 그대로.
 *   - 빈/누락 필드는 안전 처리(throw 없음) — 비어 있으면 "(없음)" 으로 표기해 LLM 이 부재를 인지.
 */
export function correctionToPromptText(componentType: "thumbnail" | "title", payload: Json): string {
  const obj =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { copy_main?: Json; copy_boxes?: Json; title?: Json })
      : {};

  if (componentType === "title") {
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    return title.length > 0 ? title : "(없음)";
  }

  // thumbnail
  const main = asStringArray(obj.copy_main);
  const boxes = asStringArray(obj.copy_boxes);
  const mainText = main.length > 0 ? main.join(" | ") : "(없음)";
  const boxText = boxes.length > 0 ? boxes.join(" | ") : "(없음)";
  return `메인카피: ${mainText}\n박스카피: ${boxText}`;
}
