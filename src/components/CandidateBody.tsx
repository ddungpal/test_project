import {
  type ProposalStage,
  type TopicPayload,
  type TitlePayload,
  type StructurePayload,
  AUDIENCE_LEVEL_LABEL,
} from "@/lib/dashboard/proposalTypes";
import { ThumbnailCanvas } from "./ThumbnailCanvas";
import { REFERENCE_SIMILARITY_FLAG } from "@/agents/hook_maker/referenceGuard";

// 후보/선택 payload 표시(읽기) — 순수 컴포넌트(서버=요약, 클라=선택기 공용).
//   payload는 jsonb→unknown(LLM 산출·사람 수정) — 형태 보장 없음. 방어적으로 가드(누락 시 폴백, 크래시 금지).
export function CandidateBody({ stage, payload }: { stage: ProposalStage; payload: unknown }) {
  if (stage === "topic") {
    const p = (payload ?? {}) as Partial<TopicPayload>;
    const levelLabel = p.audience_level ? AUDIENCE_LEVEL_LABEL[p.audience_level] : null;
    return (
      <div>
        <div className="flex items-start gap-2">
          {levelLabel && (
            <span className="mt-0.5 shrink-0 border border-trus-yellow/60 px-1.5 py-0.5 text-[10px] font-bold text-trus-yellow">{levelLabel}</span>
          )}
          <span className="text-sm font-bold text-trus-white">{p.title || "—"}</span>
        </div>
        {p.audience_need && <p className="mt-1 text-xs text-trus-white/50">🎯 {p.audience_need}</p>}
      </div>
    );
  }
  if (stage === "title_thumb") {
    const p = (payload ?? {}) as Partial<TitlePayload>;
    // 레퍼런스 유사도 임계 이상이면 '거의 베낌' 의심 → 경고 칩. 임계값은 referenceGuard에서 단일 출처.
    const refFlagged = p.ref_similarity != null && p.ref_similarity >= REFERENCE_SIMILARITY_FLAG;
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="sm:w-56 sm:shrink-0">
          <ThumbnailCanvas
            main={p.thumbnail_main}
            boxes={p.thumbnail_boxes}
            copy={p.thumbnail_copy}
            layout={p.thumbnail_layout}
          />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-trus-white">{p.title || "—"}</div>
          {refFlagged && (
            <span className="mt-1 inline-block border border-trus-yellow px-1.5 py-0.5 text-[10px] font-bold text-trus-yellow">
              ⚠ 레퍼런스와 유사
            </span>
          )}
        </div>
      </div>
    );
  }
  const p = (payload ?? {}) as Partial<StructurePayload>;
  const outline = Array.isArray(p.outline) ? p.outline : [];
  return (
    <div>
      <div className="text-sm font-bold text-trus-white">{p.approach || "—"}</div>
      {outline.length === 0 ? (
        <p className="mt-2 text-xs text-trus-white/30">구성 내용 없음.</p>
      ) : (
        <ol className="mt-2 flex flex-col gap-1.5">
          {outline.map((s, i) => (
            <li key={i} className="text-xs text-trus-white/70">
              <span className="text-trus-yellow font-bold">
                {i + 1}. {s?.section ?? ""}
              </span>
              <span className="text-trus-white/50"> — {s?.goal ?? ""}</span>
              <div className="text-trus-white/35">↳ {s?.why ?? ""}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
