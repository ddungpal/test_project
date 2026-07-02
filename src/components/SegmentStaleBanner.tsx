import type { RunState } from "@/domain/enums";
import { isScriptDownstreamStarted } from "@/lib/script/staleness";

// 세그먼트 편집/재생성 staleness 경고 — 다운스트림(approved/published) 진입 후엔 개별 수정·재생성분이
//   이후 전체 재작성(fact 반려 rework 등)으로 덮어써질 수 있음을 알린다. PostConfirmStructureEdit stale 배너 미러.
//   ★ 경고만 — 차단·자동재실행 없음(설계: 허용+경고). script_review는 stale=false라 안 뜨고 approved에서만.
//   리스트 상단 한 번만 렌더(세그먼트마다 반복 금지) — 소비자(SegmentList/ScriptReview)가 최상단에 한 번 놓는다.
export function SegmentStaleBanner({ runState }: { runState: RunState }): React.JSX.Element | null {
  if (!isScriptDownstreamStarted(runState)) return null;
  return (
    <div className="border border-trus-yellow px-3 py-2 text-xs text-trus-yellow">
      개별 수정·재생성분은 이후 대본 전체 재작성(사실 반려 등) 시 사라집니다.
    </div>
  );
}
