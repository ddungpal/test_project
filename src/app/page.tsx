import { listRuns, listReferenceEditions, type RunListItem } from "@/lib/dashboard/queries";
import { STATE_LABEL, runTone, type RunTone } from "@/lib/dashboard/labels";
import { isDevBypass, requireOwnerPage } from "@/app/actions/auth";
import { NewRunButton } from "@/components/NewRunButton";
import { DeleteRunButton } from "@/components/DeleteRunButton";

// Phase 3.1 — 대시보드 진입: 런 목록 + 새 편 시작. (런 상세=제안→선택은 3.2)
// 서버 컴포넌트: 매 요청 시 최신 DB 읽기(캐시 없이). NewRunButton만 클라이언트.
export const dynamic = "force-dynamic";

const TONE_CLASS: Record<RunTone, string> = {
  done: "border-trus-yellow text-trus-yellow",
  paused: "border-trus-yellow/60 text-trus-yellow/80",
  aborted: "border-trus-white/25 text-trus-white/40 line-through",
  active: "border-trus-white/30 text-trus-white/80",
};

function fmtDate(iso: string): string {
  // ISO → YYYY-MM-DD HH:mm (로케일 비의존, 서버/클라 일치).
  return iso.replace("T", " ").slice(0, 16);
}

function RunRow({ run }: { run: RunListItem }) {
  const label = run.title || run.topic || "(주제 미정)";
  return (
    <li className="flex items-stretch gap-2">
      <a
        href={`/runs/${run.id}`}
        className="flex flex-1 items-center justify-between gap-4 border border-trus-white/15 px-4 py-3 hover:border-trus-yellow/50"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-trus-white">{label}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-trus-white/45">
            <span className="font-mono">{run.id.slice(0, 8)}</span>
            <span>{fmtDate(run.createdAt)}</span>
            <span>${run.costUsd.toFixed(2)}</span>
            {run.reworkCount > 0 && <span>재작업 {run.reworkCount}</span>}
            {run.abortReason && <span className="text-trus-yellow/70">{run.abortReason}</span>}
          </div>
        </div>
        <span className={`shrink-0 border px-2 py-1 text-xs font-bold ${TONE_CLASS[runTone(run.state)]}`}>
          {STATE_LABEL[run.state]}
        </span>
      </a>
      <DeleteRunButton runId={run.id} label={label} />
    </li>
  );
}

export default async function Home() {
  await requireOwnerPage(); // 읽기 페이지도 owner 게이트 — 미인증은 /login. 바이패스 시 통과.
  const [runs, references, devBypass] = await Promise.all([listRuns(), listReferenceEditions(), isDevBypass()]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      {devBypass && (
        <div className="mb-6 border border-trus-yellow/40 px-3 py-2 text-xs text-trus-yellow/80">
          ⚠ 개발용 owner 바이패스 활성 — 로그인 없이 owner 권한으로 동작 중. 배포 전 진짜 인증 필요.
        </div>
      )}

      <h1 className="text-3xl font-black leading-tight">
        제작 <span className="text-trus-yellow">런</span>
      </h1>
      <p className="mt-2 text-sm text-trus-white/60">
        김짠부는 매 단계 <b className="text-trus-white">선택</b>만. 이유는 AI가 설명한다.
      </p>

      <div className="mt-8">
        <NewRunButton references={references} />
      </div>

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-trus-yellow text-xs font-bold tracking-widest uppercase">진행 중 / 완료된 편</h2>
          <span className="text-xs text-trus-white/40">{runs.length}건</span>
        </div>
        {runs.length === 0 ? (
          <p className="mt-4 border border-dashed border-trus-white/20 px-4 py-8 text-center text-sm text-trus-white/40">
            아직 시작한 편이 없습니다. 위에서 새 편을 시작하세요.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
