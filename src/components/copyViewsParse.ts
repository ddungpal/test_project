// /copy-learn 폼 24h 조회수 입력 파싱(순수 함수, UI·react 의존 없음 — 단위테스트 가능).
//   ctr 등에서 쓰는 numOrNull과 동일한 빈칸/비수치 처리 + 조회수 전용으로 음수→null.

/** "12.5" → 12.5, 빈칸/비수치 → null. (CopyLearningForm.numOrNull과 동일 규칙) */
export function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 24h 조회수 파싱. 빈칸/비수치/음수 → null(무가중·하위호환), "0" → 0. (조회수는 음수가 무의미) */
export function parseViews24h(s: string): number | null {
  const n = numOrNull(s);
  return n != null && n >= 0 ? n : null;
}
