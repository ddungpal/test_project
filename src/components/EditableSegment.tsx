"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editSegment, requestSegmentRegen } from "@/app/actions/topicRun";
import { LiveRefresh } from "@/components/LiveRefresh";
import type { SegmentView } from "@/lib/dashboard/scriptView";
import { isProseSegment } from "@/lib/script/segmentEdit";
import { SegmentBody } from "./SegmentList";

// 세그먼트 본문 + 프로즈 인라인 편집(editSegment) + 파트별 재생성(requestSegmentRegen 발행·폴링).
//   두 액션 호출만 — 백엔드(regenerateSegment·이벤트) 중복 구현 금지. PostConfirmStructureEdit 제어·폴링 패턴 미러.
//   SegmentList(server)·ScriptReview(client) 양쪽에서 SegmentBody 자리에 끼워 쓴다.
//   editable(script_review/approved)일 때: 프로즈면 [수정]+[재생성], 블록이면 [재생성]만.
//   !editable(published)면 기존 SegmentBody만 그대로(회귀 0 — 편집/재생성 미노출).
//   ★ 재생성 완료 감지 = 구조편집의 proposalId 대신 이 세그먼트 '행 자체'가 update된다 → segment.text prop이
//     제출 시점 startText와 달라지면 완료(step2 백엔드가 그 행만 update). useEffect로 폴링 종료.

const textareaCls =
  "block w-full resize-none border border-trus-white/30 bg-transparent px-3 py-2 text-sm leading-relaxed text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50";

// 안전 상한 — 완료는 segment.text 변경으로 감지하지만, 워커가 영영 끝나지 않을(실패) 때 폴링 무한루프 방지.
//   고정 시간 cutoff을 '완료 판정'으로 쓰지 않는다 — 진짜 종료는 text 변경으로 감지(PostConfirmStructureEdit 정본 미러).
const POLL_LIMIT_MS = 300000; // 5분(안전망).

