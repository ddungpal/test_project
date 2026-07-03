// 확정 썸네일 손편집을 카드 목록(localItems)에 반영하는 순수 헬퍼.
//   ★ 버그 픽스: PostConfirmThumbnailsEdit는 localItems를 useState(items)로 1회 초기화하고 편집 저장 후
//     router.refresh()만 호출해, 저장은 됐지만(edited_payload) localItems가 안 갱신돼 편집이 화면에 안 보였다.
//     submit에서 이 헬퍼로 편집 카드의 payload를 즉시 갱신한다.
//   편집 카드의 payload에서 메인/박스/레이아웃만 덮어쓰고, 나머지 파생 필드(ref_similarity·topic_missing 등)는 보존.
//   순수·입력 비변형(새 배열/객체 반환). 컴포넌트는 이 함수를 호출만 한다(vitest @/ alias 함정 — 로직은 src/lib에).

export type ThumbEditItem = { idx: number; payload: unknown };

export function applyThumbnailEdit(
  items: ThumbEditItem[],
  editIdx: number,
  edited: { thumbnail_main: string[]; thumbnail_boxes: string[]; thumbnail_layout?: string },
): ThumbEditItem[] {
  return items.map((it) => {
    if (it.idx !== editIdx) return it;
    const base = it.payload && typeof it.payload === "object" ? (it.payload as Record<string, unknown>) : {};
    return {
      ...it,
      payload: {
        ...base,
        thumbnail_main: edited.thumbnail_main,
        thumbnail_boxes: edited.thumbnail_boxes,
        ...(edited.thumbnail_layout ? { thumbnail_layout: edited.thumbnail_layout } : {}),
      },
    };
  });
}
