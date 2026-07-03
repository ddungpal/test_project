// 온보딩 아크 stale 판정 — 순수·throw 0. UI(page.tsx)가 현재 선택 주제와 아크 소스 주제를 비교해 경고 배너를 띄운다.
//   ★ 하나라도 없으면(구버전 아크·주제 미선택) false — 오경보 방지가 우선(차단 아닌 경고이므로 보수적으로).
//   컴포넌트가 아니라 src/lib/**에 두는 이유: vitest에 @/ alias가 없어 컴포넌트 import 시 스위트 로드 실패(rules.md).

/** 아크 소스 주제 ≠ 현재 선택 주제면 stale(true). 하나라도 없으면 false(구버전 아크·오경보 방지). 순수·throw 0. */
export function isOnboardingArcStale(
  arcSourceTitle: string | null | undefined,
  currentTopicTitle: string | null | undefined,
): boolean {
  const arc = (arcSourceTitle ?? "").trim();
  if (arc.length === 0) return false; // 소스 주제 없음(구버전 아크) → 오경보 방지
  const cur = (currentTopicTitle ?? "").trim();
  if (cur.length === 0) return false; // 현재 주제 없음 → 판정 불가
  return arc !== cur; // 둘 다 있고 trim 후 다르면 stale
}
