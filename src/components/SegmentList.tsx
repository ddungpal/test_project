import type { SegmentView } from "@/lib/dashboard/scriptView";
import type { TablePayload, CasePayload, VisualPayload, VisualCueType } from "@/pipeline/segmentBlock";

// 대본 세그먼트 + lineage(이 단락이 어떤 fact/asset에 근거하는지). 순수 표시.
//   kind별 분기 렌더(prose/table/case/visual). prose는 기존 마크업 불변(회귀 0 — 실 런은 전부 prose).
//   payload가 null인데 kind!=prose면 방어적으로 prose 폴백(빈 화면 금지).
//   lineage 칩 푸터는 모든 kind 공통(prose 전용 아님).
export function SegmentList({ segments }: { segments: SegmentView[] }) {
  return (
    <div className="flex flex-col gap-3">
      {segments.map((s) => (
        <div key={s.id} className="border border-trus-white/15 p-4">
          <div className="flex items-start gap-3">
            <span className="text-trus-yellow shrink-0 text-sm font-black">{s.ord + 1}</span>
            <SegmentBody segment={s} />
          </div>
          <LineageFooter facts={s.facts} assets={s.assets} />
        </div>
      ))}
    </div>
  );
}

// kind 스위치 — payload가 비면(null) 어떤 kind든 prose 폴백.
//   ScriptReview(인라인 최종검수)가 본문 마크업 중복 없이 재사용 — export.
export function SegmentBody({ segment }: { segment: SegmentView }) {
  const { kind, payload, text } = segment;
  if (payload !== null) {
    switch (kind) {
      case "table":
        return <TableBlock text={text} payload={payload as TablePayload} />;
      case "case":
        return <CaseBlock text={text} payload={payload as CasePayload} />;
      case "visual":
        return <VisualBlock text={text} payload={payload as VisualPayload} />;
    }
  }
  // prose(또는 payload 없는 폴백) — 기존 마크업 그대로 유지.
  return <Prose text={text} />;
}

// prose 본문 — 기존 마크업(글자 하나 안 바꿈).
function Prose({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-trus-white">{text}</p>;
}

// table: columns=헤더(trus-yellow 강조), rows=본문. 보더 trus-white/15. caption 있으면 캡션.
function TableBlock({ text, payload }: { text: string; payload: TablePayload }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {text.trim().length > 0 && <Prose text={text} />}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {payload.columns.map((c, i) => (
                <th
                  key={i}
                  scope="col"
                  className="border border-trus-white/15 px-2 py-1 text-left font-black text-trus-yellow"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payload.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-trus-white/15 px-2 py-1 align-top text-trus-white">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {payload.caption && (
            <caption className="caption-bottom pt-2 text-left text-[11px] text-trus-white/50">
              {payload.caption}
            </caption>
          )}
        </table>
      </div>
    </div>
  );
}

// case: intro(있으면) + 각 branch를 "조건 → 결과" 분기 목록. 조건=trus-yellow, 결과=trus-white.
function CaseBlock({ text, payload }: { text: string; payload: CasePayload }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {text.trim().length > 0 && <Prose text={text} />}
      {payload.intro && <p className="text-sm leading-relaxed text-trus-white/80">{payload.intro}</p>}
      <ul className="flex flex-col gap-1.5">
        {payload.branches.map((b, i) => (
          <li key={i} className="flex items-start gap-2 border-l-2 border-trus-yellow/40 pl-2 text-sm leading-relaxed">
            <span className="font-bold text-trus-yellow">{b.condition}</span>
            <span aria-hidden className="shrink-0 text-trus-white/40">→</span>
            <span className="text-trus-white">{b.outcome}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// cueType → 배지 라벨. 레거시(cueType 없음)는 '화면' 폴백(하위호환). 색은 한 톤 trus-yellow, 구분은 라벨 텍스트로만.
const VISUAL_CUE_LABELS: Record<VisualCueType, string> = {
  subtitle: "자막",
  capture: "화면",
  chart: "그래프",
  table: "표",
};

// visual: 직설 텍스트 배지(trus-yellow 보더) + cue + note(있으면 보조). 이모지 톤 금지.
function VisualBlock({ text, payload }: { text: string; payload: VisualPayload }) {
  const label = payload.cueType ? VISUAL_CUE_LABELS[payload.cueType] : "화면";
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {text.trim().length > 0 && <Prose text={text} />}
      <div className="flex items-start gap-2">
        <span className="shrink-0 border border-trus-yellow px-1.5 py-0.5 text-[10px] font-black tracking-widest text-trus-yellow uppercase">
          {label}
        </span>
        <p className="text-sm leading-relaxed text-trus-white">{payload.cue}</p>
      </div>
      {payload.note && <p className="text-xs leading-relaxed text-trus-white/50">{payload.note}</p>}
    </div>
  );
}

// lineage 칩 푸터 — 모든 kind 공통. fact="근거" 라벨, asset="숫자"/"비유" 구분.
function LineageFooter({
  facts,
  assets,
}: {
  facts: SegmentView["facts"];
  assets: SegmentView["assets"];
}) {
  if (facts.length === 0 && assets.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1 border-t border-trus-white/10 pt-2">
      {facts.map((f) => (
        <span
          key={f.id}
          title={f.claim}
          className="flex max-w-[16rem] items-baseline gap-1 truncate border border-trus-white/20 px-1.5 py-0.5 text-[10px] text-trus-white/50"
        >
          <span className="shrink-0 font-bold tracking-wider text-trus-white/40 uppercase">근거</span>
          <span className="truncate">{f.claim}</span>
        </span>
      ))}
      {assets.map((a) => (
        <span key={a.id} className="border border-trus-yellow/40 px-1.5 py-0.5 text-[10px] text-trus-yellow/80">
          {a.kind === "number" ? "숫자" : "비유"}: {a.concept}
        </span>
      ))}
    </div>
  );
}
