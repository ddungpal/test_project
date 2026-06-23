"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

// durable 파이프라인은 비동기 → 생성/검수 대기 상태에서 수동 새로고침(서버 컴포넌트 재요청).
//   (실시간 구독은 후속 개선.)
export function RefreshButton({ label = "새로고침" }: { label?: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="border border-trus-white/30 px-3 py-1.5 text-xs font-bold text-trus-white/70 hover:border-trus-yellow disabled:opacity-50"
    >
      {pending ? "…" : label}
    </button>
  );
}
