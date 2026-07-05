"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCopyAbResults, requestCopyRelearn, requestChannelTitleRelearn, requestAnalogyRelearn, activateCopyStyle, submitOwnerFeedback, createLearningVideo, updateContentTitle, updateContentUploadDate, deleteLearningVideo } from "@/app/actions/copyLearn";
import type { CopyAbInput, NewLearningVideoInput } from "@/app/actions/copyLearnMap";
import type { OwnerFeedbackCandidates } from "@/agents/owner_feedback/schema";
import type { AbVariantKey } from "@/performance/types";
import type { CopyLearnVideo, CopyStyleDraft, CopyStyleComponentType, CorrectionRow, StructureProfile, StructureProfiles, AnalogyDraft, OwnerRulesDraft } from "@/lib/dashboard/copyLearnView";
import { analogyDraftSummary } from "@/lib/learning/analogyDraftSummary";
import { ownerRulesDraftSummary } from "@/lib/learning/ownerRulesDraftSummary";
import { numOrNull, parseViews24h } from "@/components/copyViewsParse";

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
  views24h: string; // 24h 조회수(정수). 빈칸=null(vconf 무가중·하위호환).
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
    views24h: v.views24h != null ? String(v.views24h) : "",
    thumb,
    titleHasAbTest: v.titleHasAbTest,
    titleVariants,
    titleSingle,
  };
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

  // 빈칸/음수/비수치 → null(vconf 무가중·하위호환), "0" → 0.
  return { contentId, ctr24h: numOrNull(s.ctr24h), views24h: parseViews24h(s.views24h), thumbnail, title: titleBlock };
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

  // ── 영상 이름(contents.title) 편집 — 카피·CTR 저장(onSave)과 완전 분리된 별도 state/transition/메시지. ──
  //   "제목 카피(A/B)" 섹션과 다르다: 여기는 표시용 영상 이름 1개만 고친다(updateContentTitle).
  const [titleDraft, setTitleDraft] = useState(video.title ?? "");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [titleOk, setTitleOk] = useState<string | null>(null);
  const [titlePending, startTitleTransition] = useTransition();
  const titleTrimmed = titleDraft.trim();

  function onSaveName() {
    setTitleError(null);
    setTitleOk(null);
    startTitleTransition(async () => {
      try {
        await updateContentTitle(video.id, titleDraft);
        setTitleOk("영상 이름 저장 완료");
        router.refresh();
      } catch (e) {
        setTitleError(e instanceof Error ? e.message : "이름 저장 실패");
      }
    });
  }

  // ── 업로드일(contents.upload_date) 편집 — 이름·카피·삭제와 완전 분리된 별도 state/transition/메시지. ──
  //   <input type="date">는 YYYY-MM-DD 만 주므로 서버 isYmd 가드와 형식이 일치. 빈값이면 저장 버튼 disabled.
  const [dateDraft, setDateDraft] = useState(video.uploadDate?.slice(0, 10) ?? "");
  const [dateError, setDateError] = useState<string | null>(null);
  const [dateOk, setDateOk] = useState<string | null>(null);
  const [datePending, startDateTransition] = useTransition();

  function onSaveUploadDate() {
    setDateError(null);
    setDateOk(null);
    startDateTransition(async () => {
      try {
        await updateContentUploadDate(video.id, dateDraft);
        setDateOk("업로드일 저장 완료");
        router.refresh();
      } catch (e) {
        setDateError(e instanceof Error ? e.message : "업로드일 저장 실패");
      }
    });
  }

  // ── 영상 삭제 — 비가역·캐스케이드. confirm 통과 후에만 실행. 별도 state/transition(다른 동작과 무간섭). ──
  const [delError, setDelError] = useState<string | null>(null);
  const [delPending, startDelTransition] = useTransition();

  function onDelete() {
    const ok = window.confirm(
      "이 영상과 관련 데이터(썸네일·제목·성과·회고·런)가 모두 삭제됩니다. 되돌릴 수 없습니다.",
    );
    if (!ok) return;
    setDelError(null);
    startDelTransition(async () => {
      try {
        await deleteLearningVideo(video.id);
        router.refresh(); // 목록에서 사라짐
      } catch (e) {
        setDelError(e instanceof Error ? e.message : "삭제 실패");
      }
    });
  }

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
            {video.views24h != null && (
              <span className="ml-2 text-trus-yellow/70">24h 조회수 {video.views24h.toLocaleString()}</span>
            )}
          </p>
        </div>
        <span className="shrink-0 text-xs font-bold text-trus-white/50">{open ? "접기 −" : "펼치기 +"}</span>
      </button>

      {open && (
        <div className="border-t border-trus-white/15 px-4 py-4">
          {/* 영상 이름(contents.title) 편집 — 표시용 이름. "제목 카피(A/B)" 섹션과 다름. onSave와 분리된 별도 액션. */}
          <div className="mb-6">
            <label className="block">
              <span className="text-xs font-bold tracking-widest text-trus-yellow uppercase">영상 이름</span>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  placeholder="예: 30살에 1억 모은 현실 루틴"
                  aria-label="영상 이름"
                  className={INPUT_CLS}
                />
                <button
                  type="button"
                  onClick={onSaveName}
                  disabled={titlePending || titleTrimmed.length === 0}
                  className="shrink-0 bg-trus-yellow px-4 py-1.5 text-sm font-black text-trus-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {titlePending ? "저장 중…" : "이름 저장"}
                </button>
              </div>
            </label>
            {titleOk && <span className="mt-2 inline-block text-xs text-trus-yellow">✓ {titleOk}</span>}
            {titleError && <span className="mt-2 inline-block text-xs text-trus-yellow">⚠ {titleError}</span>}

            {/* 업로드일(contents.upload_date) 편집 — 이름 저장과 분리된 별도 액션. <input type=date>는 YYYY-MM-DD. */}
            <div className="mt-4">
              <label className="block">
                <span className="text-xs font-bold tracking-widest text-trus-yellow uppercase">업로드일</span>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="date"
                    value={dateDraft}
                    onChange={(e) => setDateDraft(e.target.value)}
                    aria-label="업로드일"
                    className={`max-w-[12rem] ${INPUT_CLS}`}
                  />
                  <button
                    type="button"
                    onClick={onSaveUploadDate}
                    disabled={datePending || dateDraft.trim().length === 0}
                    aria-label="업로드일 저장"
                    className="shrink-0 bg-trus-yellow px-4 py-1.5 text-sm font-black text-trus-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {datePending ? "저장 중…" : "업로드일 저장"}
                  </button>
                </div>
              </label>
              {dateOk && <span className="mt-2 inline-block text-xs text-trus-yellow">✓ {dateOk}</span>}
              {dateError && <span className="mt-2 inline-block text-xs text-trus-yellow">⚠ {dateError}</span>}
            </div>
          </div>

          {/* 영상 CTR(24h) + 24h 조회수 */}
          <div className="flex flex-wrap gap-4">
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
            <label className="block">
              <span className="text-xs font-bold tracking-widest text-trus-yellow uppercase">24h 조회수</span>
              <input
                type="number"
                inputMode="numeric"
                step="1"
                value={state.views24h}
                onChange={(e) => setState((s) => ({ ...s, views24h: e.target.value }))}
                placeholder="예: 52000"
                className={`mt-1 max-w-[10rem] ${INPUT_CLS}`}
              />
            </label>
          </div>

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

          {/* 위험 구역 — 비가역 삭제. TRUS 3색 안에서 채움 대신 흰 테두리만(덜 강조), confirm 통과 후에만 실행. */}
          <div className="mt-6 border-t border-trus-white/15 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onDelete}
                disabled={delPending}
                aria-label="이 영상 삭제"
                className="border border-trus-white/40 px-4 py-1.5 text-sm font-bold text-trus-white/70 hover:border-trus-yellow hover:text-trus-yellow focus:border-trus-yellow focus:text-trus-yellow disabled:cursor-not-allowed disabled:opacity-50"
              >
                {delPending ? "삭제 중…" : "이 영상 삭제"}
              </button>
              <span className="text-xs text-trus-white/40">관련 데이터까지 모두 삭제 · 되돌릴 수 없음</span>
            </div>
            {delError && <p className="mt-2 text-xs text-trus-yellow">⚠ {delError}</p>}
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

// 패턴 키 → 한글 라벨(가독성). 없는 키는 원문 그대로.
const PATTERN_KEY_LABEL: Record<string, string> = {
  copy: "문구(copy)",
  banned: "금지 패턴(banned)",
  visual: "시각(visual)",
  confidence: "신뢰도(confidence)",
  tentative_notes: "잠정 메모(tentative_notes)",
  structure: "구성",
  description: "설명",
  main_copy_notes: "메인카피 노트",
  small_box_notes: "작은박스 노트",
  length_notes: "길이 노트",
  hook_patterns: "후킹 패턴",
  emphasis_words: "강조 단어",
  face: "얼굴/인물",
  devices: "장치",
  color_usage: "색 사용",
  number_treatment: "숫자 처리",
  layout_archetypes: "레이아웃 원형",
  // 구성(structure) 프로필 patterns 키 — 한글 라벨(StructureStylePatterns 필드).
  section_archetypes: "섹션 유형(section_archetypes)",
  flow_principles: "전개 순서 원칙(flow_principles)",
  hook_placement: "훅 배치(hook_placement)",
  anxiety_relief: "불안 완화(anxiety_relief)",
  misconception_handling: "오개념 처리(misconception_handling)",
  ordering_notes: "전개 순서 메모(ordering_notes)",
  reference_outlines: "참조 목차(reference_outlines)",
};

// patterns(jsonb, 임의 구조)를 안전하게 재귀 렌더 — 문자열·숫자·배열·객체 처리. 깊이 무관.
function PatternNode({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-trus-white/35">—</span>;
  if (typeof value === "string") return <span className="text-trus-white/80">{value}</span>;
  if (typeof value === "number" || typeof value === "boolean") return <span className="text-trus-white/80">{String(value)}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-trus-white/35">(비어있음)</span>;
    return (
      <ul className="ml-3 flex list-disc flex-col gap-1">
        {value.map((v, i) => (
          <li key={i}>
            <PatternNode value={v} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-trus-white/35">(비어있음)</span>;
    return (
      <div className="flex flex-col gap-2">
        {entries.map(([k, v]) => (
          <div key={k}>
            <span className="text-xs font-bold tracking-wide text-trus-yellow/80">{PATTERN_KEY_LABEL[k] ?? k}</span>
            <div className="mt-0.5 pl-2 text-sm leading-relaxed">
              <PatternNode value={v} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return <span className="text-trus-white/35">—</span>;
}

// 초안/활성 1개 카드 — 키 칩 + '상세 보기' 토글로 patterns 전체를 펼친다.
function DraftCard({ d }: { d: CopyStyleDraft }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border border-trus-white/15 px-3 py-2">
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
        <>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {d.patternKeys.map((k) => (
              <span key={k} className="border border-trus-white/20 px-1.5 py-0.5 text-[11px] text-trus-white/70">
                {k}
              </span>
            ))}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="ml-auto text-[11px] font-bold text-trus-yellow/80 hover:text-trus-yellow"
            >
              {open ? "상세 접기 −" : "상세 보기 +"}
            </button>
          </div>
          {open && (
            <div className="mt-2 border-t border-trus-white/10 pt-2">
              <PatternNode value={d.patterns} />
            </div>
          )}
        </>
      ) : (
        <p className="mt-1 text-[11px] text-trus-white/35">패턴 키 없음</p>
      )}
    </li>
  );
}

function StylePanel({ drafts }: { drafts: CopyStyleDraft[] }) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "relearn" | "channel" | "activate">(null); // 무엇이 진행중인지(라벨 구분)
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const byComponent = useMemo(() => {
    const m: Record<CopyStyleComponentType, CopyStyleDraft[]> = { thumbnail_copy: [], title: [] };
    for (const d of drafts) m[d.componentType].push(d);
    return m;
  }, [drafts]);

  // 재학습은 styleRelearnSweep 를 동기로 await 하므로 pending 이 학습 끝까지 유지된다(진행중 표시 정확).
  //   완료되면 router.refresh()로 새 draft 가 반영(자동 새로고침). 실패/no-op 도 메시지로 구분.
  function run(tag: "relearn" | "channel" | "activate", fn: () => Promise<string>) {
    setError(null);
    setOk(null);
    setBusy(tag);
    startTransition(async () => {
      try {
        const msg = await fn();
        setOk(msg);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "처리 실패");
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <section className="border border-trus-white/20 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs font-bold tracking-widest text-trus-yellow uppercase">스타일 학습</h2>
        <button
          type="button"
          onClick={() => run("relearn", async () => {
            const r = await requestCopyRelearn();
            if (!r.anyCreated) {
              return "새 학습 데이터가 없어 변경 없음(이미 최신). 영상 입력을 저장한 뒤 다시 시도하세요.";
            }
            const parts: string[] = [];
            if (r.thumbnail.created) parts.push("썸네일");
            if (r.title.created) parts.push("제목");
            return `재학습 완료 — ${parts.join("·")} 새 초안 생성. 아래에서 검토 후 활성화하세요.`;
          })}
          disabled={pending}
          aria-busy={busy === "relearn"}
          className="bg-trus-yellow px-4 py-1.5 text-sm font-black text-trus-black disabled:opacity-50"
        >
          {busy === "relearn" ? "재학습 진행중… (수십 초~수 분)" : "재학습 실행"}
        </button>
        {/* 채널 제목 학습 — @zzanboo 고정 최근 50개 제목으로 제목 스타일 draft 만 생성(활성화는 아래 '최신 초안 활성화'). */}
        <button
          type="button"
          onClick={() => run("channel", async () => {
            const r = await requestChannelTitleRelearn();
            if (!r.created) return "변경 없음(가져온 제목이 없거나 학습 신호 없음).";
            return `제목 v${r.version} 초안 생성 (${r.titlesCount}개 학습). 아래에서 검토 후 활성화하세요.`;
          })}
          disabled={pending}
          aria-busy={busy === "channel"}
          className="bg-trus-yellow px-4 py-1.5 text-sm font-black text-trus-black disabled:opacity-50"
        >
          {busy === "channel" ? "채널 제목 학습 중…" : "채널 제목 학습"}
        </button>
        {(busy === "relearn" || busy === "channel") && (
          <span className="inline-flex items-center gap-2 text-xs text-trus-yellow">
            <span className="inline-block h-3 w-3 animate-spin border-2 border-trus-yellow border-t-transparent" aria-hidden />
            학습 중 — 끝나면 자동 새로고침됩니다. 버튼을 다시 누르지 마세요.
          </span>
        )}
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
                  onClick={() => run("activate", async () => {
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
                    <DraftCard key={d.id} d={d} />
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

// ─────────────────────────────────────────────────────────────────────────────
// 비유 학습(analogist) — component 하나뿐이라 StylePanel 을 단일 component 로 간소화 미러.
//   요약 라인은 analogyDraftSummary(순수 헬퍼·src/lib) 를 쓰고, 상세는 PatternNode·STATUS_LABEL·
//   fmtDate 재사용(새 렌더러 금지). 재학습→검토→직접 활성화 흐름은 StylePanel 과 동일.
// ─────────────────────────────────────────────────────────────────────────────

// 비유 초안 1개 카드 — 요약 라인(analogyDraftSummary) + 키 칩 + '상세 보기' 토글(DraftCard 미러).
//   AnalogyDraft 는 componentType 이 없어 DraftCard 를 그대로 못 써서 별도 카드로 둔다(렌더러는 재사용).
function AnalogyDraftCard({ d }: { d: AnalogyDraft }) {
  const [open, setOpen] = useState(false);
  const summary = analogyDraftSummary(d.patterns);
  return (
    <li className="border border-trus-white/15 px-3 py-2">
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

      {summary.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-trus-white/70">
          {summary.map((line, i) => (
            <span key={i} className="border border-trus-white/20 px-1.5 py-0.5">
              {line}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-trus-white/35">요약할 비유 신호 없음</p>
      )}

      {d.patternKeys.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {d.patternKeys.map((k) => (
            <span key={k} className="border border-trus-white/20 px-1.5 py-0.5 text-[11px] text-trus-white/70">
              {k}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="ml-auto text-[11px] font-bold text-trus-yellow/80 hover:text-trus-yellow"
          >
            {open ? "상세 접기 −" : "상세 보기 +"}
          </button>
        </div>
      )}
      {open && (
        <div className="mt-2 border-t border-trus-white/10 pt-2">
          <PatternNode value={d.patterns} />
        </div>
      )}
    </li>
  );
}

function AnalogyPanel({ drafts }: { drafts: AnalogyDraft[] }) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "relearn" | "activate">(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 재학습은 requestAnalogyRelearn 을 동기 await(STT→추출) 하므로 pending 이 학습 끝까지 유지된다.
  //   완료 시 router.refresh() 로 새 초안 반영. StylePanel.run 미러.
  function run(tag: "relearn" | "activate", fn: () => Promise<string>) {
    setError(null);
    setOk(null);
    setBusy(tag);
    startTransition(async () => {
      try {
        const msg = await fn();
        setOk(msg);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "처리 실패");
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <section className="border border-trus-white/20 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs font-bold tracking-widest text-trus-yellow uppercase">비유 학습</h2>
        <button
          type="button"
          onClick={() => run("relearn", async () => {
            const r = await requestAnalogyRelearn();
            if (r.created) {
              return `비유 초안 v${r.version} 생성 (${r.transcribed}개 영상 학습). 아래에서 검토 후 활성화하세요.`;
            }
            if (r.transcribed === 0) {
              return "learning/analogy-reels/ 에 mp4를 먼저 넣으세요.";
            }
            return `전사 ${r.transcribed}개 완료됐지만 비유 신호가 없어 초안 미생성.`;
          })}
          disabled={pending}
          aria-busy={busy === "relearn"}
          className="bg-trus-yellow px-4 py-1.5 text-sm font-black text-trus-black disabled:opacity-50"
        >
          {busy === "relearn" ? "재학습 진행중… (수십 초~수 분)" : "비유 레퍼런스 재학습"}
        </button>
        {busy === "relearn" && (
          <span className="inline-flex items-center gap-2 text-xs text-trus-yellow">
            <span className="inline-block h-3 w-3 animate-spin border-2 border-trus-yellow border-t-transparent" aria-hidden />
            학습 중 — 끝나면 자동 새로고침됩니다. 버튼을 다시 누르지 마세요.
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-trus-white/50">
        <code className="text-trus-white/70">learning/analogy-reels/</code> 의 릴스를 전사(STT)해 <b className="text-trus-white/80">비유 초안(draft)</b>을 만든다.
        첫 실행은 STT 때문에 수 분 걸릴 수 있다. 검토 후 <b className="text-trus-white/80">직접 활성화</b>한다(자동 활성화 없음).
      </p>

      <div className="mt-4 border border-trus-white/15 p-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-black text-trus-white">비유</h3>
          <button
            type="button"
            onClick={() => run("activate", async () => {
              const r = await activateCopyStyle("analogy");
              return r.activated > 0 ? "비유 최신 초안을 활성화했어" : "비유 — 이미 활성(변경 없음)";
            })}
            disabled={pending || drafts.length === 0}
            className="border border-trus-yellow px-3 py-1 text-xs font-bold text-trus-yellow hover:bg-trus-yellow hover:text-trus-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            최신 초안 활성화
          </button>
        </div>
        {drafts.length === 0 ? (
          <p className="mt-3 border border-dashed border-trus-white/15 px-3 py-4 text-center text-xs text-trus-white/35">
            아직 초안 없음 — 재학습을 실행하세요
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {drafts.map((d) => (
              <AnalogyDraftCard key={d.id} d={d} />
            ))}
          </ul>
        )}
      </div>

      {(ok || error) && (
        <p className="mt-3 text-xs text-trus-yellow">{error ? `⚠ ${error}` : `✓ ${ok}`}</p>
      )}
    </section>
  );
}

// ── 학습 영상 추가 카드 ──
//   "행 만들기"만 한다 — 제목(필수) + 선택(youtube id·업로드일·썸네일 URL)로 createLearningVideo 호출.
//   썸네일/제목 카피·CTR 입력은 여기서 안 함(생성 후 나타난 VideoCard 책임). VideoCard.onSave 의 error/ok 패턴 미러.
//   빈 선택값은 빈 문자열 대신 생략(undefined)해서 보낸다 — buildLearningVideoStub 가 값 있을 때만 키 추가하므로 폼도 동일.
function AddVideoCard() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [youtubeVideoId, setYoutubeVideoId] = useState("");
  const [uploadDate, setUploadDate] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const titleTrimmed = title.trim();

  function reset() {
    setTitle("");
    setYoutubeVideoId("");
    setUploadDate("");
    setThumbnailUrl("");
  }

  function onCreate() {
    setError(null);
    setOk(null);
    // 선택 입력은 trim 후 값이 있을 때만 키 추가(빈 문자열 누출 차단 · undefined 대입 안 함).
    const input: NewLearningVideoInput = { title: titleTrimmed };
    const vid = youtubeVideoId.trim();
    if (vid) input.youtubeVideoId = vid;
    const date = uploadDate.trim();
    if (date) input.uploadDate = date;
    const thumb = thumbnailUrl.trim();
    if (thumb) input.thumbnailUrl = thumb;

    startTransition(async () => {
      try {
        const res = await createLearningVideo(input);
        setOk(res.created ? "학습 영상이 생성됐어 — 아래 목록에 나타나" : "이미 존재하는 영상이야(기존 행 재사용)");
        reset();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "생성 실패");
      }
    });
  }

  return (
    <div className="mt-3 border border-trus-white/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:border-trus-yellow/40"
      >
        <span className="text-sm font-black text-trus-yellow">＋ 학습 영상 추가</span>
        <span className="ml-auto shrink-0 text-xs font-bold text-trus-white/50">{open ? "접기 −" : "열기 +"}</span>
      </button>

      {open && (
        <div className="border-t border-trus-white/15 px-4 py-4">
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className="text-xs font-bold tracking-widest text-trus-yellow uppercase">제목 (필수)</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 30살에 1억 모은 현실 루틴"
                aria-label="학습 영상 제목"
                className={`mt-1 ${INPUT_CLS}`}
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-trus-white/55">유튜브 video id (선택)</span>
                <input
                  value={youtubeVideoId}
                  onChange={(e) => setYoutubeVideoId(e.target.value)}
                  placeholder="예: dQw4w9WgXcQ"
                  aria-label="유튜브 video id"
                  className={`mt-1 ${INPUT_CLS}`}
                />
              </label>
              <label className="block">
                <span className="text-xs text-trus-white/55">업로드일 (선택)</span>
                <input
                  type="date"
                  value={uploadDate}
                  onChange={(e) => setUploadDate(e.target.value)}
                  aria-label="업로드일"
                  className={`mt-1 ${INPUT_CLS}`}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs text-trus-white/55">썸네일 URL (선택)</span>
              <input
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://…"
                aria-label="썸네일 URL"
                className={`mt-1 ${INPUT_CLS}`}
              />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={onCreate}
              disabled={pending || titleTrimmed.length === 0}
              className="bg-trus-yellow px-4 py-1.5 text-sm font-black text-trus-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "생성 중…" : "학습 영상 만들기"}
            </button>
            {ok && <span className="text-xs text-trus-yellow">✓ {ok}</span>}
            {error && <span className="text-xs text-trus-yellow">⚠ {error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 구성 학습(구다리) — style_profiles(component_type='structure') 읽기전용 표시.
//   patterns 렌더는 기존 PatternNode 재귀 렌더러 재사용(새 렌더러 금지). reference_outlines 만 빼서
//   '[주제] → 1. 섹션 — note' 가독 목록으로 따로 렌더(structure few-shot 렌더와 일관). 편집/재학습/활성화 버튼 없음.
// ─────────────────────────────────────────────────────────────────────────────

/** reference_outlines(jsonb 원본)를 가독 목록 모델로 안전 정규화. 깨진/누락 값 전부 방어. */
function normalizeOutlines(
  value: unknown,
): { topic: string; outline: { section: string; note?: string }[] }[] {
  if (!Array.isArray(value)) return [];
  const out: { topic: string; outline: { section: string; note?: string }[] }[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const topic = typeof o.topic === "string" && o.topic.trim() ? o.topic.trim() : "(주제 없음)";
    const sections: { section: string; note?: string }[] = [];
    if (Array.isArray(o.outline)) {
      for (const s of o.outline) {
        if (s === null || typeof s !== "object" || Array.isArray(s)) continue;
        const sr = s as Record<string, unknown>;
        const section = typeof sr.section === "string" && sr.section.trim() ? sr.section.trim() : "(섹션 없음)";
        const note = typeof sr.note === "string" && sr.note.trim() ? sr.note.trim() : undefined;
        sections.push(note ? { section, note } : { section });
      }
    }
    out.push({ topic, outline: sections });
  }
  return out;
}

/** patterns(jsonb)에서 reference_outlines 만 분리한 나머지 객체. 비객체면 null. */
function patternsWithoutOutlines(patterns: unknown): { rest: unknown; outlines: unknown } {
  if (patterns === null || typeof patterns !== "object" || Array.isArray(patterns)) {
    return { rest: patterns, outlines: undefined };
  }
  const { reference_outlines, ...rest } = patterns as Record<string, unknown>;
  return { rest, outlines: reference_outlines };
}

// 참조 목차 가독 렌더 — '[주제] → 1. 섹션 — note'. 빈 outline·note 없음 모두 안전 처리.
function ReferenceOutlines({ value }: { value: unknown }) {
  const outlines = normalizeOutlines(value);
  if (outlines.length === 0) return null;
  return (
    <div className="mt-3">
      <span className="text-xs font-bold tracking-wide text-trus-yellow/80">{PATTERN_KEY_LABEL.reference_outlines}</span>
      <ul className="mt-1.5 flex flex-col gap-3">
        {outlines.map((o, i) => (
          <li key={i} className="border border-trus-white/10 px-3 py-2">
            <p className="text-sm font-bold text-trus-white">[{o.topic}]</p>
            {o.outline.length === 0 ? (
              <p className="mt-1 text-xs text-trus-white/35">(목차 없음)</p>
            ) : (
              <ol className="mt-1 flex flex-col gap-0.5 text-sm text-trus-white/80">
                {o.outline.map((s, j) => (
                  <li key={j}>
                    {j + 1}. {s.section}
                    {s.note && <span className="text-trus-white/55"> — {s.note}</span>}
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// 구성 프로필 1건 — 버전·상태 헤더(DraftCard 뱃지 미러) + patterns(PatternNode, reference_outlines 제외) + 참조 목차 가독 렌더.
function StructureProfileCard({ label, profile }: { label: string; profile: StructureProfile }) {
  const { rest, outlines } = patternsWithoutOutlines(profile.patterns);
  return (
    <li className="border border-trus-white/15 px-3 py-3">
      <div className="flex items-center gap-2 text-xs text-trus-white/55">
        <span className="font-bold text-trus-white/70">{label}</span>
        <span className="font-bold text-trus-white">v{profile.version ?? "—"}</span>
        <span
          className={
            profile.status === "active"
              ? "border border-trus-yellow px-1.5 py-0.5 font-bold text-trus-yellow"
              : "border border-trus-white/25 px-1.5 py-0.5 text-trus-white/55"
          }
        >
          {STATUS_LABEL[profile.status]}
        </span>
      </div>
      <div className="mt-2 border-t border-trus-white/10 pt-2 text-sm leading-relaxed">
        <PatternNode value={rest} />
        <ReferenceOutlines value={outlines} />
      </div>
    </li>
  );
}

function StructurePanel({ structure }: { structure: StructureProfiles }) {
  const { active, latestDraft } = structure;
  const isEmpty = !active && !latestDraft;
  return (
    <section className="border border-trus-white/20 p-4">
      <h2 className="text-xs font-bold tracking-widest text-trus-yellow uppercase">구성 학습 (구다리)</h2>
      <p className="mt-2 text-xs text-trus-white/50">
        김짠부 완성 스크립트에서 추출한 <b className="text-trus-white/80">구성/전개 사양</b>(읽기 전용)이다.
        섹션 유형·전개 순서·훅 배치·불안 완화·오개념 처리와 대표 편의 실제 목차를 보여준다.
      </p>

      {isEmpty ? (
        <p className="mt-3 border border-dashed border-trus-white/20 px-4 py-8 text-center text-sm text-trus-white/40">
          아직 학습된 구성 프로필이 없습니다. 완성 스크립트에서 구성 사양이 추출·활성화되면 여기에 나타납니다.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {/* label은 카드 슬롯(현재 적용/최신 초안), 오른쪽 노랑 뱃지는 DB status — 의미가 달라 중복 아님("활성 v3 활성" 겹침 방지). */}
          {active && <StructureProfileCard label="현재 적용" profile={active} />}
          {latestDraft && <StructureProfileCard label="최신 초안" profile={latestDraft} />}
        </ul>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 교정 학습(correction-learning) 검토 — 저장된 교정쌍의 읽기전용 목록. 입력·차이 분석은
//   런 화면(썸네일 단계)에서 캡처된다. 여기선 저장된 교정과 diff 를 검토하고, 위 StylePanel
//   '재학습 실행' 으로 학습에 반영한다(여기엔 별도 입력/학습 버튼 없음).
// ─────────────────────────────────────────────────────────────────────────────

type CorrectionComponent = "thumbnail" | "title";

const CORRECTION_COMPONENT_LABEL: Record<CorrectionComponent, string> = {
  thumbnail: "썸네일 카피",
  title: "제목",
};

// diff(jsonb 원본)에서 summary 한 줄만 안전 추출(목록 요약용). 비객체·없음이면 null.
function diffSummaryOf(diff: unknown): string | null {
  if (diff === null || typeof diff !== "object" || Array.isArray(diff)) return null;
  const s = (diff as Record<string, unknown>).summary;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

// 저장된 교정쌍 1건 — 주제·diff 요약·learnedAt + '상세 보기' 토글로 diff 원본을 PatternNode 로 펼침(DraftCard 미러).
function CorrectionCard({ c }: { c: CorrectionRow }) {
  const [open, setOpen] = useState(false);
  const summary = diffSummaryOf(c.diff);
  const hasDiff = c.diff !== null && typeof c.diff === "object";
  return (
    <li className="border border-trus-white/15 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-trus-white/55">
        <span className="border border-trus-white/25 px-1.5 py-0.5 font-bold text-trus-white/70">
          {CORRECTION_COMPONENT_LABEL[c.componentType]}
        </span>
        <span className="font-bold text-trus-white">{c.topic ?? "(주제 없음)"}</span>
        {c.learnedAt ? (
          <span className="border border-trus-yellow px-1.5 py-0.5 font-bold text-trus-yellow">학습 반영됨</span>
        ) : (
          <span className="text-trus-white/40">미학습</span>
        )}
        <span className="ml-auto">{fmtDate(c.createdAt)}</span>
      </div>

      <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <span className="text-[11px] font-bold tracking-wide text-trus-yellow/70">AI 생성</span>
          <p className="mt-0.5 text-sm text-trus-white/70">{c.genText.length ? c.genText.join(" · ") : "—"}</p>
        </div>
        <div>
          <span className="text-[11px] font-bold tracking-wide text-trus-yellow/70">이상</span>
          <p className="mt-0.5 text-sm text-trus-white/70">{c.idealText.length ? c.idealText.join(" · ") : "—"}</p>
        </div>
      </div>

      {summary && <p className="mt-1.5 text-sm leading-relaxed text-trus-white/80">“{summary}”</p>}

      {hasDiff && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-1.5 text-[11px] font-bold text-trus-yellow/80 hover:text-trus-yellow"
          >
            {open ? "차이 상세 접기 −" : "차이 상세 보기 +"}
          </button>
          {open && (
            <div className="mt-2 border-t border-trus-white/10 pt-2">
              <PatternNode value={c.diff} />
            </div>
          )}
        </>
      )}
      {!hasDiff && <p className="mt-1.5 text-[11px] text-trus-white/35">차이 분석 없음 — 런 화면 썸네일 단계에서 교정 시 분석됩니다</p>}
    </li>
  );
}

function CorrectionPanel({ corrections }: { corrections: CorrectionRow[] }) {
  return (
    <section className="border border-trus-white/20 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold tracking-widest text-trus-yellow uppercase">교정 학습</h2>
        <span className="text-xs text-trus-white/40">{corrections.length}건</span>
      </div>
      <p className="mt-2 text-xs text-trus-white/50">
        교정은 <b className="text-trus-white/80">런 화면 썸네일 단계</b>에서 입력한다. 여기서는 저장된 교정과 차이 분석을 검토하고,
        위 <b className="text-trus-white/80">‘재학습 실행’</b>으로 학습에 반영한다(여기엔 별도 입력/학습 버튼 없음).
      </p>

      {corrections.length === 0 ? (
        <p className="mt-3 border border-dashed border-trus-white/20 px-4 py-8 text-center text-sm text-trus-white/40">
          아직 교정쌍이 없습니다. 런 화면 썸네일 단계에서 교정을 입력하면 여기에 나타납니다.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {corrections.map((c) => (
            <CorrectionCard key={c.id} c={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 김짠부 직접 피드백 학습(owner feedback) — 오너가 제목/썸네일 후보를 보고 말로 준 정성 피드백을
//   최우선 규칙으로 증류한다(submitOwnerFeedback→draft, activateCopyStyle('title_owner'|'thumbnail_owner')로
//   활성화). AnalogyPanel 미러: 단일 component·재학습(여기선 [학습])→검토→직접 활성화. 제목/썸네일 두 인스턴스.
//   요약은 ownerRulesDraftSummary(순수 헬퍼·src/lib), 카드는 AnalogyDraftCard 미러, STATUS_LABEL/fmtDate 재사용.
// ─────────────────────────────────────────────────────────────────────────────

type OwnerComponent = "title" | "thumbnail";

const OWNER_LABEL: Record<OwnerComponent, string> = {
  title: "제목",
  thumbnail: "썸네일",
};
// activateCopyStyle 에 넘길 owner 인자(componentTypeFor 가 title_owner_rules|thumbnail_owner_rules 로 매핑).
const OWNER_ACTIVATE_ARG: Record<OwnerComponent, "title_owner" | "thumbnail_owner"> = {
  title: "title_owner",
  thumbnail: "thumbnail_owner",
};

// owner rules 초안 1개 카드 — 요약 라인(ownerRulesDraftSummary) + rules 목록 토글(AnalogyDraftCard 미러).
function OwnerRulesDraftCard({ d }: { d: OwnerRulesDraft }) {
  const [open, setOpen] = useState(false);
  const summary = ownerRulesDraftSummary({ rules: d.rules, sources: Array.from({ length: d.sourcesCount }) });
  return (
    <li className="border border-trus-white/15 px-3 py-2">
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

      {summary.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-trus-white/70">
          {summary.map((line, i) => (
            <span key={i} className="border border-trus-white/20 px-1.5 py-0.5">
              {line}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-trus-white/35">요약할 규칙 없음</p>
      )}

      {d.rules.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-1.5 text-[11px] font-bold text-trus-yellow/80 hover:text-trus-yellow"
        >
          {open ? "규칙 접기 −" : "규칙 보기 +"}
        </button>
      )}
      {open && d.rules.length > 0 && (
        <ul className="mt-2 flex list-disc flex-col gap-1 border-t border-trus-white/10 pl-5 pt-2 text-sm text-trus-white/80">
          {d.rules.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function OwnerFeedbackPanel({ component, drafts }: { component: OwnerComponent; drafts: OwnerRulesDraft[] }) {
  const [topic, setTopic] = useState("");
  const [feedback, setFeedback] = useState("");
  // 제목: 후보 문자열 행 목록. 썸네일: 세트(메인2·박스2) 목록.
  const [titleRows, setTitleRows] = useState<string[]>([""]);
  const [thumbSets, setThumbSets] = useState<{ main: [string, string]; box: [string, string] }[]>([
    { main: ["", ""], box: ["", ""] },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "learn" | "activate">(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 현재 활성 규칙셋(status==='active' draft) — 지금까지 쌓인 최우선 규칙을 읽기전용으로 보여준다.
  const activeDraft = useMemo(() => drafts.find((d) => d.status === "active") ?? null, [drafts]);

  // submitOwnerFeedback/activateCopyStyle 을 동기 await 하므로 pending 이 처리 끝까지 유지된다. AnalogyPanel.run 미러.
  function run(tag: "learn" | "activate", fn: () => Promise<string>) {
    setError(null);
    setOk(null);
    setBusy(tag);
    startTransition(async () => {
      try {
        const msg = await fn();
        setOk(msg);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "처리 실패");
      } finally {
        setBusy(null);
      }
    });
  }

  /** 입력 상태 → 서버액션 candidates. 빈 행/빈 칸은 걸러낸다(빈 값 누출 차단). */
  function buildCandidates(): OwnerFeedbackCandidates {
    if (component === "title") {
      return titleRows.map((t) => t.trim()).filter(Boolean);
    }
    // 썸네일: 세트별 메인2·박스2 → {main, box}. 아무 값도 없는 세트는 스킵.
    const sets: { main: string[]; box: string[] }[] = [];
    for (const s of thumbSets) {
      const main = s.main.map((x) => x.trim()).filter(Boolean);
      const box = s.box.map((x) => x.trim()).filter(Boolean);
      if (main.length === 0 && box.length === 0) continue;
      sets.push({ main, box });
    }
    return sets;
  }

  function onLearn() {
    const fb = feedback.trim();
    if (fb.length === 0) {
      setError(null);
      setOk(null);
      setError("피드백을 입력하세요(김짠부가 후보를 보고 준 말).");
      return;
    }
    const candidates = buildCandidates();
    const topicVal = topic.trim();
    run("learn", async () => {
      const r = await submitOwnerFeedback({
        component,
        ...(topicVal ? { topic: topicVal } : {}),
        candidates,
        feedback: fb,
      });
      if (!r.created) return "변경 없음(피드백에서 새 규칙이 나오지 않음).";
      return `${OWNER_LABEL[component]} 규칙 v${r.version ?? "—"} 초안 생성 (규칙 ${r.ruleCount}개). 아래에서 검토 후 활성화하세요.`;
    });
  }

  // 제목 후보 행 조작
  function setTitleRow(i: number, value: string) {
    setTitleRows((rows) => rows.map((r, idx) => (idx === i ? value : r)));
  }
  function addTitleRow() {
    setTitleRows((rows) => [...rows, ""]);
  }
  function removeTitleRow(i: number) {
    setTitleRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, idx) => idx !== i)));
  }

  // 썸네일 세트 조작
  function patchThumbSet(i: number, patch: Partial<{ main: [string, string]; box: [string, string] }>) {
    setThumbSets((sets) => sets.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addThumbSet() {
    setThumbSets((sets) => [...sets, { main: ["", ""], box: ["", ""] }]);
  }
  function removeThumbSet(i: number) {
    setThumbSets((sets) => (sets.length <= 1 ? sets : sets.filter((_, idx) => idx !== i)));
  }

  return (
    <section className="border border-trus-white/20 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs font-bold tracking-widest text-trus-yellow uppercase">
          김짠부 직접 피드백 ({OWNER_LABEL[component]})
        </h2>
      </div>
      <p className="mt-2 text-xs text-trus-white/50">
        김짠부가 {OWNER_LABEL[component]} 후보를 보고 준 말을 그대로 적으면, 그 이유를 <b className="text-trus-white/80">최우선 규칙</b>으로 뽑아
        기존 규칙과 병합한다. 이 규칙은 다른 학습보다 <b className="text-trus-white/80">뒤(최우선)</b>에 주입돼 충돌 시 무조건 우선한다.
        검토 후 <b className="text-trus-white/80">직접 활성화</b>한다(자동 활성화 없음).
      </p>

      {/* 현재 활성 규칙셋(읽기전용) — 지금까지 쌓인 최우선 규칙 */}
      <div className="mt-4 border border-trus-white/15 p-3">
        <h3 className="text-sm font-black text-trus-white">현재 적용 중인 규칙</h3>
        {activeDraft && activeDraft.rules.length > 0 ? (
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-trus-white/80">
            {activeDraft.rules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 border border-dashed border-trus-white/15 px-3 py-3 text-center text-xs text-trus-white/35">
            아직 활성 규칙 없음 — 아래에서 피드백을 학습하고 초안을 활성화하세요
          </p>
        )}
      </div>

      {/* 입력: 주제(선택) + 후보 + 피드백 */}
      <div className="mt-4 flex flex-col gap-3">
        <label className="block">
          <span className="text-xs font-bold tracking-widest text-trus-yellow uppercase">주제 (선택)</span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예: 40대 노후 준비"
            aria-label={`${OWNER_LABEL[component]} 피드백 주제`}
            className={`mt-1 ${INPUT_CLS}`}
          />
        </label>

        {component === "title" ? (
          <fieldset className="border border-trus-white/15 p-3">
            <legend className="px-1 text-xs font-bold tracking-widest text-trus-yellow uppercase">제목 후보</legend>
            <div className="flex flex-col gap-2">
              {titleRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={row}
                    onChange={(e) => setTitleRow(i, e.target.value)}
                    placeholder={`제목 후보 ${i + 1}`}
                    aria-label={`제목 후보 ${i + 1}`}
                    className={INPUT_CLS}
                  />
                  <button
                    type="button"
                    onClick={() => removeTitleRow(i)}
                    disabled={titleRows.length <= 1}
                    aria-label={`제목 후보 ${i + 1} 삭제`}
                    className="shrink-0 border border-trus-white/25 px-2 py-1 text-xs font-bold text-trus-white/60 hover:border-trus-yellow hover:text-trus-yellow disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    −
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addTitleRow}
              className="mt-2 border border-trus-white/25 px-3 py-1 text-xs font-bold text-trus-white/70 hover:border-trus-yellow hover:text-trus-yellow"
            >
              ＋ 후보 추가
            </button>
          </fieldset>
        ) : (
          <fieldset className="border border-trus-white/15 p-3">
            <legend className="px-1 text-xs font-bold tracking-widest text-trus-yellow uppercase">썸네일 후보 세트</legend>
            <div className="flex flex-col gap-4">
              {thumbSets.map((s, i) => (
                <div key={i} className="border border-trus-white/15 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-trus-white">세트 {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeThumbSet(i)}
                      disabled={thumbSets.length <= 1}
                      aria-label={`세트 ${i + 1} 삭제`}
                      className="border border-trus-white/25 px-2 py-1 text-xs font-bold text-trus-white/60 hover:border-trus-yellow hover:text-trus-yellow disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      세트 삭제
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[0, 1].map((j) => (
                      <input
                        key={`main-${j}`}
                        value={s.main[j]}
                        onChange={(e) =>
                          patchThumbSet(i, {
                            main: [j === 0 ? e.target.value : s.main[0], j === 1 ? e.target.value : s.main[1]],
                          })
                        }
                        placeholder={`메인문구 ${j + 1}`}
                        aria-label={`세트 ${i + 1} 메인문구 ${j + 1}`}
                        className={INPUT_CLS}
                      />
                    ))}
                    {[0, 1].map((j) => (
                      <input
                        key={`box-${j}`}
                        value={s.box[j]}
                        onChange={(e) =>
                          patchThumbSet(i, {
                            box: [j === 0 ? e.target.value : s.box[0], j === 1 ? e.target.value : s.box[1]],
                          })
                        }
                        placeholder={`박스문구 ${j + 1}`}
                        aria-label={`세트 ${i + 1} 박스문구 ${j + 1}`}
                        className={INPUT_CLS}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addThumbSet}
              className="mt-2 border border-trus-white/25 px-3 py-1 text-xs font-bold text-trus-white/70 hover:border-trus-yellow hover:text-trus-yellow"
            >
              ＋ 세트 추가
            </button>
          </fieldset>
        )}

        <label className="block">
          <span className="text-xs font-bold tracking-widest text-trus-yellow uppercase">피드백 (필수)</span>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            placeholder="예: 이건 낚시라 별로. 숫자가 없으면 안 눌러. '~하는 법'은 식상해."
            aria-label={`${OWNER_LABEL[component]} 피드백`}
            className={`mt-1 ${INPUT_CLS} resize-y`}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onLearn}
          disabled={pending}
          aria-busy={busy === "learn"}
          className="bg-trus-yellow px-4 py-1.5 text-sm font-black text-trus-black disabled:opacity-50"
        >
          {busy === "learn" ? "학습 중… (수십 초)" : "학습"}
        </button>
        <button
          type="button"
          onClick={() => run("activate", async () => {
            const r = await activateCopyStyle(OWNER_ACTIVATE_ARG[component]);
            return r.activated > 0 ? `${OWNER_LABEL[component]} 최신 초안을 활성화했어` : `${OWNER_LABEL[component]} — 이미 활성(변경 없음)`;
          })}
          disabled={pending || drafts.length === 0}
          aria-busy={busy === "activate"}
          className="border border-trus-yellow px-3 py-1.5 text-xs font-bold text-trus-yellow hover:bg-trus-yellow hover:text-trus-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          최신 초안 활성화
        </button>
        {busy === "learn" && (
          <span className="inline-flex items-center gap-2 text-xs text-trus-yellow">
            <span className="inline-block h-3 w-3 animate-spin border-2 border-trus-yellow border-t-transparent" aria-hidden />
            학습 중 — 끝나면 자동 새로고침됩니다. 버튼을 다시 누르지 마세요.
          </span>
        )}
      </div>

      {/* 최근 초안 목록 */}
      <div className="mt-4 border border-trus-white/15 p-3">
        <h3 className="text-sm font-black text-trus-white">최근 초안</h3>
        {drafts.length === 0 ? (
          <p className="mt-3 border border-dashed border-trus-white/15 px-3 py-4 text-center text-xs text-trus-white/35">
            아직 초안 없음 — 피드백을 학습하세요
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {drafts.map((d) => (
              <OwnerRulesDraftCard key={d.id} d={d} />
            ))}
          </ul>
        )}
      </div>

      {(ok || error) && (
        <p className="mt-3 text-xs text-trus-yellow">{error ? `⚠ ${error}` : `✓ ${ok}`}</p>
      )}
    </section>
  );
}

export function CopyLearningForm({ videos, drafts, corrections, structure, analogyDrafts, titleOwnerDrafts, thumbnailOwnerDrafts }: { videos: CopyLearnVideo[]; drafts: CopyStyleDraft[]; corrections: CorrectionRow[]; structure: StructureProfiles; analogyDrafts: AnalogyDraft[]; titleOwnerDrafts: OwnerRulesDraft[]; thumbnailOwnerDrafts: OwnerRulesDraft[] }) {
  return (
    <div className="mt-8 flex flex-col gap-8">
      <StylePanel drafts={drafts} />

      <OwnerFeedbackPanel component="title" drafts={titleOwnerDrafts} />

      <OwnerFeedbackPanel component="thumbnail" drafts={thumbnailOwnerDrafts} />

      <AnalogyPanel drafts={analogyDrafts} />

      <StructurePanel structure={structure} />

      <CorrectionPanel corrections={corrections} />

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold tracking-widest text-trus-yellow uppercase">영상별 입력</h2>
          <span className="text-xs text-trus-white/40">{videos.length}편</span>
        </div>

        {/* 학습 영상 추가 — 새 행 생성. 생성 후 아래 목록에 VideoCard 로 나타난다. */}
        <AddVideoCard />

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
