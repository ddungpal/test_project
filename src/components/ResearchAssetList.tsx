import type { AssetView } from "@/lib/dashboard/researchView";
import { ComparisonAssetTable } from "./ComparisonAssetTable";
import { CaseAssetView } from "./CaseAssetView";

// 쉬운 설명 자산 full 렌더 — comparison=표 / case=분기목록 / number·analogy=인라인.
//   ResearchPanel(리서치 상태)·UnusedResearch(안 쓰인 리서치 하단 토글) 공유(중복 제거).
//   래퍼 포함 통째로 렌더 — 기존 page.tsx ResearchPanel 자산 블록과 바이트 동일.
export function ResearchAssetList({ assets }: { assets: AssetView[] }) {
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {assets.map((a) =>
        // comparison 자산(정규화 성공)은 표로 렌더 — 미검증 칸은 ComparisonAssetTable이 '확인 필요'로 강조.
        //   정규화 실패(comparison=null)면 빈 표 박제 방지를 위해 이 자산은 표시 제외(드랍).
        a.kind === "comparison" ? (
          a.comparison && (
            <div key={a.id} className="border border-trus-white/15 px-3 py-2 text-xs">
              <span className="text-trus-yellow font-bold">비교</span>
              <span className="text-trus-white/50"> · {a.concept}</span>
              <div className="mt-2">
                <ComparisonAssetTable payload={a.comparison} />
              </div>
            </div>
          )
        ) : a.kind === "case" ? (
          // case 자산(정규화 성공·분기≥2)은 '조건 → 결과' 분기 목록 — 미검증 분기는 CaseAssetView가 '확인 필요'로 강조.
          //   정규화 실패(caseAsset=null)면 표시 제외(드랍).
          a.caseAsset && (
            <div key={a.id} className="border border-trus-white/15 px-3 py-2 text-xs">
              <span className="text-trus-yellow font-bold">분기</span>
              <span className="text-trus-white/50"> · {a.concept}</span>
              <div className="mt-2">
                <CaseAssetView payload={a.caseAsset} />
              </div>
            </div>
          )
        ) : (
          // number/analogy — 기존 마크업 그대로(회귀 0).
          <div key={a.id} className="border border-trus-white/15 px-3 py-2 text-xs">
            <span className="text-trus-yellow font-bold">{a.kind === "number" ? "숫자" : "비유"}</span>
            <span className="text-trus-white/50"> · {a.concept}</span>
            <div className="mt-1 text-trus-white/70">{a.numericExample || a.analogy}</div>
          </div>
        ),
      )}
    </div>
  );
}
