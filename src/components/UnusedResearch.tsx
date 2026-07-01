import type { FactView, AssetView } from "@/lib/dashboard/researchView";
import { FactCard } from "./FactCard";
import { ResearchAssetList } from "./ResearchAssetList";

// "안 쓰인 리서치" 하단 토글 — 어느 세그먼트에도 안 쓰인 fact·자산을 접힌 <details> 하나로 강등.
//   props는 이미 unused만 필터된 것. 0건이면 렌더 안 함(빈 토글 금지).
//   EvidenceToggle 톤 계승(▸ 마커·webkit 마커 숨김·focus-visible 노랑 링). full 렌더는 FactCard·ResearchAssetList 재사용.
export function UnusedResearch({ facts, assets }: { facts: FactView[]; assets: AssetView[] }): React.JSX.Element | null {
  const total = facts.length + assets.length;
  if (total === 0) return null;

  return (
    <details className="mt-6 border-t border-trus-white/10 pt-3">
      <summary className="flex cursor-pointer list-none items-baseline gap-1.5 text-[11px] text-trus-white/60 outline-none hover:text-trus-white/80 focus-visible:ring-1 focus-visible:ring-trus-yellow [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="shrink-0 text-trus-white/40">▸</span>
        <span className="font-bold tracking-wider text-trus-white/50 uppercase">안 쓰인 리서치 ({total}건)</span>
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        {facts.length > 0 && (
          <div className="flex flex-col gap-2">
            {facts.map((f) => (
              <FactCard key={f.id} fact={f} />
            ))}
          </div>
        )}
        {assets.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-trus-white/60">쉬운 설명 자산 ({assets.length})</h3>
            <ResearchAssetList assets={assets} />
          </div>
        )}
      </div>
    </details>
  );
}
