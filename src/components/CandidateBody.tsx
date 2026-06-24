import {
  type ProposalStage,
  type TopicPayload,
  type TitlePayload,
  type ThumbnailPayload,
  type StructurePayload,
  AUDIENCE_LEVEL_LABEL,
} from "@/lib/dashboard/proposalTypes";
import { REFERENCE_SIMILARITY_FLAG } from "@/agents/hook_maker/referenceGuard";
import { STYLE_CONFORMANCE_BANNED_FLAG } from "@/agents/hook_maker/styleConformance";

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
    // title_thumb = 현재 '제목 전용'(썸네일은 분리된 thumbnail 단계가 담당). 제목 + ref/style 칩만 렌더.
    const p = (payload ?? {}) as Partial<TitlePayload>;
    // 레퍼런스 유사도 임계 이상이면 '거의 베낌' 의심 → 경고 칩. 임계값은 referenceGuard에서 단일 출처.
    const refFlagged = p.ref_similarity != null && p.ref_similarity >= REFERENCE_SIMILARITY_FLAG;

    // A/B 학습 스타일 부합도. payload는 unknown 기반 → ?.·??로 방어(훅이가 ref_similarity만 내면 자연히 없음).
    //   표시 전용 — banned여도 후보는 그대로 보이고 선택 가능(김짠부 '선택만' 철학).
    const bannedHits = p.style_conformance?.banned_hits ?? [];
    const winningScore = p.style_conformance?.winning_score ?? 0;
    const bannedFlagged = bannedHits.length >= STYLE_CONFORMANCE_BANNED_FLAG;
    const winningPct = Math.round(winningScore * 100);

    const title = (p.title ?? "").trim();
    const labelCls = "shrink-0 text-trus-white/50";
    return (
      <div className="flex flex-col gap-1">
        <div className="text-sm">
          <span className={labelCls}>제목: </span>
          <span className="font-bold text-trus-white">{title || "—"}</span>
          {refFlagged && (
            <span className="ml-1 inline-block border border-trus-yellow px-1.5 py-0.5 text-[10px] font-bold text-trus-yellow">
              ⚠ 레퍼런스와 유사
            </span>
          )}
          {bannedFlagged && (
            <span
              title={bannedHits[0]}
              className="ml-1 inline-block border border-trus-yellow px-1.5 py-0.5 text-[10px] font-bold text-trus-yellow"
            >
              ⚠ A/B 패배 패턴
            </span>
          )}
          {winningScore > 0 && <div className="mt-1 text-[10px] text-trus-white/45">A/B 부합 {winningPct}%</div>}
        </div>
      </div>
    );
  }
  if (stage === "thumbnail") {
    // 썸네일 단계 — 메인문구·박스2 + ref/style 칩(title_thumb 패턴 재사용·있을 때만). payload는 unknown → 전부 방어.
    const p = (payload ?? {}) as Partial<ThumbnailPayload> & {
      ref_similarity?: number;
      style_conformance?: { banned_hits?: string[]; winning_score?: number };
    };
    const mainText = (Array.isArray(p.thumbnail_main) ? p.thumbnail_main : [])
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean)
      .join(" / ");
    const box1 = (Array.isArray(p.thumbnail_boxes) ? p.thumbnail_boxes[0] : undefined)?.trim() ?? "";
    const box2 = (Array.isArray(p.thumbnail_boxes) ? p.thumbnail_boxes[1] : undefined)?.trim() ?? "";

    const refFlagged = p.ref_similarity != null && p.ref_similarity >= REFERENCE_SIMILARITY_FLAG;
    const bannedHits = p.style_conformance?.banned_hits ?? [];
    const winningScore = p.style_conformance?.winning_score ?? 0;
    const bannedFlagged = bannedHits.length >= STYLE_CONFORMANCE_BANNED_FLAG;
    const winningPct = Math.round(winningScore * 100);

    const labelCls = "shrink-0 text-trus-white/50";
    return (
      <div className="flex flex-col gap-1">
        <div className="text-xs">
          <span className={labelCls}>메인문구: </span>
          <span className="font-bold text-trus-white">{mainText || "—"}</span>
        </div>
        {box1 && (
          <div className="text-xs">
            <span className={labelCls}>박스문구1: </span>
            <span className="text-trus-white">{box1}</span>
          </div>
        )}
        {box2 && (
          <div className="text-xs">
            <span className={labelCls}>박스문구2: </span>
            <span className="text-trus-white">{box2}</span>
          </div>
        )}
        {(refFlagged || bannedFlagged || winningScore > 0) && (
          <div className="mt-1">
            {refFlagged && (
              <span className="mr-1 inline-block border border-trus-yellow px-1.5 py-0.5 text-[10px] font-bold text-trus-yellow">
                ⚠ 레퍼런스와 유사
              </span>
            )}
            {bannedFlagged && (
              <span
                title={bannedHits[0]}
                className="mr-1 inline-block border border-trus-yellow px-1.5 py-0.5 text-[10px] font-bold text-trus-yellow"
              >
                ⚠ A/B 패배 패턴
              </span>
            )}
            {winningScore > 0 && <span className="text-[10px] text-trus-white/45">A/B 부합 {winningPct}%</span>}
          </div>
        )}
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
