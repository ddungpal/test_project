// 썸네일 캔버스 — 김짠부/TRUS Create 스타일 HTML/CSS 템플릿.
//   16:9 고정 · 인물 슬롯(placeholder) · 메인 카피 자동배치 · 강조어 노랑 하이라이트.
//   색은 검정/노랑/흰 3색만. 격동고딕2(font-sans). 그림자·그라데이션 금지. radius 0.
//   순수 표시 컴포넌트(상태·서버호출 없음) → 서버/클라 양쪽에서 사용 가능.
//
//   props 하위호환: { copy, layout } 시그니처 유지.
//     copy = 썸네일 문구(단일 문자열). 줄바꿈은 줄 분리, [대괄호]는 강조 하이라이트로 결정적 파싱.
//     layout = 레이아웃 설명(캡션). 있으면 캔버스 아래 작게 표시.

// 한 줄 내에서 [강조] 마커를 노랑 하이라이트 조각으로 분해. 마커 없으면 통째로 일반 조각.
//   정규식은 비탐욕·결정적. 마커 깨져도(짝 안 맞음) 리터럴로 흘러가 크래시 없음.
function splitEmphasis(line: string): { text: string; emphasis: boolean }[] {
  const parts: { text: string; emphasis: boolean }[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) parts.push({ text: line.slice(last, m.index), emphasis: false });
    parts.push({ text: m[1] ?? "", emphasis: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ text: line.slice(last), emphasis: false });
  return parts;
}

export function ThumbnailCanvas({ copy, layout }: { copy: string; layout?: string }) {
  // 결정적 파싱: 줄바꿈 분리 → 빈 줄 제거. 전부 비면 placeholder.
  const lines = (copy ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const hasCopy = lines.length > 0;

  return (
    <div>
      <div className="relative flex aspect-video w-full overflow-hidden border border-trus-white/20 bg-trus-black">
        {/* 인물 슬롯 — 김짠부 구도상 한쪽에 인물 자리(이미지 없어도 자리/구도 유지). */}
        <div
          className="relative hidden w-[38%] shrink-0 border-r border-trus-white/15 bg-trus-white/[0.04] sm:block"
          aria-hidden="true"
        >
          {/* 인물 placeholder: 어깨선 실루엣 느낌의 각진 기하(radius 0 · 이미지 합성은 별도 단계). */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
            <span className="mb-1 aspect-square w-[32%] border-2 border-trus-white/20" />
            <span className="h-[24%] w-[58%] border-2 border-b-0 border-trus-white/20" />
          </div>
          <span className="absolute left-2 top-2 text-[9px] font-bold uppercase tracking-widest text-trus-white/25">
            인물
          </span>
        </div>

        {/* 카피 영역 — 큼직하게 자동 배치(줄 수에 따라 크기 자동 축소). 좌측 노랑 바로 강조. */}
        <div className="relative flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-3 py-3 sm:px-4">
          {/* 노란 모서리 강조(그림자·그라데이션 금지). */}
          <span className="pointer-events-none absolute left-0 top-0 h-5 w-5 border-l-4 border-t-4 border-trus-yellow" />
          <span className="pointer-events-none absolute bottom-0 right-0 h-5 w-5 border-b-4 border-r-4 border-trus-yellow" />

          {!hasCopy ? (
            <p className="text-center text-sm font-bold text-trus-white/30">카피 없음</p>
          ) : (
            <div
              className={
                // 줄 수가 많을수록 한 단계 작게(긴 카피도 안 깨지게).
                lines.length >= 4
                  ? "text-base font-black leading-[1.05] tracking-tight sm:text-lg"
                  : lines.length === 3
                    ? "text-lg font-black leading-[1.05] tracking-tight sm:text-xl"
                    : "text-xl font-black leading-[1.05] tracking-tight sm:text-2xl"
              }
            >
              {lines.map((line, li) => (
                <p key={li} className="break-keep text-trus-white">
                  {splitEmphasis(line).map((seg, si) =>
                    seg.emphasis ? (
                      <mark
                        key={si}
                        className="box-decoration-clone bg-trus-yellow px-1 text-trus-black"
                      >
                        {seg.text}
                      </mark>
                    ) : (
                      <span key={si}>{seg.text}</span>
                    ),
                  )}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
      {layout && <p className="mt-1 text-xs leading-snug text-trus-white/45">레이아웃: {layout}</p>}
    </div>
  );
}
