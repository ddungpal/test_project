import type { CaseAssetPayload } from "@/pipeline/caseAsset";

// 케이스(case) 자산 — 순수 표시(서버·클라 공용). 리서치 검수 화면에서 분기가가 만든 자산을 '조건 → 결과' 분기 목록으로.
//   TRUS 패턴(SegmentList CaseBlock 미러): 조건 trus-yellow, 화살표 aria-hidden, 보더 trus-white/15.
//   money-safety(핵심): grounded=false 분기는 흐리게(text-trus-white/40) + "확인 필요" 라벨(작게·trus-yellow).
//     검증된 분기는 일반 trus-white. 짠부님이 검수 때 위험 분기를 즉시 알아채게.
//   payload는 normalizeCaseAsset으로 이미 정규화됨(non-null 보장 — branches≥2).
export function CaseAssetView({ payload }: { payload: CaseAssetPayload }) {
  const { intro, branches } = payload;
  return (
    <div className="flex flex-col gap-1.5">
      {intro && <p className="text-trus-white/70">{intro}</p>}
      <ul className="flex flex-col gap-1">
        {branches.map((b, i) => (
          <li key={i} className="border border-trus-white/15 px-2 py-1">
            <span className="font-bold text-trus-yellow">{b.condition}</span>
            <span className="px-1.5 text-trus-white/40" aria-hidden="true">
              →
            </span>
            <span className={b.grounded ? "text-trus-white" : "text-trus-white/40"}>{b.outcome}</span>
            {!b.grounded && (
              <span className="ml-1 text-[10px] font-bold tracking-wide text-trus-yellow">확인 필요</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
