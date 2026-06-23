"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// 실시간 갱신(Phase 5 하드닝) — production_runs 변경을 Supabase Realtime으로 구독해 즉시 router.refresh().
//   ★ 하이브리드: Realtime(프로덕션·세션 있을 때 즉시) + 느린 폴링 폴백(dev 바이패스·이벤트 누락 대비).
//   ★ migration 21(publication) 미적용이어도 폴링으로 degrade(ship-safe). 작업 중일 때만 렌더(StageStepper).
// active=false면 폴백 폴링·1초 tick을 돌리지 않는다(유휴 재페치 감소). Realtime 구독은 active와 무관하게 유지.
export function LiveRefresh({ fallbackMs = 20000, active = true }: { fallbackMs?: number; active?: boolean }) {
  const router = useRouter();
  const [secs, setSecs] = useState(0);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supa = createSupabaseBrowserClient();
    // production_runs 전체 변경 구독(단독 owner·소수 런 → 테이블 단위로 충분). 변경 시 서버 재조회.
    const channel = supa
      .channel("production_runs_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "production_runs" }, () => router.refresh())
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    // 폴백 폴링 — Realtime 미수신(세션 없음·publication 미적용·이벤트 누락) 대비. active일 때만 가동.
    const tick = active ? setInterval(() => setSecs((s) => s + 1), 1000) : null;
    const poll = active ? setInterval(() => router.refresh(), fallbackMs) : null;

    return () => {
      supa.removeChannel(channel);
      if (tick) clearInterval(tick);
      if (poll) clearInterval(poll);
    };
  }, [router, fallbackMs, active]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-trus-yellow/80">
      <span className="h-2 w-2 animate-pulse rounded-full bg-trus-yellow" />
      {live ? "실시간 갱신 중…" : `자동 갱신 중… (${secs}s)`}
    </span>
  );
}
