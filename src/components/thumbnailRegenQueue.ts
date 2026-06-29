// 썸네일 슬롯 재생성 '비차단 큐'의 순수 코어 — UI·네트워크·전역 의존 0(입력만으로 결정).
//   배경: 슬롯 재생성은 1칸만 교체하고 나머지는 그대로 보존한다(thumbnailSlotStage, concurrency:1 직렬).
//     완료 신호가 없으므로(같은 proposedState로 새 행만 INSERT), '내용이 바뀐 슬롯 = 완료'로 판정한다.
//   ★ 절대 candidate id/row 식별자로 판정하지 않는다 — id는 재생성마다 새로 생겨 보존 슬롯도 '바뀐' 것처럼 보인다.
//     반드시 payload '내용' 동등성으로 본다. 보존 슬롯(같은 payload)=같은 키, 재생성 슬롯(다른 payload)=다른 키.
import type { CandidateView } from "@/lib/dashboard/proposalTypes";

/**
 * 후보 payload의 안정적 비교 키(내용 동등성).
 *   payload는 LLM JSON 객체 → 키 순서가 응답마다 흔들릴 수 있다. 단순 JSON.stringify는 키 순서로 키가 달라져
 *   보존 슬롯을 '바뀐 것'으로 오판할 수 있다. 그래서 객체 키를 정렬해 직렬화한다(중첩 객체/배열까지 재귀).
 *   배열은 순서 의미가 있으므로(메인/박스 문구 순서) 정렬하지 않고 원순서 유지.
 */
export function candidateKey(payload: unknown): string {
  return JSON.stringify(stableNormalize(payload));
}

/** 키 정렬 직렬화를 위한 재귀 정규화 — 객체는 키 정렬, 배열은 원순서 유지, 원시값은 그대로. */
function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize); // 배열 순서는 의미 있음 → 보존
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = stableNormalize(obj[key]);
    }
    return sorted;
  }
  return value; // string/number/boolean/null/undefined 등
}

/**
 * 대기 중 슬롯 중 '완료된' 슬롯 idx 목록(순수).
 *   pending: 슬롯idx → 큐 투입 시점 candidateKey 스냅샷.
 *   candidates: 현재 화면 후보들.
 *   규칙: 해당 idx의 현재 후보 candidateKey가 스냅샷과 '다르면' 완료. 후보가 없으면(idx 사라짐) 완료.
 *   ★ 변경된 슬롯만 완료로 본다 — 키가 같으면(보존) 아직 완료 아님(비차단이 깨지지 않도록).
 */
export function resolveCompletedSlots(
  pending: Readonly<Record<number, string>>,
  candidates: readonly CandidateView[],
): number[] {
  const currentKeyByIdx = new Map<number, string>();
  for (const c of candidates) {
    currentKeyByIdx.set(c.idx, candidateKey(c.payload));
  }
  const completed: number[] = [];
  for (const idxStr of Object.keys(pending)) {
    const idx = Number(idxStr);
    const snapshot = pending[idx];
    const current = currentKeyByIdx.get(idx);
    // 후보가 사라졌거나(undefined) 키가 달라졌으면 완료. 같으면 보존 → 아직 대기.
    if (current === undefined || current !== snapshot) {
      completed.push(idx);
    }
  }
  return completed;
}

/** 완료 슬롯을 pending에서 제거한 새 객체 반환(불변 — 원본 객체는 변형하지 않는다). */
export function clearSlots(
  pending: Readonly<Record<number, string>>,
  completed: readonly number[],
): Record<number, string> {
  const remove = new Set(completed.map(Number));
  const next: Record<number, string> = {};
  for (const idxStr of Object.keys(pending)) {
    const idx = Number(idxStr);
    const snapshot = pending[idx];
    if (snapshot !== undefined && !remove.has(idx)) next[idx] = snapshot;
  }
  return next;
}