export function EditableSegment({
  runId,
  segment,
  editable,
}: {
  runId: string;
  segment: SegmentView;
  editable: boolean;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(segment.text);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 재생성 — PostConfirmStructureEdit 폴링 정본 미러(감지 축만 proposalId→segment.text로 교체).
  const [regenOpen, setRegenOpen] = useState(false);
  const [reason, setReason] = useState(""); // 필수 입력 — 빈/공백이면 버튼 disabled(step3 금지사항: 빈 사유 거부).
  const [startText, setStartText] = useState<string | null>(null); // 제출 시점 text(null=유휴). 이게 prop과 달라지면 완료.
  const [timedOut, setTimedOut] = useState(false);
  const reasonId = useId();
  const submitted = startText !== null;
  const reasonEmpty = reason.trim().length === 0;

  // 노출 게이팅: editable(script_review/approved)이면 재생성 노출, 그중 프로즈만 직접 수정.
  const canEdit = editable && isProseSegment(segment);
  const empty = text.trim().length === 0; // 빈/공백은 저장 비활성(백엔드도 거부하지만 UI에서도 막음).

  function startEdit() {
    setText(segment.text); // 현재 확정값으로 초기화(취소 후 재진입 대비)
    setError(null);
    setEditing(true);
  }

  function submit() {
    if (empty) return;
    setError(null);
    startTransition(async () => {
      try {
        await editSegment(runId, segment.id, text.trim());
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "수정 실패");
      }
    });
  }

  // 재생성 완료 감지 — 그 세그먼트 행이 새로 쓰이면 서버 refresh로 segment.text prop이 startText와 달라진다 → 폴링 종료.
  useEffect(() => {
    if (startText !== null && segment.text !== startText) {
      setStartText(null);
      setTimedOut(false);
      setRegenOpen(false);
      setReason(""); // 다음 입력을 위해 이유칸 비움
    }
  }, [segment.text, startText]);

  // 안전 상한 — 워커 실패 등으로 영영 text가 안 바뀌면 폴링을 멈추고 안내만(무한 폴링 방지).
  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => setTimedOut(true), POLL_LIMIT_MS);
    return () => clearTimeout(t);
  }, [submitted]);

  function onRegenerate() {
    if (reasonEmpty) return; // 사유 필수(방어) — 버튼도 disabled지만 이중 가드.
    if (!window.confirm("짠펜에게 이 파트만 다시 쓰게 합니다(운영 시 비용 발생). 진행할까요?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await requestSegmentRegen(runId, segment.id, reason.trim());
        setStartText(segment.text); // 현재 text 기록 → 그 행이 다시 쓰여 바뀌면 완료
        router.refresh();
      } catch (e) {
        setStartText(null);
        setError(e instanceof Error ? e.message : "재생성 실패");
      }
    });
  }

  // published 등 읽기전용 — 편집/재생성 미노출(회귀 0).
  if (!editable) return <SegmentBody segment={segment} />;

  return (
    <div className="min-w-0 flex-1">
      {canEdit && editing ? (
        // 프로즈 직접 수정 패널
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={pending}
            rows={4}
            placeholder="단락 본문"
            className={textareaCls}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={submit}
              disabled={pending || empty}
              className="bg-trus-yellow px-4 py-1.5 text-xs font-black text-trus-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trus-yellow disabled:opacity-50"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={pending}
              className="border border-trus-white/30 px-4 py-1.5 text-xs text-trus-white/70 hover:border-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
            >
              취소
            </button>
          </div>
          {empty && <p className="mt-1 text-[11px] text-trus-white/40">본문을 비울 수 없습니다.</p>}
          {error && <p className="mt-1 text-xs font-bold text-trus-yellow">⚠ {error}</p>}
        </div>
      ) : (
        <div>
          <SegmentBody segment={segment} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* 수정 — 프로즈만(블록은 payload에 내용 → 텍스트 직접수정 무의미). 재생성 진행 중엔 감춤. */}
            {canEdit && !submitted && (
              <button
                onClick={startEdit}
                className="border border-trus-white/30 px-2 py-0.5 text-[11px] text-trus-white/60 hover:border-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow"
              >
                수정
              </button>
            )}
            {/* 재생성 토글 — 프로즈·블록 모두. 진행 중엔 감춤(중복 발행 방지). */}
            {!submitted && (
              <button
                onClick={() => setRegenOpen((v) => !v)}
                className="border border-trus-yellow/50 px-2 py-0.5 text-[11px] font-bold text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow"
              >
                {regenOpen ? "재생성 취소" : "재생성"}
              </button>
            )}
          </div>

          {/* 재생성 패널 — 사유 필수. PostConfirmStructureEdit 미러(감지 축만 text). */}
          {regenOpen && !submitted && (
            <div className="mt-2 border-t border-trus-white/15 pt-2">
              <label htmlFor={reasonId} className="mb-1.5 block text-[11px] font-bold text-trus-white/60">
                다시 쓰는 이유 (필수)
              </label>
              <textarea
                id={reasonId}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={pending}
                rows={2}
                placeholder="왜 다시 쓰나요? 예: 이 파트가 너무 딱딱해요"
                className="mb-2 block w-full max-w-md resize-none border border-trus-yellow/40 bg-transparent px-3 py-2 text-sm text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
              />
              <button
                onClick={onRegenerate}
                disabled={pending || reasonEmpty}
                className="border border-trus-yellow/50 px-4 py-1.5 text-xs font-bold text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
              >
                {pending ? "요청 중…" : "재생성"}
              </button>
              {reasonEmpty && <p className="mt-1 text-[11px] text-trus-white/40">이유를 입력해야 재생성됩니다.</p>}
            </div>
          )}

          {/* 재생성 진행 안내 — 그 행이 다시 쓰이면 폴링이 자동 종료. */}
          {submitted && !timedOut && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-trus-white/60">짠펜이 이 파트 다시 쓰는 중… 잠시 후 새로고침</span>
              <LiveRefresh active fallbackMs={3000} />
            </div>
          )}
          {submitted && timedOut && (
            <p className="mt-2 text-[11px] text-trus-white/50">아직 반영이 안 됐습니다 — 새로고침해 확인하세요.</p>
          )}
          {error && <p className="mt-1 text-xs font-bold text-trus-yellow">⚠ {error}</p>}
        </div>
      )}
    </div>
  );
}
