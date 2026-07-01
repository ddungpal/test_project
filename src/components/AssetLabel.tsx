// 쉬운 설명 자산 라벨 — kind 배지 + concept 한 줄. 참조(라벨)만 렌더.
//   payload·표 내용·수치 full은 절대 렌더 안 함(토글 경량 유지 — full은 본문 블록/하단 전체 리서치에서).
//   SegmentView.assets 원소({id,concept,kind}) 소비. TRUS 3색·이모지 없음(LineageFooter asset 톤 계승).
const ASSET_KIND_LABELS: Record<"number" | "analogy" | "comparison" | "case", string> = {
  number: "숫자",
  analogy: "비유",
  comparison: "비교표",
  case: "케이스",
};

export function AssetLabel({
  asset,
}: {
  asset: { id: string; concept: string; kind: "number" | "analogy" | "comparison" | "case" };
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-1.5 text-[11px] text-trus-yellow/80">
      <span className="shrink-0 border border-trus-yellow/40 px-1 py-0.5 text-[10px] font-bold tracking-wider text-trus-yellow uppercase">
        {ASSET_KIND_LABELS[asset.kind]}
      </span>
      <span className="min-w-0 text-trus-white/70">{asset.concept}</span>
    </div>
  );
}
