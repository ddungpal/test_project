// 썸네일 캔버스(초안) — TRUS 3색·격동고딕·각진. 실사진 합성은 별도(Codex 검토: canvas는 초안).
//   copy=썸네일에 박을 문구. 16:9 박스에 큼직하게. layout 설명은 캡션으로.
//   순수 표시 컴포넌트(상태 없음) → 서버/클라 양쪽에서 사용 가능.
export function ThumbnailCanvas({ copy, layout }: { copy: string; layout?: string }) {
  return (
    <div>
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden border border-trus-white/20 bg-trus-black p-4">
        {/* 노란 모서리 강조(그림자·그라데이션 금지) */}
        <span className="absolute left-0 top-0 h-6 w-6 border-l-4 border-t-4 border-trus-yellow" />
        <span className="absolute bottom-0 right-0 h-6 w-6 border-b-4 border-r-4 border-trus-yellow" />
        <p className="text-center text-2xl font-black leading-tight tracking-tight text-trus-white sm:text-3xl">
          {copy}
        </p>
      </div>
      {layout && <p className="mt-1 text-xs leading-snug text-trus-white/45">레이아웃: {layout}</p>}
    </div>
  );
}
