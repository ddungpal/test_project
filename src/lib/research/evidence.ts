// 리서치 근거 토글 순수 헬퍼 — 표시 계산만(DOM·서버 무관, 부작용 0).
//   ① pendingFactCount: '확인 필요' 배지에 쓸 pending fact 개수.
//   ② unusedResearch: 어느 세그먼트에도 안 쓰인 rv fact·asset id 집합(하단 "안 쓰인 리서치" 토글용).
//   둘 다 입력을 변형하지 않는다(비변형).

/** pending===true 인 fact 개수. pending 필드 없는 원소는 세지 않는다(방어). */
export function pendingFactCount(facts: { pending?: boolean }[]): number {
  let n = 0;
  for (const f of facts) if (f.pending === true) n++;
  return n;
}

/**
 * 세그먼트 어디에도 안 쓰인 rv fact·asset id 집합 = rv 전체 − 모든 세그먼트 fact/asset id union.
 * 입력(rv·segments) 비변형.
 */
export function unusedResearch(
  rv: { facts: { id: string }[]; assets: { id: string }[] },
  segments: { facts: { id: string }[]; assets: { id: string }[] }[],
): { factIds: Set<string>; assetIds: Set<string> } {
  const usedFacts = new Set<string>();
  const usedAssets = new Set<string>();
  for (const seg of segments) {
    for (const f of seg.facts) usedFacts.add(f.id);
    for (const a of seg.assets) usedAssets.add(a.id);
  }

  const factIds = new Set<string>();
  for (const f of rv.facts) if (!usedFacts.has(f.id)) factIds.add(f.id);

  const assetIds = new Set<string>();
  for (const a of rv.assets) if (!usedAssets.has(a.id)) assetIds.add(a.id);

  return { factIds, assetIds };
}
