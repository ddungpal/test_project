// 런 화면 교정 학습 패널 — 후보 payload(jsonb→unknown)에서 'AI 생성' 카피(메인/박스) 안전 추출.
//   순수 함수(UI·react 의존 없음 — 단위테스트 가능). CandidateBody의 썸네일 추출 방식과 동형(드리프트 0):
//   Array.isArray 가드 → 각 원소 typeof==="string" 만 trim → 빈 문자열 제거.
//   payload 형태 보장 없음(LLM 산출·사람 수정) → 배열 아님·더티값·키 누락에도 throw 없이 [] 폴백.

import type { ThumbnailPayload } from "@/lib/dashboard/proposalTypes";

/** 문자열 배열 후보를 안전 정제 — 배열 아니면 [], string 아닌 원소 제거, trim 후 빈칸 제거. */
function cleanStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);
}

/** 후보 payload에서 AI 생성 메인/박스 카피 추출. saveCorrection 의 genMain/genBoxes 로 그대로 전달한다. */
export function extractGenCopy(payload: unknown): { main: string[]; boxes: string[] } {
  const p = (payload ?? {}) as Partial<ThumbnailPayload>;
  return {
    main: cleanStringArray(p.thumbnail_main),
    boxes: cleanStringArray(p.thumbnail_boxes),
  };
}
