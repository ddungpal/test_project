import type { CostView } from "@/lib/dashboard/scriptView";
import { COST_CATEGORY_LABEL } from "@/lib/dashboard/labels";

// 편당 비용 뷰 — 총액 + 카테고리별 + 엔트리. 비용 2단캡($7/$10) 맥락 표시.
function catLabel(c: string): string {
  return COST_CATEGORY_LABEL[c] ?? c;
}

export function CostPanel({ cost }: { cost: CostView }) {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-black text-trus-yellow">${cost.total.toFixed(2)}</span>
        <span className="text-xs text-trus-white/40">SOFT $7 · HARD $10</span>
      </div>

      {cost.byCategory.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {cost.byCategory.map((c) => (
            <span key={c.category} className="border border-trus-white/15 px-2 py-1 text-xs text-trus-white/60">
              {catLabel(c.category)} <b className="text-trus-white">${c.cost.toFixed(2)}</b>
            </span>
          ))}
        </div>
      )}

      {cost.entries.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {cost.entries.map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-xs text-trus-white/45">
              <span className="min-w-0 truncate">
                <span className="text-trus-white/70">{catLabel(e.category)}</span>
                {e.detail && ` · ${e.detail}`}
                {e.tokens != null && ` · ${e.tokens} tok`}
                {e.latencyMs != null && ` · ${e.latencyMs}ms`}
              </span>
              <span className="shrink-0">${e.costUsd.toFixed(4)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
