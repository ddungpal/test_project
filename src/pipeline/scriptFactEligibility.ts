// 짠펜(스크립트 셀) fact 적격성·보류 판별 — 순수함수(Supa 의존 0, 단위테스트 친화).
//   autoflow(research-autoflow §B·§D): 고위험 fact는 리서치 중간 검수 없이 human_approved=null(보류)로
//   스크립트까지 운반된다. 짠펜은 이 보류 fact도 본문에 써야 Phase 2 최종검수가 채워진다.
//   ★ 적격성: human_approved !== false (= true 또는 null 허용, false=명시 반려만 배제).
//   ★ 보류('확인 필요'): escalated_to_human === true && human_approved === null.
//     Phase 2가 lineage 조인 → research_facts에서 이 술어로 "확인 필요" 칩을 그린다(재사용 위해 export).

/** 적격성·보류 판별에 필요한 최소 fact 모양(scriptCell의 select 컬럼 부분집합). */
export interface FactEligibilityFields {
  human_approved: boolean | null;
  escalated_to_human: boolean;
}

/** 짠펜이 대본에 쓸 수 있는 fact인가 — 명시 반려(human_approved=false)만 배제, true/null은 허용. */
export function isFactUsableForScript(f: FactEligibilityFields): boolean {
  return f.human_approved !== false;
}

/** 보류('확인 필요') fact인가 — 에스컬레이션됐는데 아직 사람 최종확인 전(null). Phase 2 칩 판별에 재사용. */
export function isFactPending(f: FactEligibilityFields): boolean {
  return f.escalated_to_human === true && f.human_approved === null;
}
