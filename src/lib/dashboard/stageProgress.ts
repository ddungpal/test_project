// 파이프라인 5단계 진행 매핑 — 런 상태(18종)를 크루 5단계 스테퍼로 환원.
//   "총 어떤 단계가 있고 지금 어디인지 + AI가 작업 중인지(자동 갱신)"를 한눈에.
import type { RunState } from "../../domain/enums.js";

export interface StepDef {
  key: string;
  label: string;
  crew: string;
}
export const PIPELINE_STEPS: StepDef[] = [
  { key: "topic", label: "주제", crew: "촉이" },
  { key: "title", label: "제목·썸네일", crew: "훅이" },
  { key: "structure", label: "구성", crew: "구다리" },
  { key: "research", label: "리서치", crew: "셜록" },
  { key: "script", label: "대본", crew: "짠펜" },
];

// working = AI 비동기 작업 중(자동 갱신 대상) / await_* = 사람 차례 / done = 완료.
export type Phase = "working" | "await_select" | "await_review" | "await_start" | "done";

const STATE_MAP: Record<RunState, { step: number; phase: Phase }> = {
  created: { step: 0, phase: "working" },
  topic_proposed: { step: 0, phase: "await_select" },
  topic_selected: { step: 1, phase: "await_start" },
  titles_proposed: { step: 1, phase: "await_select" },
  titles_selected: { step: 1, phase: "await_start" }, // 제목 확정 — 같은 스텝(제목·썸네일)에서 썸네일 시작 대기
  thumbnails_proposed: { step: 1, phase: "await_select" }, // 썸네일은 5단 스테퍼상 제목 스텝(1)에 흡수
  thumbnails_selected: { step: 2, phase: "await_start" }, // 썸네일 확정 → 구성 시작 대기
  structure_proposed: { step: 2, phase: "await_select" },
  structure_selected: { step: 3, phase: "await_start" },
  researching: { step: 3, phase: "working" },
  research_ready: { step: 3, phase: "await_review" },
  research_review: { step: 3, phase: "await_review" },
  research_approved: { step: 4, phase: "await_start" },
  scripting: { step: 4, phase: "working" },
  script_ready: { step: 4, phase: "await_review" },
  script_review: { step: 4, phase: "await_review" },
  approved: { step: 4, phase: "done" },
  published: { step: 4, phase: "done" },
  paused_soft_cap: { step: 3, phase: "working" }, // 리서치/스크립트에서 정지(대략)
  aborted: { step: 0, phase: "done" },
};

const PHASE_LABEL: Record<Phase, string> = {
  working: "작업 중",
  await_select: "후보 선택 대기",
  await_review: "검수 대기",
  await_start: "다음 단계 시작 대기",
  done: "완료",
};

export interface Progress {
  step: number; // 현재 스텝 0-4
  phase: Phase;
  isWorking: boolean; // AI 비동기 작업 중 → 자동 갱신
  terminal: "aborted" | "published" | "paused" | null;
  statusLabel: string; // 한 줄 현재 상태
  stepStatus(i: number): "done" | "current" | "pending";
}

// 단계 내부 서브진행 — progress_note 'i/n·라벨' 파싱(예: "2/3·외부 검색 (웹·YouTube)").
export interface SubProgress {
  index: number; // 1-based
  total: number;
  label: string;
}
export function parseSubProgress(note: string | null | undefined): SubProgress | null {
  if (!note) return null;
  const m = note.match(/^(\d+)\/(\d+)·(.+)$/);
  if (!m) return null;
  return { index: Number(m[1]), total: Number(m[2]), label: m[3]! };
}

export function getProgress(state: RunState): Progress {
  const { step, phase } = STATE_MAP[state];
  const terminal: Progress["terminal"] =
    state === "aborted" ? "aborted" : state === "published" ? "published" : state === "paused_soft_cap" ? "paused" : null;
  const isWorking = phase === "working" && state !== "paused_soft_cap";
  const crew = PIPELINE_STEPS[step]?.crew ?? "";

  const statusLabel =
    terminal === "aborted"
      ? "중단됨"
      : terminal === "paused"
        ? "비용 한도로 일시정지 — 재개 대기"
        : phase === "done"
          ? "완성"
          : phase === "working"
            ? `${crew}가 ${PIPELINE_STEPS[step]?.label} ${PHASE_LABEL.working} · 자동 갱신`
            : `${PIPELINE_STEPS[step]?.label} — ${PHASE_LABEL[phase]}`;

  return {
    step,
    phase,
    isWorking,
    terminal,
    statusLabel,
    stepStatus(i: number) {
      if (terminal === "aborted") return i === step ? "current" : i < step ? "done" : "pending";
      if (i < step) return "done";
      if (i === step) return phase === "done" ? "done" : "current";
      return "pending";
    },
  };
}
