import type { ReactNode } from "react";

// 세그먼트별 "근거 토글" 공유 셸 — 네이티브 <details>(zero JS·접근성 기본 제공).
//   상태 없음: 제어·표시 전용. 안쪽 fact/asset 렌더는 소비자(ScriptReview·SegmentList)가 children으로 주입.
//   기본 닫힘(open 미부여). 근거 0건이면 토글 자체 생략(null).
//   summary: "근거 N건" + pending>0이면 "· ⚠️ 확인 필요 M건"(trus-yellow 강조·aria로 읽힘).
export function EvidenceToggle({
  factCount,
  assetCount,
  pendingCount,
  children,
}: {
  factCount: number;
  assetCount: number;
  pendingCount: number;
  children: ReactNode;
}): React.JSX.Element | null {
  const total = factCount + assetCount;
  if (total === 0) return null;

  return (
    <details className="mt-3 border-t border-trus-white/10 pt-2">
      <summary className="flex cursor-pointer list-none items-baseline gap-1.5 text-[11px] text-trus-white/60 outline-none hover:text-trus-white/80 focus-visible:ring-1 focus-visible:ring-trus-yellow [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="shrink-0 text-trus-white/40">▸</span>
        <span className="font-bold tracking-wider text-trus-white/50 uppercase">근거 {total}건</span>
        {pendingCount > 0 && (
          <span className="font-bold text-trus-yellow">· ⚠️ 확인 필요 {pendingCount}건</span>
        )}
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </details>
  );
}
