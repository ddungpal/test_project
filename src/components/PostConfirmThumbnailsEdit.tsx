"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editThumbnails, regenerateAfterConfirm } from "@/app/actions/topicRun";
import { extractGenCopy } from "@/components/thumbnailCorrectionGen";
import { CandidateBody } from "@/components/CandidateBody";
import { LiveRefresh } from "@/components/LiveRefresh";
import type { ThumbnailPayload } from "@/lib/dashboard/proposalTypes";

// 확정(thumbnails_selected) 후 썸네일 A/B/C 손편집 — editThumbnails만 호출(상태 전이 없음).
//   확정한 3개를 읽기전용 grid로 보이되, 카드마다 "수정" 버튼. 카드 수정 = main 2칸 + boxes 2칸 인라인.
//   ★ 한 카드만 고쳐도 3개 전체 payload 배열을 만들어 보낸다(전체 세트가 selection 한 행). 나머지 2개는 현재값 보존.
//   교정 학습 패널과 절대 섞지 않는다 — 이 분기엔 교정 패널이 없고, 수정은 독립 state/transition.
//   ★ 'AI로 다시 생성'(step1) — regenerateAfterConfirm("thumbnail")로 새 proposal 생성(상태 전이 없음).
//     완료 감지는 RegenerateButton 정본 미러(제출 시 proposalId를 startId 기록 → 바뀌면 완료).
//     완료 시 localItems를 regenItems(최신 3후보)로 교체 → 카드 draft에 새 카피가 채워진다(editThumbnails 호출 X·자동저장 금지).
//     카드 표시·편집·저장은 전부 localItems 기준 — 사용자가 보고 수정 후 기존 저장으로 확정.

const inputCls =
  "block w-full border border-trus-white/25 bg-transparent px-2 py-1.5 text-xs text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50";

// 안전 상한 — 완료는 proposalId 변경으로 감지하지만, 워커 실패 시 폴링 무한루프 방지(고정 cutoff은 완료 판정 아님).
const POLL_LIMIT_MS = 300000; // 5분(안전망). 정상 종료는 proposalId 변경이 담당.

type EditItem = { idx: number; payload: unknown };

// payload → ThumbnailPayload(main[]·boxes[]·layout 보존). extractGenCopy로 안전 추출(trim·빈칸 제거).
function toThumbnailPayload(payload: unknown): ThumbnailPayload {
  const { main, boxes } = extractGenCopy(payload);
  const layout = (payload ?? {}) as Partial<ThumbnailPayload>;
  return {
    thumbnail_main: main,
    thumbnail_boxes: boxes,
    ...(typeof layout.thumbnail_layout === "string" ? { thumbnail_layout: layout.thumbnail_layout } : {}),
  };
}

