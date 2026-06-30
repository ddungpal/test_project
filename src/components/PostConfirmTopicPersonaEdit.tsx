"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editTopicPersona } from "@/app/actions/topicRun";
import type { TopicPayload } from "@/lib/dashboard/proposalTypes";

// 확정(topic_selected) 후 타겟 페르소나 손편집 — editTopicPersona만 호출(상태 전이 없음).
//   PostConfirmTitleEdit 미러(inputCls·버튼·useTransition·error·router.refresh()). 단 'AI로 다시 생성'은 불필요 → 제외.
//   백엔드(editTopicPersona)가 persona만 교체·나머지 필드 보존·검증을 담당 — UI는 빈 값만 막고 액션 호출.

const inputCls =
  "w-full border border-trus-white/30 bg-transparent px-2 py-1 text-sm text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow";

export function PostConfirmTopicPersonaEdit({
  runId,
  payload,
}: {
  runId: string;
  payload: unknown;
}) {
  const p = (payload ?? {}) as Partial<TopicPayload>;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(p.target_persona ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const personaId = useId();

  function startEdit() {
    setValue(p.target_persona ?? ""); // 현재 확정값으로 초기화(취소 후 재진입 대비)
    setError(null);
    setEditing(true);
  }

  function submit() {
    setError(null);
    const v = value.trim();
    if (!v) {
      setError("타겟은 비울 수 없습니다.");
      return;
    }
    startTransition(async () => {
      try {
        await editTopicPersona(runId, v);
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "수정 실패");
      }
    });
  }

  return (
    <div className="mt-3 border-t border-trus-white/15 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-trus-white/40">타겟 손편집</span>
        <button
          onClick={() => (editing ? setEditing(false) : startEdit())}
          className="border border-trus-white/30 px-2 py-1 text-xs text-trus-white/70 hover:border-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow"
        >
          {editing ? "수정 취소" : "수정"}
        </button>
      </div>

      {editing && (
        <div className="mt-3">
          <label htmlFor={personaId} className="block text-xs text-trus-white/60">타겟(누구+상황+막막함)</label>
          <input
            id={personaId}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="예: 2030 사회초년생, 첫 월급 목돈 굴리기 막막한 사람"
            disabled={pending}
            className={`mt-1 ${inputCls} disabled:opacity-50`}
          />
          <button
            onClick={submit}
            disabled={pending}
            className="mt-3 bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trus-yellow disabled:opacity-50"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
          {error && <p className="mt-2 text-xs font-bold text-trus-yellow">⚠ {error}</p>}
        </div>
      )}
    </div>
  );
}
