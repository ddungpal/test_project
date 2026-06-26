"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editThumbnails } from "@/app/actions/topicRun";
import { extractGenCopy } from "@/components/thumbnailCorrectionGen";
import { CandidateBody } from "@/components/CandidateBody";
import type { ThumbnailPayload } from "@/lib/dashboard/proposalTypes";

// 확정(thumbnails_selected) 후 썸네일 A/B/C 손편집 — editThumbnails만 호출(상태 전이 없음).
//   확정한 3개를 읽기전용 grid로 보이되, 카드마다 "수정" 버튼. 카드 수정 = main 2칸 + boxes 2칸 인라인.
//   ★ 한 카드만 고쳐도 3개 전체 payload 배열을 만들어 보낸다(전체 세트가 selection 한 행). 나머지 2개는 현재값 보존.
//   교정 학습 패널과 절대 섞지 않는다 — 이 분기엔 교정 패널이 없고, 수정은 독립 state/transition.

const inputCls =
  "block w-full border border-trus-white/25 bg-transparent px-2 py-1.5 text-xs text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50";

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

export function PostConfirmThumbnailsEdit({ runId, items }: { runId: string; items: EditItem[] }) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [main, setMain] = useState<[string, string]>(["", ""]);
  const [boxes, setBoxes] = useState<[string, string]>(["", ""]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const fieldBaseId = useId();

  function startEdit(it: EditItem) {
    const { main: m, boxes: b } = extractGenCopy(it.payload);
    setMain([m[0] ?? "", m[1] ?? ""]);
    setBoxes([b[0] ?? "", b[1] ?? ""]);
    setError(null);
    setEditingIdx(it.idx);
  }

  function submit(editIdx: number) {
    setError(null);
    // 정확히 3개 배열 — 수정 중인 카드만 입력값으로, 나머지는 현재 payload 그대로.
    const layout = (items.find((it) => it.idx === editIdx)?.payload ?? {}) as Partial<ThumbnailPayload>;
    const editedPayload: ThumbnailPayload = {
      thumbnail_main: [main[0], main[1]].map((s) => s.trim()).filter(Boolean),
      thumbnail_boxes: [boxes[0], boxes[1]].map((s) => s.trim()).filter(Boolean),
      ...(typeof layout.thumbnail_layout === "string" ? { thumbnail_layout: layout.thumbnail_layout } : {}),
    };
    const payloads = items.map((it) => (it.idx === editIdx ? editedPayload : toThumbnailPayload(it.payload)));
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

  return (
    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((it) => {
        const editing = editingIdx === it.idx;
        return (
          <div key={it.idx} className={`border p-3 ${editing ? "border-trus-yellow" : "border-trus-white/15"}`}>
            <div className="flex items-center justify-between">
              <span className="flex h-5 w-5 items-center justify-center border border-trus-yellow text-xs font-black text-trus-yellow">
                {String.fromCharCode(65 + it.idx)}
              </span>
              <button
                onClick={() => (editing ? setEditingIdx(null) : startEdit(it))}
                disabled={pending}
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
  );
}
