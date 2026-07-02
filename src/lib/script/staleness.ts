import type { RunState } from "../../domain/enums.js";

// 세그먼트 편집/재생성이 이후 단계(완료·게시)를 낡게 만드는지 판정(순수) — outline staleness 미러.
//   세그먼트를 손봐도 상태 전이는 없다(§불변식). 다만 이후 전체 재작성(fact 반려 rework 등)이 돌면
//   개별 수정분이 덮어써지므로, 그 위험 구간이면 UI가 경고 배너만 띄운다(차단 없음).
//   컴포넌트와 분리해 vitest(alias 미설정)에서 .js 상대경로로 단위 테스트 가능하게 둔다.

// 스크립트 다운스트림 = 검수/작성 이후 확정된 구간(approved·published). script_review·scripting·그 이전은
//   아직 대본이 유동적이라 세그먼트 수정이 "낡음"을 만들지 않는다 → false.
const SCRIPT_DOWNSTREAM_STATES: readonly RunState[] = ["approved", "published"];

export function isScriptDownstreamStarted(state: RunState): boolean {
  return SCRIPT_DOWNSTREAM_STATES.includes(state);
}
