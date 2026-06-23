// 다운스트림 단계 공통 컨텍스트 로더 — 이전 단계의 '선택된' 값·학습 자산을 읽는다.
// prepare()는 결정적(AI 없음)이므로 여기서 DB만 조회한다(§8.1).

import type { Supa } from "./runState.js";
import type { Stage } from "../domain/enums.js";
import type { Candidate } from "./stageContract.js";

/** (run, stage)에서 사람이 최종 선택한 payload(수정본 우선). 없으면 null. */
export async function getSelectedStagePayload(supa: Supa, runId: string, stage: Stage): Promise<unknown | null> {
  const { data: proposal } = await supa
    .from("stage_proposals")
    .select("id, candidates")
    .eq("run_id", runId)
    .eq("stage", stage)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!proposal) return null;

  const { data: sel } = await supa
    .from("stage_selections")
    .select("chosen_idx, edited_payload")
    .eq("proposal_id", proposal.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sel) return null;
  if (sel.edited_payload != null) return sel.edited_payload; // 사람 수정본 우선

  // 코드리뷰 P2: 위치 폴백 제거 — idx 일치만 신뢰. 불일치는 무음 강등 대신 에러(잘못된 컨텍스트 차단).
  const cands = (proposal.candidates as unknown as Candidate[]) ?? [];
  const chosen = cands.find((c) => c.idx === sel.chosen_idx);
  if (!chosen) throw new Error(`${stage} 선택 payload 없음: chosen_idx=${sel.chosen_idx}가 후보(${cands.length}개)와 불일치.`);
  return chosen.payload ?? null;
}

export interface ToneProfileLite {
  id: string;
  version: number;
  status: string;
  components: unknown;
}

/** 짠펜/훅이가 쓸 말투 프로파일 — active 우선, 없으면 최신 버전(draft 포함). */
export async function getToneProfile(supa: Supa): Promise<ToneProfileLite | null> {
  const { data: active } = await supa
    .from("tone_profile")
    .select("id, version, status, components")
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) return active as ToneProfileLite;

  const { data: latest } = await supa
    .from("tone_profile")
    .select("id, version, status, components")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (latest as ToneProfileLite) ?? null;
}
