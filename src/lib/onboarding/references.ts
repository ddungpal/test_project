// 쏙이 필수 시청 레퍼런스 — 순수 헬퍼(썸네일 URL 빌더). throw 0, 부작용 0.
//   순수 헬퍼는 src/lib/**에 둔다(vitest @/ alias 없음 함정 — 컴포넌트는 import만).

/** videoId로 유튜브 mqdefault 썸네일 URL을 만든다(있으면 표시·onError로 깨지면 컴포넌트가 숨김). */
export function ytThumbUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}
