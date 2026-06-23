// 채택률 신호(Phase D — 말투내재화 #1) — 순수 집계(DB·시각 무관 → 테스트 용이).
//   stage_selections ⨝ stage_proposals 로 stage 를 붙인 행에서, 단계(stage)별
//   '그대로 채택' 비율 + 평균 수정량을 낸다. 높은 채택률 = 그 에이전트 제안/말투가
//   김짠부에게 먹힘 → AX 전환(말투 내재화) 후보 신호.
//   ★ 순수: Date/랜덤/IO 없음. 입력만으로 결정적.

/** stage_selections 한 행에 stage(stage_proposals)를 코드조인으로 붙인 입력. */
export interface AdoptionRow {
  stage: string;
  edit_distance: number | null;
  edited_payload: unknown | null;
}

export interface AdoptionStat {
  /** 이 stage 선택 건수. */
  n: number;
  /** 수정 없이 그대로 채택한 건수. */
  adoptedAsIs: number;
  /** adoptedAsIs / n. n=0 이면 0. */
  adoptionRate: number;
  /** edit_distance 가 있는(=수치) 행들의 평균. 그런 행이 없으면 0. */
  avgEditDistance: number;
}

/**
 * '그대로 채택' 판정(보수적): 수정 신호가 전혀 없을 때만 true.
 *   - edit_distance 가 null 또는 0, **그리고** edited_payload 가 null → 그대로 채택.
 *   - edit_distance > 0 (또는 음수 등 비-0) 이거나 edited_payload 존재 → 수정으로 친다.
 */
export function isAdoptedAsIs(row: AdoptionRow): boolean {
  const noDistance = row.edit_distance == null || row.edit_distance === 0;
  const noPayload = row.edited_payload == null;
  return noDistance && noPayload;
}

/**
 * 단계(stage)별 채택률 신호 집계.
 *   - 반환 키 = 입력에 등장한 stage 들(없는 stage 는 키 자체가 없음).
 *   - n=0 가드: 빈 입력이면 빈 객체. 각 stage 의 adoptionRate 는 n>0 이 보장된다.
 *   - avgEditDistance 는 edit_distance 가 수치인 행들만의 평균(없으면 0).
 */
export function computeAdoptionSignal(rows: AdoptionRow[]): Record<string, AdoptionStat> {
  // stage 별 누적값(중간 집계). noUncheckedIndexedAccess 대비 — 접근 시 항상 가드.
  const acc: Record<string, { n: number; adoptedAsIs: number; distSum: number; distCount: number }> = {};

  for (const row of rows) {
    const cur = acc[row.stage] ?? { n: 0, adoptedAsIs: 0, distSum: 0, distCount: 0 };
    cur.n += 1;
    if (isAdoptedAsIs(row)) cur.adoptedAsIs += 1;
    if (row.edit_distance != null && Number.isFinite(row.edit_distance)) {
      cur.distSum += row.edit_distance;
      cur.distCount += 1;
    }
    acc[row.stage] = cur;
  }

  const out: Record<string, AdoptionStat> = {};
  for (const stage of Object.keys(acc)) {
    const cur = acc[stage];
    if (!cur) continue; // noUncheckedIndexedAccess 가드(논리상 항상 존재).
    out[stage] = {
      n: cur.n,
      adoptedAsIs: cur.adoptedAsIs,
      adoptionRate: cur.n > 0 ? cur.adoptedAsIs / cur.n : 0,
      avgEditDistance: cur.distCount > 0 ? cur.distSum / cur.distCount : 0,
    };
  }
  return out;
}