export function PostConfirmThumbnailsEdit({
  runId,
  items,
  proposalId,
  regenItems,
}: {
  runId: string;
  items: EditItem[];
  proposalId?: string | undefined;
  regenItems?: EditItem[] | undefined;
}) {
  // 카드 표시·편집·저장의 단일 출처 — 재생성 완료 시 regenItems로 교체된다(draft만, 자동저장 X).
  const [localItems, setLocalItems] = useState<EditItem[]>(items);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [main, setMain] = useState<[string, string]>(["", ""]);
  const [boxes, setBoxes] = useState<[string, string]>(["", ""]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const fieldBaseId = useId();

  // 재생성(step1) — RegenerateButton 폴링 정본 미러.
  const [reason, setReason] = useState(""); // 선택 입력 — 비/공백이면 백엔드에서 미전송.
  const [startId, setStartId] = useState<string | null>(null); // 제출 시점 proposalId(null=유휴). 바뀌면 완료.
  const [timedOut, setTimedOut] = useState(false);
  const reasonId = useId();
  const submitted = startId !== null;

  function startEdit(it: EditItem) {
    const { main: m, boxes: b } = extractGenCopy(it.payload);
    setMain([m[0] ?? "", m[1] ?? ""]);
    setBoxes([b[0] ?? "", b[1] ?? ""]);
    setError(null);
    setEditingIdx(it.idx);
  }

  function submit(editIdx: number) {
    setError(null);
    // 정확히 3개 배열 — 수정 중인 카드만 입력값으로, 나머지는 현재(local) payload 그대로.
    const layout = (localItems.find((it) => it.idx === editIdx)?.payload ?? {}) as Partial<ThumbnailPayload>;
    const editedPayload: ThumbnailPayload = {
      thumbnail_main: [main[0], main[1]].map((s) => s.trim()).filter(Boolean),
      thumbnail_boxes: [boxes[0], boxes[1]].map((s) => s.trim()).filter(Boolean),
      ...(typeof layout.thumbnail_layout === "string" ? { thumbnail_layout: layout.thumbnail_layout } : {}),
    };
    const payloads = localItems.map((it) => (it.idx === editIdx ? editedPayload : toThumbnailPayload(it.payload)));
    startTransition(async () => {
      try {
        await editThumbnails(runId, payloads);
        setEditingIdx(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "수정 실패");
      }
    });
  }

  // 재생성 완료 감지 — 새 proposal 도착 시 proposalId prop이 startId와 달라진다 → 폴링 종료 + 카드 draft 교체.
  //   localItems를 regenItems(최신 3후보)로 채운다(editThumbnails 호출 X·자동저장 금지). 편집칸은 닫아 새 카드를 보게.
  useEffect(() => {
    if (startId !== null && proposalId != null && proposalId !== startId) {
      if (regenItems && regenItems.length > 0) setLocalItems(regenItems);
      setEditingIdx(null);
      setStartId(null);
      setTimedOut(false);
      setReason(""); // 다음 입력을 위해 이유칸 비움
    }
  }, [proposalId, startId, regenItems]);

  // 안전 상한 — 워커 실패 등으로 영영 새 후보가 안 오면 폴링을 멈추고 안내만(무한 폴링 방지).
  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => setTimedOut(true), POLL_LIMIT_MS);
    return () => clearTimeout(t);
  }, [submitted]);

  function onRegenerate() {
    if (!proposalId) return;
    if (!window.confirm("AI로 썸네일 3개(A/B/C)를 다시 생성합니다. 새 후보가 도착하면 카드에 채워집니다(자동 저장 X).")) return;
    setError(null);
    startTransition(async () => {
      try {
        await regenerateAfterConfirm(runId, "thumbnail", reason); // 빈/공백 reason은 백엔드에서 미전송. force·forceLlm 미전송.
        setStartId(proposalId); // 현재 proposalId 기록 → 새 행 도착해 바뀌면 완료
        router.refresh();
      } catch (e) {
        setStartId(null);
        setError(e instanceof Error ? e.message : "재생성 실패");
      }
    });
  }

  return (
    <div>
      {/* AI로 다시 생성(step1) — proposalId 없으면(방어) 숨김. 완료 시 아래 3카드에 새 후보 draft가 채워진다. */}
      {proposalId && (
        <div className="mb-3 border border-trus-white/15 p-3">
          <label htmlFor={reasonId} className="mb-1.5 block text-xs font-bold text-trus-white/60">
            다시 생성 이유 (선택)
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending || submitted}
            rows={2}
            placeholder="왜 다시 생성하나요? (선택) 예: 더 자극적인 후킹으로"
            className="mb-2 block w-full max-w-md resize-none border border-trus-yellow/40 bg-transparent px-3 py-2 text-sm text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
          />
          <button
            onClick={onRegenerate}
            disabled={pending || submitted}
            className="border border-trus-yellow/50 px-5 py-2 text-sm font-bold text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
          >
            {pending ? "요청 중…" : submitted ? "생성 중…" : "AI로 다시 생성"}
          </button>
          {submitted && !timedOut && (
            <div className="mt-2">
              <LiveRefresh active fallbackMs={3000} />
            </div>
          )}
          {submitted && timedOut && (
            <p className="mt-2 text-xs text-trus-white/50">새 후보가 카드에 반영됐는지 확인하세요.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {localItems.map((it) => {
          const editing = editingIdx === it.idx;
          return (
            <div key={it.idx} className={`border p-3 ${editing ? "border-trus-yellow" : "border-trus-white/15"}`}>
              <div className="flex items-center justify-between">
                <span className="flex h-5 w-5 items-center justify-center border border-trus-yellow text-xs font-black text-trus-yellow">
                  {String.fromCharCode(65 + it.idx)}
                </span>
                <button
                  onClick={() => (editing ? setEditingIdx(null) : startEdit(it))}
                  disabled={pending || submitted}
                  className="border border-trus-white/30 px-2 py-1 text-xs text-trus-white/70 hover:border-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
                >
                  {editing ? "수정 취소" : "수정"}
                </button>
              </div>

              {editing ? (
                <div className="mt-2 flex flex-col gap-1.5">
                  {([0, 1] as const).map((slot) => {
                    const letter = String.fromCharCode(65 + it.idx);
                    return (
                      <div key={`m-${slot}`}>
                        <label htmlFor={`${fieldBaseId}-${it.idx}-main-${slot}`} className="sr-only">
                          {letter}안 메인문구 {slot + 1}
                        </label>
                        <input
                          id={`${fieldBaseId}-${it.idx}-main-${slot}`}
                          value={main[slot]}
                          onChange={(e) => setMain((prev) => (slot === 0 ? [e.target.value, prev[1]] : [prev[0], e.target.value]))}
                          placeholder={`메인문구 ${slot + 1}`}
                          disabled={pending}
                          className={inputCls}
                        />
                      </div>
                    );
                  })}
                  {([0, 1] as const).map((slot) => {
                    const letter = String.fromCharCode(65 + it.idx);
                    return (
                      <div key={`b-${slot}`}>
                        <label htmlFor={`${fieldBaseId}-${it.idx}-box-${slot}`} className="sr-only">
                          {letter}안 박스문구 {slot + 1}
                        </label>
                        <input
                          id={`${fieldBaseId}-${it.idx}-box-${slot}`}
                          value={boxes[slot]}
                          onChange={(e) => setBoxes((prev) => (slot === 0 ? [e.target.value, prev[1]] : [prev[0], e.target.value]))}
                          placeholder={`박스문구 ${slot + 1}`}
                          disabled={pending}
                          className={inputCls}
                        />
                      </div>
                    );
                  })}
                  <button
                    onClick={() => submit(it.idx)}
                    disabled={pending}
                    className="mt-1 bg-trus-yellow px-3 py-2 text-xs font-black text-trus-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trus-yellow disabled:opacity-50"
                  >
                    {pending ? "저장 중…" : "저장"}
                  </button>
                </div>
              ) : (
                <div className="mt-2">
                  <CandidateBody stage="thumbnail" payload={it.payload} />
                </div>
              )}
            </div>
          );
        })}
        {error && <p className="text-xs font-bold text-trus-yellow sm:col-span-3">⚠ {error}</p>}
      </div>
    </div>
  );
}
