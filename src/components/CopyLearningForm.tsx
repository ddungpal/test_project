"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCopyAbResults, requestCopyRelearn, activateCopyStyle } from "@/app/actions/copyLearn";
import type { CopyAbInput } from "@/app/actions/copyLearnMap";
import type { AbVariantKey } from "@/performance/types";
import type { CopyLearnVideo, CopyStyleDraft, CopyStyleComponentType } from "@/lib/dashboard/copyLearnView";

// 카피 학습 입력 화면(copy-learning-admin step2) — owner가 영상별 썸네일·제목 A/B + CTR(24h)를 입력→저장,
//   재학습 트리거, 최근 draft 검수, component별 활성화. 백엔드(saveCopyAbResults/requestCopyRelearn/
//   activateCopyStyle)는 step0/step2(Max)에서 옴 — 시그니처에 폼을 맞춘다(추측 금지).
//   TRUS Create: 검정/노랑/흰 3색·직각(rounded 없음)·그림자/그라데이션 없음. InsightCard useTransition 패턴 미러.

const VARIANTS: AbVariantKey[] = ["A", "B", "C"];

// ── 폼 로컬 상태 모델(영상 1개분). 입력칸은 문자열로 들고, 저장 시 CopyAbInput으로 변환. ──
interface ThumbDraft {
  copyMain: [string, string]; // 메인문구 2칸
  copyBoxes: [string, string]; // 박스문구 2칸
  watchShare: string; // 점유율(%) — 문자열 입력
}
interface TitleVariantDraft {
  text: string;
  watchShare: string;
}
interface VideoFormState {
  ctr24h: string;
  thumb: Record<AbVariantKey, ThumbDraft>;
  titleHasAbTest: boolean;
  titleVariants: Record<AbVariantKey, TitleVariantDraft>;
  titleSingle: string; // hasAbTest=false일 때 최종 제목 1개
}

function emptyThumb(): ThumbDraft {
  return { copyMain: ["", ""], copyBoxes: ["", ""], watchShare: "" };
}

/** 서버에서 받은 기존 입력(CopyLearnVideo)으로 폼 초기값 프리필. 없는 값은 빈칸. */
function initialState(v: CopyLearnVideo): VideoFormState {
  const thumb: Record<AbVariantKey, ThumbDraft> = {
    A: emptyThumb(),
    B: emptyThumb(),
    C: emptyThumb(),
  };
  for (const tv of v.thumbnail) {
    if (!VARIANTS.includes(tv.variant)) continue;
    // payloadToText는 copy_main + copy_boxes를 평탄화해 text[]로 줌. 앞 2개를 메인, 다음 2개를 박스로 복원(근사).
    const t = thumb[tv.variant];
    t.copyMain = [tv.text[0] ?? "", tv.text[1] ?? ""];
    t.copyBoxes = [tv.text[2] ?? "", tv.text[3] ?? ""];
    t.watchShare = tv.watchShare != null ? String(tv.watchShare) : "";
  }

  const titleVariants: Record<AbVariantKey, TitleVariantDraft> = {
    A: { text: "", watchShare: "" },
    B: { text: "", watchShare: "" },
    C: { text: "", watchShare: "" },
  };
  for (const tv of v.titleVariants) {
    if (!VARIANTS.includes(tv.variant)) continue;
    titleVariants[tv.variant] = {
      text: tv.text[0] ?? "",
      watchShare: tv.watchShare != null ? String(tv.watchShare) : "",
    };
  }
  const titleSingle = v.titleVariants.find((t) => t.variant === "A")?.text[0] ?? "";

  return {
    ctr24h: v.ctr24h != null ? String(v.ctr24h) : "",
    thumb,
    titleHasAbTest: v.titleHasAbTest,
    titleVariants,
    titleSingle,
  };
}

/** "12.5" → 12.5, 빈칸/비수치 → null. */
function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 폼 상태 → CopyAbInput(서버액션 시그니처). 빈 변형은 보내지 않는다(빈 행 누출 차단). */
function toInput(contentId: string, s: VideoFormState): CopyAbInput {
  const thumbnail: CopyAbInput["thumbnail"] = [];
  for (const variant of VARIANTS) {
    const t = s.thumb[variant];
    const copyMain = t.copyMain.map((x) => x.trim()).filter(Boolean);
    const copyBoxes = t.copyBoxes.map((x) => x.trim()).filter(Boolean);
    const watchShare = numOrNull(t.watchShare);
    // 아무 값도 없는 변형은 스킵(없는 변형까지 행 만들지 않음).
    if (copyMain.length === 0 && copyBoxes.length === 0 && watchShare === null) continue;
    thumbnail.push({ variant, copyMain, copyBoxes, watchShare });
  }

  let titleBlock: CopyAbInput["title"];
  if (s.titleHasAbTest) {
    const variants = VARIANTS.map((variant) => ({
      variant,
      text: s.titleVariants[variant].text.trim(),
      watchShare: numOrNull(s.titleVariants[variant].watchShare),
    })).filter((v) => v.text.length > 0);
    titleBlock = { hasAbTest: true, variants };
  } else {
    titleBlock = {
      hasAbTest: false,
      variants: [{ variant: "A", text: s.titleSingle.trim(), watchShare: null }],
    };
  }

  return { contentId, ctr24h: numOrNull(s.ctr24h), thumbnail, title: titleBlock };
}

