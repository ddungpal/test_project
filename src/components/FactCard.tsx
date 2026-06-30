import type { FactView } from "@/lib/dashboard/researchView";
import { VERIFICATION_LABEL, SOURCE_TIER_LABEL, FRESHNESS_LABEL } from "@/lib/dashboard/labels";

// fact 표시(읽기) — 클레임 + 무결성 뱃지 + 인용 + 출처. 순수(서버·클라 공용).
//   control 슬롯: 트리아지 승인/반려 토글 등(ResearchReview에서 주입).

// 출처 URL은 검색결과/LLM 유래(비신뢰) — http/https만 링크로 허용(javascript: 등 스킴 XSS 차단).
//   ScriptReview 인라인 칩도 같은 가드를 재사용 — export(중복 로직 금지).
export function safeHref(u: string | null): string | null {
  if (!u) return null;
  try {
    const p = new URL(u).protocol;
    return p === "http:" || p === "https:" ? u : null;
  } catch {
    return null;
  }
}

function Badge({ children, on = false }: { children: React.ReactNode; on?: boolean }) {
  return (
    <span
      className={`border px-1.5 py-0.5 text-[10px] font-bold ${on ? "border-trus-yellow text-trus-yellow" : "border-trus-white/20 text-trus-white/45"}`}
    >
      {children}
    </span>
  );
}

export function FactCard({ fact, control }: { fact: FactView; control?: React.ReactNode }) {
  const f = fact;
  return (
    <div className="border border-trus-white/15 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-trus-white">{f.claim}</p>
        {control}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Badge on={f.verificationStatus === "verified"}>{VERIFICATION_LABEL[f.verificationStatus]}</Badge>
        {f.isFinancial && <Badge on>금융</Badge>}
        {f.sourceTier && <Badge on={f.sourceTier === "primary"}>{SOURCE_TIER_LABEL[f.sourceTier]}</Badge>}
        {f.freshness && f.freshness !== "fresh" && <Badge on={f.freshness === "stale"}>{FRESHNESS_LABEL[f.freshness]}</Badge>}
        <Badge on={f.independentOriginCount >= 2}>독립출처 {f.independentOriginCount}</Badge>
        <Badge on={f.citationVerified}>인용 {f.citationVerified ? "확인" : "미확인"}</Badge>
        {f.escalatedToHuman && <Badge on>검수대상</Badge>}
        {f.humanApproved === true && <Badge on>승인됨</Badge>}
        {f.humanApproved === false && <Badge>반려됨</Badge>}
      </div>

      {f.quoteExcerpt && (
        <p className="mt-2 border-l-2 border-trus-white/20 pl-2 text-xs italic text-trus-white/55">“{f.quoteExcerpt}”</p>
      )}
      {f.misleadingCheck && <p className="mt-1 text-xs text-trus-white/40">오용검증: {f.misleadingCheck}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 text-[10px] text-trus-white/35">
        {f.primarySourceUrl &&
          (safeHref(f.primarySourceUrl) ? (
            <a
              href={safeHref(f.primarySourceUrl)!}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate underline hover:text-trus-yellow"
            >
              {f.primarySourceUrl}
            </a>
          ) : (
            <span className="truncate text-trus-white/30">{f.primarySourceUrl}</span>
          ))}
        {f.asOfDate && <span>기준 {f.asOfDate}</span>}
        {f.dataReferencePeriod && <span>대상기간 {f.dataReferencePeriod}</span>}
      </div>
    </div>
  );
}
