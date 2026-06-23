import { getInsightsBoard, type InsightView } from "@/lib/dashboard/insightsView";
import { INSIGHT_STATUS_LABEL, type InsightStatus } from "@/domain/insightStatus";
import { isDevBypass, requireOwnerPage } from "@/app/actions/auth";
import { InsightCard } from "@/components/InsightCard";

// 인사이트 승인(Phase 4 슬라이스 3) — 회고가 만든 학습 노트를 검토→승인/폐기.
//   승인된 인사이트만 차기 런에 환류(슬라이스 4). 서버 컴포넌트: 매 요청 최신 DB.
export const dynamic = "force-dynamic";

// 표시 순서 — 검토 대기를 맨 위(할 일), 다음 승인됨, 검토함, 폐기.
const ORDER: InsightStatus[] = ["draft", "approved", "reviewed", "deprecated"];

function Section({ status, items }: { status: InsightStatus; items: InsightView[] }) {
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-trus-yellow text-xs font-bold tracking-widest uppercase">{INSIGHT_STATUS_LABEL[status]}</h2>
        <span className="text-xs text-trus-white/40">{items.length}건</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 border border-dashed border-trus-white/15 px-4 py-5 text-center text-xs text-trus-white/35">없음</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((it) => (
            <InsightCard key={it.id} insight={it} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function InsightsPage() {
  await requireOwnerPage();
  const [board, devBypass] = await Promise.all([getInsightsBoard(), isDevBypass()]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      {devBypass && (
        <div className="mb-6 border border-trus-yellow/40 px-3 py-2 text-xs text-trus-yellow/80">
          ⚠ 개발용 owner 바이패스 활성 — 로그인 없이 owner 권한으로 동작 중. 배포 전 진짜 인증 필요.
        </div>
      )}

      <h1 className="text-3xl font-black leading-tight">
        학습 <span className="text-trus-yellow">인사이트</span>
      </h1>
      <p className="mt-2 text-sm text-trus-white/60">
        회고가 발견한 학습 노트. 김짠부가 <b className="text-trus-white">검토→승인</b>한 것만 다음 제작에 반영된다.
      </p>

      {board.total === 0 ? (
        <p className="mt-10 border border-dashed border-trus-white/20 px-4 py-8 text-center text-sm text-trus-white/40">
          아직 인사이트가 없습니다. 발행된 편의 성과를 적재한 뒤 회고를 실행하면 학습 노트가 쌓입니다.
        </p>
      ) : (
        ORDER.map((status) => <Section key={status} status={status} items={board.byStatus[status]} />)
      )}
    </main>
  );
}