// ── 공통 인풋 스타일(TRUS: 직각·투명배경·흰 테두리, 포커스 시 노랑 링) ──
const INPUT_CLS =
  "w-full border border-trus-white/25 bg-transparent px-2 py-1 text-sm text-trus-white placeholder:text-trus-white/30 focus:border-trus-yellow focus:outline-none focus:ring-1 focus:ring-trus-yellow";

function fmtDate(s: string | null): string {
  return s ? s.slice(0, 10) : "—";
}

// ── 영상 1개 카드 ──
function VideoCard({ video }: { video: CopyLearnVideo }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<VideoFormState>(() => initialState(video));
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function patchThumb(variant: AbVariantKey, patch: Partial<ThumbDraft>) {
    setState((s) => ({ ...s, thumb: { ...s.thumb, [variant]: { ...s.thumb[variant], ...patch } } }));
  }
  function patchTitleVariant(variant: AbVariantKey, patch: Partial<TitleVariantDraft>) {
    setState((s) => ({
      ...s,
      titleVariants: { ...s.titleVariants, [variant]: { ...s.titleVariants[variant], ...patch } },
    }));
  }

  // winner는 입력이 아니라 점유율(%)에서 파생(서버도 judgeComponent로 점유율 기준 재계산). 최고 점유율 변형만 강조.
  const thumbWinner = useMemo<AbVariantKey | null>(() => {
    let best: AbVariantKey | null = null;
    let bestShare = -Infinity;
    for (const variant of VARIANTS) {
      const sh = numOrNull(state.thumb[variant].watchShare);
      if (sh != null && sh > bestShare) {
        bestShare = sh;
        best = variant;
      }
    }
    return best;
  }, [state.thumb]);

  function onSave() {
    setError(null);
    setOk(null);
    startTransition(async () => {
      try {
        const res = await saveCopyAbResults(toInput(video.id, state));
        setOk(`저장 완료 — 썸네일 ${res.savedThumbnail}건 · 제목 ${res.savedTitle}건${res.decided ? " · 판정됨" : ""}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  return (
    <li className="border border-trus-white/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:border-trus-yellow/40"
      >
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnailUrl}
            alt=""
            width={96}
            height={54}
            className="h-[54px] w-24 shrink-0 border border-trus-white/15 object-cover"
          />
        ) : (
          <div className="flex h-[54px] w-24 shrink-0 items-center justify-center border border-dashed border-trus-white/20 text-[10px] text-trus-white/30">
            썸네일 없음
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-trus-white">{video.title ?? "(제목 없음)"}</p>
          <p className="mt-0.5 text-xs text-trus-white/45">
            업로드 {fmtDate(video.uploadDate)}
            {video.ctr24h != null && <span className="ml-2 text-trus-yellow/70">CTR {video.ctr24h}%</span>}
          </p>
        </div>
        <span className="shrink-0 text-xs font-bold text-trus-white/50">{open ? "접기 −" : "펼치기 +"}</span>
      </button>

      {open && (
        <div className="border-t border-trus-white/15 px-4 py-4">
          {/* 영상 CTR(24h) */}
          <label className="block">
            <span className="text-xs font-bold tracking-widest text-trus-yellow uppercase">영상 CTR (24h, %)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={state.ctr24h}
              onChange={(e) => setState((s) => ({ ...s, ctr24h: e.target.value }))}
              placeholder="예: 6.4"
              className={`mt-1 max-w-[10rem] ${INPUT_CLS}`}
            />
          </label>

          {/* 썸네일 섹션 */}
          <fieldset className="mt-6 border border-trus-white/15 p-3">
            <legend className="px-1 text-xs font-bold tracking-widest text-trus-yellow uppercase">썸네일 변형</legend>
            <div className="flex flex-col gap-4">
              {VARIANTS.map((variant) => {
                const t = state.thumb[variant];
                const isWinner = thumbWinner === variant;
                return (
                  <div key={variant} className={`border p-3 ${isWinner ? "border-trus-yellow" : "border-trus-white/15"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-trus-white">변형 {variant}</span>
                      {isWinner && (
                        <span className="text-xs font-bold text-trus-yellow" title="점유율이 가장 높아 자동 winner">
                          ★ 최고 점유율
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {[0, 1].map((i) => (
                        <input
                          key={`main-${i}`}
                          value={t.copyMain[i]}
                          onChange={(e) =>
                            patchThumb(variant, {
                              copyMain: [i === 0 ? e.target.value : t.copyMain[0], i === 1 ? e.target.value : t.copyMain[1]],
                            })
                          }
                          placeholder={`메인문구 ${i + 1}`}
                          aria-label={`변형 ${variant} 메인문구 ${i + 1}`}
                          className={INPUT_CLS}
                        />
                      ))}
                      {[0, 1].map((i) => (
                        <input
                          key={`box-${i}`}
                          value={t.copyBoxes[i]}
                          onChange={(e) =>
                            patchThumb(variant, {
                              copyBoxes: [i === 0 ? e.target.value : t.copyBoxes[0], i === 1 ? e.target.value : t.copyBoxes[1]],
                            })
                          }
                          placeholder={`박스문구 ${i + 1}`}
                          aria-label={`변형 ${variant} 박스문구 ${i + 1}`}
                          className={INPUT_CLS}
                        />
                      ))}
                    </div>
                    <label className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-trus-white/55">점유율(%)</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={t.watchShare}
                        onChange={(e) => patchThumb(variant, { watchShare: e.target.value })}
                        placeholder="예: 52"
                        aria-label={`변형 ${variant} 점유율`}
                        className={`max-w-[8rem] ${INPUT_CLS}`}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>

          {/* 제목 섹션 */}
          <fieldset className="mt-6 border border-trus-white/15 p-3">
            <legend className="px-1 text-xs font-bold tracking-widest text-trus-yellow uppercase">제목</legend>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={state.titleHasAbTest}
                onChange={(e) => setState((s) => ({ ...s, titleHasAbTest: e.target.checked }))}
                className="accent-trus-yellow"
              />
              <span className="text-sm text-trus-white">제목 A/B/C 테스트 있음</span>
            </label>

            {state.titleHasAbTest ? (
              <div className="mt-3 flex flex-col gap-2">
                {VARIANTS.map((variant) => {
                  const tv = state.titleVariants[variant];
                  return (
                    <div key={variant} className="flex flex-col gap-2 border border-trus-white/15 p-2 sm:flex-row sm:items-center">
                      <span className="text-sm font-black text-trus-white sm:w-16">{variant}</span>
                      <input
                        value={tv.text}
                        onChange={(e) => patchTitleVariant(variant, { text: e.target.value })}
                        placeholder={`제목 ${variant}`}
                        aria-label={`제목 변형 ${variant}`}
                        className={INPUT_CLS}
                      />
                      <label className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-trus-white/55">점유율(%)</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          value={tv.watchShare}
                          onChange={(e) => patchTitleVariant(variant, { watchShare: e.target.value })}
                          placeholder="예: 50"
                          aria-label={`제목 변형 ${variant} 점유율`}
                          className={`max-w-[8rem] ${INPUT_CLS}`}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            ) : (
              <label className="mt-3 block">
                <span className="text-xs text-trus-white/55">최종 제목</span>
                <input
                  value={state.titleSingle}
                  onChange={(e) => setState((s) => ({ ...s, titleSingle: e.target.value }))}
                  placeholder="발행 제목 (CTR로 학습)"
                  aria-label="최종 제목"
                  className={`mt-1 ${INPUT_CLS}`}
                />
              </label>
            )}
          </fieldset>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={pending}
              className="bg-trus-yellow px-4 py-1.5 text-sm font-black text-trus-black disabled:opacity-50"
            >
              {pending ? "저장 중…" : "이 영상 저장"}
            </button>
            {ok && <span className="text-xs text-trus-yellow">✓ {ok}</span>}
            {error && <span className="text-xs text-trus-yellow">⚠ {error}</span>}
          </div>
        </div>
      )}
    </li>
  );
}

// ── 상단/하단 공통 영역: 재학습 + 최근 draft + 활성화 ──
const COMPONENT_LABEL: Record<CopyStyleComponentType, string> = {
  thumbnail_copy: "썸네일 카피",
  title: "제목",
};
const STATUS_LABEL: Record<CopyStyleDraft["status"], string> = {
  draft: "초안",
  active: "활성",
  retired: "내림",
};

function StylePanel({ drafts }: { drafts: CopyStyleDraft[] }) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const byComponent = useMemo(() => {
    const m: Record<CopyStyleComponentType, CopyStyleDraft[]> = { thumbnail_copy: [], title: [] };
    for (const d of drafts) m[d.componentType].push(d);
    return m;
  }, [drafts]);

  function run(fn: () => Promise<string>) {
    setError(null);
    setOk(null);
    startTransition(async () => {
      try {
        const msg = await fn();
        setOk(msg);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  return (
    <section className="border border-trus-white/20 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs font-bold tracking-widest text-trus-yellow uppercase">스타일 학습</h2>
        <button
          type="button"
          onClick={() => run(async () => {
            const r = await requestCopyRelearn();
            return r.initiated ? "재학습 요청됨 — draft 생성까지 잠시 기다린 뒤 새로고침" : "요청 보류";
          })}
          disabled={pending}
          className="bg-trus-yellow px-4 py-1.5 text-sm font-black text-trus-black disabled:opacity-50"
        >
          {pending ? "처리 중…" : "재학습 실행"}
        </button>
      </div>
      <p className="mt-2 text-xs text-trus-white/50">
        입력을 저장한 뒤 재학습하면 새 <b className="text-trus-white/80">초안(draft)</b>이 생긴다. 검토 후 직접 활성화한다(자동 활성화 없음).
      </p>

      {/* 최근 draft 보기 — component별 */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(Object.keys(byComponent) as CopyStyleComponentType[]).map((ct) => {
          const list = byComponent[ct];
          const activateArg = ct === "thumbnail_copy" ? "thumbnail" : "title";
          return (
            <div key={ct} className="border border-trus-white/15 p-3">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-black text-trus-white">{COMPONENT_LABEL[ct]}</h3>
                <button
                  type="button"
                  onClick={() => run(async () => {
                    const r = await activateCopyStyle(activateArg);
                    return r.activated > 0 ? `${COMPONENT_LABEL[ct]} 최신 초안을 활성화했어` : `${COMPONENT_LABEL[ct]} — 이미 활성(변경 없음)`;
                  })}
                  disabled={pending || list.length === 0}
                  className="border border-trus-yellow px-3 py-1 text-xs font-bold text-trus-yellow hover:bg-trus-yellow hover:text-trus-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  최신 초안 활성화
                </button>
              </div>
              {list.length === 0 ? (
                <p className="mt-3 border border-dashed border-trus-white/15 px-3 py-4 text-center text-xs text-trus-white/35">
                  아직 초안 없음 — 재학습을 실행하세요
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {list.map((d) => (
                    <li key={d.id} className="border border-trus-white/15 px-3 py-2">
                      <div className="flex items-center gap-2 text-xs text-trus-white/55">
                        <span className="font-bold text-trus-white">v{d.version ?? "—"}</span>
                        <span
                          className={
                            d.status === "active"
                              ? "border border-trus-yellow px-1.5 py-0.5 font-bold text-trus-yellow"
                              : "border border-trus-white/25 px-1.5 py-0.5 text-trus-white/55"
                          }
                        >
                          {STATUS_LABEL[d.status]}
                        </span>
                        <span className="ml-auto">{fmtDate(d.createdAt)}</span>
                      </div>
                      {d.patternKeys.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {d.patternKeys.map((k) => (
                            <span key={k} className="border border-trus-white/20 px-1.5 py-0.5 text-[11px] text-trus-white/70">
                              {k}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-[11px] text-trus-white/35">패턴 키 없음</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {(ok || error) && (
        <p className={`mt-3 text-xs ${error ? "text-trus-yellow" : "text-trus-yellow"}`}>
          {error ? `⚠ ${error}` : `✓ ${ok}`}
        </p>
      )}
    </section>
  );
}

export function CopyLearningForm({ videos, drafts }: { videos: CopyLearnVideo[]; drafts: CopyStyleDraft[] }) {
  return (
    <div className="mt-8 flex flex-col gap-8">
      <StylePanel drafts={drafts} />

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold tracking-widest text-trus-yellow uppercase">영상별 입력</h2>
          <span className="text-xs text-trus-white/40">{videos.length}편</span>
        </div>
        {videos.length === 0 ? (
          <p className="mt-3 border border-dashed border-trus-white/20 px-4 py-8 text-center text-sm text-trus-white/40">
            입력할 영상이 없습니다. 콘텐츠가 적재되면 여기에 영상별 카피·CTR 입력 칸이 나타납니다.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
