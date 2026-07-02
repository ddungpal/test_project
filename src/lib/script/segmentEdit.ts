import type { SegmentKind } from "../../pipeline/segmentBlock.js";

// 세그먼트가 프로즈(직접 텍스트 수정 대상)인지 판정(순수) — 컴포넌트와 분리해 vitest(alias 미설정)에서
//   .js 상대경로로 단위 테스트 가능하게 둔다. 블록(table/case/visual)은 내용이 payload에 있어 text 직접수정 무의미.
//   판정 = payload가 있고 kind가 블록이면 블록, 그 외(프로즈/null 폴백)는 프로즈. SegmentBody의 렌더 분기와 동일 규칙.
const BLOCK_KINDS: readonly SegmentKind[] = ["table", "case", "visual"];

export function isProseSegment(seg: { kind: SegmentKind; payload: unknown }): boolean {
  return !(seg.payload !== null && BLOCK_KINDS.includes(seg.kind));
}
