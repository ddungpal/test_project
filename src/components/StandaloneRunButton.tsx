"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runStandalone } from "@/app/actions/standaloneRun";
import { STANDALONE_DEPS } from "@/pipeline/standalone/deps";
import type { Stage } from "@/domain/enums";

// 단독 실행 — 한 단계만 돌린다(§8.2 단계경계). 크루 하나 고르면 STANDALONE_DEPS[stage].seeds가
//   그 단계가 진짜 필요로 하는 입력칸을 선언 → 그대로 동적 렌더. 임의 칸 추가 금지(seeds가 단일 출처).
//   촉이(topic)는 seeds=[] → 입력 없이 바로 실행.

// Stage enum → 크루 한글 라벨(요청 매핑·순서 고정).
const CREW: { stage: Stage; label: string; crew: string }[] = [
  { stage: "topic", label: "주제", crew: "촉이" },
  { stage: "title_thumb", label: "제목", crew: "훅이" },
  { stage: "thumbnail", label: "썸네일", crew: "썸네일" },
  { stage: "structure", label: "구성", crew: "구다리" },
  { stage: "research", label: "리서치", crew: "셜록" },
  { stage: "script", label: "스크립트", crew: "짠펜" },
];

const ASSETS_PLACEHOLDER = "한 줄에 하나씩 — 형식: kind|concept|text\n예: example|복리|월 30만원 10년이면…";

export function StandaloneRunButton() {
  const [target, setTarget] = useState<Stage>("topic");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const seeds = STANDALONE_DEPS[target].seeds;

  // 필수 입력이 전부 채워졌는지(빈 문자열·공백 불가) — 제출 게이트.
  const ready = useMemo(
    () => seeds.every((s) => !s.required || (inputs[s.field] ?? "").trim().length > 0),
    [seeds, inputs],
  );

  function pick(stage: Stage) {
    setTarget(stage);
    setInputs({}); // 크루 바꾸면 입력 초기화(이전 단계 칸 잔존 방지).
    setError(null);
  }

  function set(field: string, value: string) {
    setInputs((prev) => ({ ...prev, [field]: value }));
  }

  function submit() {
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      try {
        const { runId } = await runStandalone(target, inputs);
        router.push(`/runs/${runId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "단독 실행 시작 실패");
      }
    });
  }

  const tabCls = (stage: Stage) =>
    `px-3 py-1.5 text-xs font-bold ${target === stage ? "bg-trus-yellow text-trus-black" : "border border-trus-white/25 text-trus-white/60 hover:border-trus-yellow/60"}`;
  const inputCls =
    "w-full border border-trus-white/30 bg-transparent px-3 py-2 text-sm text-trus-white placeholder:text-trus-white/40 focus:border-trus-yellow focus:outline-none";

  const active = CREW.find((c) => c.stage === target)!;

  return (
    <div className="border border-trus-white/30 p-4">
      <label className="text-trus-yellow block text-xs font-bold tracking-widest uppercase">단독 실행</label>
      <p className="mt-2 text-xs text-trus-white/50">한 단계만 돌린다. 크루를 고르고 그 단계가 필요한 입력만 채우면 된다.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {CREW.map((c) => (
          <button key={c.stage} onClick={() => pick(c.stage)} disabled={pending} className={tabCls(c.stage)}>
            {c.crew} <span className="font-normal opacity-70">· {c.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {seeds.length === 0 ? (
          <p className="text-xs text-trus-white/50">{active.crew}는 입력 없이 바로 실행한다.</p>
        ) : (
          seeds.map((s) => {
            const value = inputs[s.field] ?? "";
            const labelEl = (
              <label className="text-xs font-bold text-trus-white/70">
                {s.label}
                {!s.required && <span className="ml-1 font-normal text-trus-white/40">(선택)</span>}
              </label>
            );
            if (s.kind === "research_facts") {
              return (
                <div key={s.field} className="flex flex-col gap-1.5">
                  {labelEl}
                  <textarea
                    value={value}
                    onChange={(e) => set(s.field, e.target.value)}
                    placeholder="한 줄에 검증된 사실 하나씩"
                    rows={4}
                    disabled={pending}
                    className={inputCls}
                  />
                </div>
              );
            }
            if (s.kind === "explanation_assets") {
              return (
                <div key={s.field} className="flex flex-col gap-1.5">
                  {labelEl}
                  <textarea
                    value={value}
                    onChange={(e) => set(s.field, e.target.value)}
                    placeholder={ASSETS_PLACEHOLDER}
                    rows={3}
                    disabled={pending}
                    className={inputCls}
                  />
                </div>
              );
            }
            // kind === "selection" → 한 줄 입력.
            return (
              <div key={s.field} className="flex flex-col gap-1.5">
                {labelEl}
                <input
                  value={value}
                  onChange={(e) => set(s.field, e.target.value)}
                  placeholder={`${s.label} 입력`}
                  disabled={pending}
                  className={inputCls}
                />
              </div>
            );
          })
        )}

        <button
          onClick={submit}
          disabled={pending || !ready}
          className="self-start bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black disabled:opacity-50"
        >
          {pending ? "시작 중…" : `${active.crew} 단독 실행`}
        </button>

        {!ready && seeds.length > 0 && (
          <p className="text-xs text-trus-white/40">필수 입력을 모두 채워야 실행할 수 있다.</p>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}
