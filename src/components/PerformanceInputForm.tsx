"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitVideoCtr } from "@/app/actions/copyLearn";
import type { CtrInputVideo } from "@/lib/dashboard/copyLearnView";
import { parseCtrInput, formatCtr } from "@/lib/performance/ctrInput";

// 성과 입력(노출클릭률) 화면(ctr-input-screen step2) — owner 가 Studio '도달범위' 탭에서 본
//   영상별 d7 노출클릭률(CTR)을 직접 입력→저장. 저장 시 submitVideoCtr(서버액션)이 해당 content 의
//   performance_metrics(d7, overall) 행에 ctr 만 merge(views 등은 안 건드림).
//   ★ 검증·표시 순수 로직은 여기 두지 않는다 — parseCtrInput/formatCtr 는 @/lib/performance/ctrInput 에서 import 만.
//     (컴포넌트에 순수 로직을 두면 vitest 가 @/ alias 사각지대로 못 import — rules.md.)
//   TRUS Create: 검정/노랑/흰 3색·직각(rounded 없음)·그림자/그라데이션 없음. CopyLearningForm 의 INPUT_CLS·useTransition 패턴 미러.

// ── 공통 인풋 스타일(CopyLearningForm 과 동일 — TRUS: 직각·투명배경·흰 테두리, 포커스 시 노랑 링) ──
const INPUT_CLS =
  "w-full border border-trus-white/25 bg-transparent px-2 py-1 text-sm text-trus-white placeholder:text-trus-white/30 focus:border-trus-yellow focus:outline-none focus:ring-1 focus:ring-trus-yellow";

function fmtDate(s: string | null): string {
  return s ? s.slice(0, 10) : "—";
}

// ── 영상 1개 행 — 제목·업로드일·현재 d7 조회수/CTR + CTR 입력칸 + 저장 버튼. 성공/실패는 이 행에 인라인. ──
function CtrRow({ video }: { video: CtrInputVideo }) {
  const [raw, setRaw] = useState(video.d7Ctr != null ? String(video.d7Ctr) : "");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSave() {
    setError(null);
    setOk(null);
    // 클라이언트 사전검증 — parseCtrInput 재사용(순수 로직 중복 금지). 통과해야 서버 호출.
    const parsed = parseCtrInput(raw);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    startTransition(async () => {
      try {
        const res = await submitVideoCtr(video.contentId, raw);
        if (res.saved) {
          setOk("저장됨");
          router.refresh();
        } else {
          setError("저장되지 않았습니다.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  return (
    <li className="border border-trus-white/20 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-trus-white">{video.title || "(제목 없음)"}</p>
          <p className="mt-0.5 text-xs text-trus-white/45">
            업로드 {fmtDate(video.uploadDate)}
            <span className="ml-2 text-trus-white/55">
              d7 조회수 {video.d7Views != null ? video.d7Views.toLocaleString() : "—"}
            </span>
            <span className="ml-2 text-trus-yellow/70">현재 CTR {formatCtr(video.d7Ctr)}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-widest text-trus-yellow uppercase">CTR %</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="예: 3.8"
              aria-label={`${video.title || "영상"} 노출클릭률(%)`}
              className={`max-w-[7rem] ${INPUT_CLS}`}
            />
          </label>
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="shrink-0 bg-trus-yellow px-4 py-1.5 text-sm font-black text-trus-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>

      {(ok || error) && (
        <p className="mt-2 text-xs text-trus-yellow" role="status">
          {error ? `⚠ ${error}` : `✓ ${ok}`}
        </p>
      )}
    </li>
  );
}

export function PerformanceInputForm({ videos }: { videos: CtrInputVideo[] }) {
  return (
    <section className="border border-trus-white/20 p-4">
      <h2 className="text-xs font-bold tracking-widest text-trus-yellow uppercase">성과 입력 (노출클릭률)</h2>
      <p className="mt-2 text-xs text-trus-white/50">
        노출클릭률(CTR)은 YouTube Studio <b className="text-trus-white/80">‘도달범위’ 탭</b>에서 확인해 입력하세요.
        입력한 값은 1주일(d7) 성과로 저장돼, <b className="text-trus-white/80">재학습</b> 시 제목·썸네일 문구 학습에 쓰인다.
      </p>

      {videos.length === 0 ? (
        <p className="mt-3 border border-dashed border-trus-white/20 px-4 py-8 text-center text-sm text-trus-white/40">
          입력할 영상이 없습니다. 유튜브 video id·업로드일이 등록된 발행 영상이 여기에 나타납니다.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {videos.map((v) => (
            <CtrRow key={v.contentId} video={v} />
          ))}
        </ul>
      )}
    </section>
  );
}
