// 케이스 분기(case) 자산 정규화 — 순수·결정적. DB·LLM·I/O 의존 없음(단위 테스트 가능).
//   case-miner(또는 데모시드)가 준 분기 payload를 explanation_assets.payload 적재 가능한 형태로 정규화한다.
//   money-safety: 깨졌거나 알 수 없는 payload는 절대 throw하지 않고 null을 반환한다(=이 자산 드랍).
//     깨진 케이스가 대본에 박제되거나, 적재 파이프라인이 한 자산 때문에 통째로 죽지 않게.
//   stray 흡수: 명시 필드만 추려 반환하고 알 수 없는 추가 필드는 버린다(comparisonAsset.ts 철학 미러).
//   ⚠ 이 모듈은 P4 case-branching의 데이터 레일 — 생성(case-miner)=step1, 짠펜 연결=step2, UI=step3.

export interface CaseBranch {
  condition: string; // 분기 조건(예: "월급이 일정하면")
  outcome: string; // 그 조건에서의 결과(예: "자동이체로 선저축")
  grounded: boolean; // 이 분기가 검증된 fact에 근거하는가(false면 화면/대본에서 '확인 필요'로 표기)
}
export interface CaseAssetPayload {
  intro?: string;
  branches: CaseBranch[]; // 조건→결과 분기 ≥2
}

/**
 * case-miner(또는 데모시드)가 준 분기 payload를 적재 가능한 형태로 정규화한다.
 * 구조가 깨졌으면 null을 반환한다(=이 자산 드랍 — 깨진 케이스가 대본에 박제되지 않게). throw 금지.
 */
export function normalizeCaseAsset(payload: unknown): CaseAssetPayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;

  // branches가 배열이 아니면 드랍.
  if (!Array.isArray(p.branches)) return null;

  const branches: CaseBranch[] = [];
  for (const b of p.branches) {
    if (typeof b !== "object" || b === null) continue;
    const bb = b as Record<string, unknown>;
    // condition·outcome가 둘 다 string이어야 유효. 아니면 그 branch만 버린다(comparison cell 미러).
    if (typeof bb.condition !== "string" || typeof bb.outcome !== "string") continue;
    // grounded는 boolean이 아니면 false 폴백(보수적 — 미검증 취급).
    branches.push({
      condition: bb.condition,
      outcome: bb.outcome,
      grounded: bb.grounded === true,
    });
  }

  // 유효 분기 2개 미만이면 드랍(분기 1개는 케이스가 아니다).
  if (branches.length < 2) return null;

  const out: CaseAssetPayload = { branches };
  if (typeof p.intro === "string") out.intro = p.intro;
  return out;
}
