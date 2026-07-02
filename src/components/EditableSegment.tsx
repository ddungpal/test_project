"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editSegment } from "@/app/actions/topicRun";
import type { SegmentView } from "@/lib/dashboard/scriptView";
import { isProseSegment } from "@/lib/script/segmentEdit";
import { SegmentBody } from "./SegmentList";

// 세그먼트 본문 + 프로즈 인라인 편집(editSegment만 호출·상태 전이 0). PostConfirmStructureEdit 제어 패턴 미러.
//   SegmentList(server)·ScriptReview(client) 양쪽에서 SegmentBody 자리에 끼워 쓴다.
//   editable && 프로즈일 때만 "수정" 버튼 노출 — 그 외(블록·읽기전용·published)는 기존 SegmentBody만 그대로(회귀 0).
//   블록(table/case/visual)은 내용이 payload에 있어 텍스트 직접수정 무의미 → 버튼 미노출(백엔드도 거부).

const textareaCls =
  "block w-full resize-none border border-trus-white/30 bg-transparent px-3 py-2 text-sm leading-relaxed text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50";

export function EditableSegment({
  runId,
  segment,
  editable,
}: {
  runId: string;
  segment: SegmentView;
  editable: boolean;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(segment.text);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 편집 가능 조건: 노출 게이팅(editable) + 프로즈만. 아니면 읽기 전용 본문만(회귀 0).
  const canEdit = editable && isProseSegment(segment);
  const empty = text.trim().length === 0; // 빈/공백은 저장 비활성(백엔드도 거부하지만 UI에서도 막음).

  function startEdit() {
    setText(segment.text); // 현재 확정값으로 초기화(취소 후 재진입 대비)
    setError(null);
    setEditing(true);
  }

  function submit() {
    if (empty) return;
    setError(null);
    startTransition(async () => {
      try {
        await editSegment(runId, segment.id, text.trim());
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "수정 실패");
      }
    });
  }

  if (!canEdit) return <SegmentBody segment={segment} />;

  return (
    <div className="min-w-0 flex-1">
      {editing ? (
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={pending}
            rows={4}
            placeholder="단락 본문"
            className={textareaCls}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={submit}
              disabled={pending || empty}
              className="bg-trus-yellow px-4 py-1.5 text-xs font-black text-trus-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trus-yellow disabled:opacity-50"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={pending}
              className="border border-trus-white/30 px-4 py-1.5 text-xs text-trus-white/70 hover:border-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
            >
              취소
            </button>
          </div>
          {empty && <p className="mt-1 text-[11px] text-trus-white/40">본문을 비울 수 없습니다.</p>}
          {error && <p className="mt-1 text-xs font-bold text-trus-yellow">⚠ {error}</p>}
        </div>
      ) : (
        <div>
          <SegmentBody segment={segment} />
          <button
            onClick={startEdit}
            className="mt-2 border border-trus-white/30 px-2 py-0.5 text-[11px] text-trus-white/60 hover:border-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow"
          >
            수정
          </button>
        </div>
      )}
    </div>
  );
}
