"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  backToResearchScope,
  reverifyResearch,
  regenResearchExamples,
} from "@/app/actions/topicRun";

// 리서치 결과/검수 단계의 재진입(re-entry) 보조 액션 줄(§8.2 단계 내부 되돌림).
//   research_ready / research_review에서 노출 — 셀·액션·전이는 모두 백엔드(step0~2) 담당, 여기선 호출·확인·새로고침만.
//   ① 다시 선택/보완 backToResearchScope(전이만)  ② 다시 검증 reverifyResearch(재과금)  ④ 예시 다시 생성 regenResearchExamples
//   주 액션(노랑 채움)과 구분되는 보조(outline) 위계. RegenerateButton outline 버튼 클래스 미러.
//   owner 게이트는 page의 requireOwnerPage가 담당(이 컴포넌트는 owner에게만 렌더).

const OUTLINE = "border border-trus-yellow/50 px-4 py-2 text-sm font-bold text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50";

export function ResearchReentryActions({ runId }: { runId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const costNoteId = useId(); // ②버튼 ↔ 비용 안내문 연결(aria-describedby).

  // 공통 핸들러 — confirm 통과 시 action 실행 → router.refresh. 에러는 텍스트로.
  function run(confirmMsg: string, action: () => Promise<void>, label: string) {
    if (!window.confirm(confirmMsg)) return;
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : `${label} 실패`);
      }
    });
  }

  return (
    <div className="border border-trus-white/15 p-3">
      <p className="text-xs font-bold text-trus-white/60">다시 손보기 (재진입)</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run("선택 단계로 돌아갑니다.", () => backToResearchScope(runId), "다시 선택")}
          className={OUTLINE}
        >
          ① 다시 선택/보완
        </button>
        <button
          type="button"
          disabled={pending}
          aria-describedby={costNoteId}
          onClick={() =>
            run("검색·검증을 다시 합니다. 비용이 듭니다.", () => reverifyResearch(runId), "다시 검증")
          }
          className={OUTLINE}
        >
          ⚠️ ② 다시 검증 (비용)
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run("숫자·비유만 다시 만듭니다. 사실은 유지.", () => regenResearchExamples(runId), "예시 다시 생성")
          }
          className={OUTLINE}
        >
          ④ 예시 다시 생성
        </button>
      </div>
      {/* ② 재검증 비용 안내 — 다이얼로그뿐 아니라 화면에도 한번 더 명시. ②버튼과 aria-describedby로 연결. */}
      <p id={costNoteId} className="mt-2 text-xs text-trus-white/40">⚠️ ② 다시 검증은 검색·검증을 새로 돌려 비용이 발생합니다. (①④는 비용 없음)</p>
      {pending && <p className="mt-1 text-xs text-trus-white/50">처리 중…</p>}
      {error && <p className="mt-1 text-xs text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}
