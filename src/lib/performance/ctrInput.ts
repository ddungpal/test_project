// CTR(노출클릭률) 수동입력 파싱·표시 순수 헬퍼(ctr-input-screen step2).
//   YouTube Analytics API 가 노출클릭률을 안 주므로 Studio '도달범위' 보고 사람이 앱에 직접 입력한다.
//   ★ 순수 로직만 — DB/컴포넌트 import 금지. 클라이언트 컴포넌트가 아니라 src/lib/** 에 두고 export
//     (컴포넌트를 테스트가 import 하면 내부 @/ import 까지 끌려와 vitest 스위트가 로드 실패하는 rules.md 사각지대 회피).

/** CTR% 입력 파싱 — 빈값/비숫자/범위밖(0 < ctr ≤ 100) 거부. 통과 시 number. 에러 메시지는 한글. */
export function parseCtrInput(raw: string): { ok: true; ctr: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "노출클릭률을 입력하세요." };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { ok: false, error: "숫자를 입력하세요." };
  if (n <= 0) return { ok: false, error: "0보다 큰 값을 입력하세요." };
  if (n > 100) return { ok: false, error: "100 이하로 입력하세요." };
  return { ok: true, ctr: n };
}

/** 표시용 — null 이면 "—", 값이면 "3.8%". */
export function formatCtr(n: number | null): string {
  if (n === null) return "—";
  return `${n}%`;
}
