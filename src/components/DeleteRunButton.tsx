"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRun } from "@/app/actions/topicRun";

// 편 삭제 버튼 — 런 행에서 링크와 분리된 형제 요소(중첩 인터랙티브 금지). confirm 후 하드 삭제.
export function DeleteRunButton({ runId, label }: { runId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onDelete() {
    if (!window.confirm(`"${label}" 편을 영구 삭제합니다(되돌릴 수 없음). 진행할까요?`)) return;
    startTransition(async () => {
      try {
        await deleteRun(runId);
        router.refresh();
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "삭제 실패");
      }
    });
  }

  return (
    <button
      onClick={onDelete}
      disabled={pending}
      title="이 편 삭제"
      aria-label="이 편 삭제"
      className="shrink-0 border border-trus-white/15 px-2 text-trus-white/40 hover:border-trus-yellow hover:text-trus-yellow disabled:opacity-40"
    >
      {pending ? "…" : "🗑"}
    </button>
  );
}
