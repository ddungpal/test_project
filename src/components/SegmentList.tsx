import type { SegmentView } from "@/lib/dashboard/scriptView";

// 대본 세그먼트 + lineage(이 단락이 어떤 fact/asset에 근거하는지). 순수 표시.
export function SegmentList({ segments }: { segments: SegmentView[] }) {
  return (
    <div className="flex flex-col gap-3">
      {segments.map((s) => (
        <div key={s.id} className="border border-trus-white/15 p-4">
          <div className="flex items-start gap-3">
            <span className="text-trus-yellow shrink-0 text-sm font-black">{s.ord + 1}</span>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-trus-white">{s.text}</p>
          </div>
          {(s.facts.length > 0 || s.assets.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1 border-t border-trus-white/10 pt-2">
              {s.facts.map((f) => (
                <span key={f.id} title={f.claim} className="max-w-[16rem] truncate border border-trus-white/20 px-1.5 py-0.5 text-[10px] text-trus-white/50">
                  fact: {f.claim}
                </span>
              ))}
              {s.assets.map((a) => (
                <span key={a.id} className="border border-trus-yellow/40 px-1.5 py-0.5 text-[10px] text-trus-yellow/80">
                  {a.kind === "number" ? "숫자" : "비유"}: {a.concept}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
