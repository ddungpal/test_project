// 섹션 격리 생성(scribeSectionStep) 연속성 꼬리 — 순수 헬퍼(supabase/llm import 없음).
//   섹션을 하나씩 격리 생성할 때, 직전까지 작성된 대본의 '끝부분'을 다음 섹션 호출에 넘겨
//   김짠부 구어체로 자연스럽게 이어쓰게 한다(prior_tail). scriptCell이 import해 각 섹션 루프에서 호출.
//   ★ 컴포넌트가 아닌 순수 모듈에 둔다(rules.md: vitest에 @/ alias 없음 — 순수 헬퍼는 src/lib에).

// 마지막 N자만큼의 prose 연속성 꼬리를 만든다.
//   - prose text 위주로 순서대로 이어붙이고(블록 kind=table/case/visual은 건너뜀 — 짧은 제목/라벨이라 부적합),
//     뒤에서부터 채워 maxChars를 넘으면 앞을 자른다(끝부분이 남아야 이어쓰기가 자연스럽다).
//   - 첫 섹션이면 segments가 비어 빈 문자열을 반환한다.
export function buildPriorTail(
  segments: { text: string; kind?: string }[],
  maxChars: number,
): string {
  if (maxChars <= 0) return "";
  // prose(또는 kind 미지정=하위호환)만 남긴다 — 블록 세그먼트는 연속성 꼬리에서 제외.
  const proseTexts = segments
    .filter((s) => !s.kind || s.kind === "prose")
    .map((s) => s.text)
    .filter((t) => typeof t === "string" && t.length > 0);
  if (proseTexts.length === 0) return "";

  // 순서를 보존해 이어붙인 뒤, 끝에서 maxChars만 남긴다(앞을 자른다).
  const joined = proseTexts.join("\n");
  if (joined.length <= maxChars) return joined;
  return joined.slice(joined.length - maxChars);
}
