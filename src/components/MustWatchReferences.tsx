"use client";

import { safeHref } from "@/components/FactCard";
import { ytThumbUrl } from "@/lib/onboarding/references";

// 쏙이 궁금증 아크 근거가 된 레퍼런스 3개 — "필수 시청 유튜브 영상" 패널(스크립트 위).
//   client 컴포넌트: img onError로 깨진 썸네일 숨김 방어(서버 컴포넌트에선 이벤트 핸들러 불가).
//   refs 비면 null(패널 자체 안 그림 — 온보딩 안 한 런 영향 0). 링크는 safeHref로 감싼다(js: 등 스킴 차단).
//   TRUS 3색만(Black #121212 / Yellow #F8F082 / White) — trus-* 클래스, 기존 border 패턴 재사용.
export function MustWatchReferences({
  refs,
  heading = "📺 필수 시청 유튜브 영상",
}: {
  refs: {
    title: string;
    url: string;
    videoId: string;
    viewCount?: number | null;
    subscriberCount?: number | null;
  }[];
  heading?: string; // 기본은 스크립트 단계 문구. done 화면 등에서 문구 구분 시 넘긴다(default = 기존 호출부 바이트 동일).
}) {
  if (refs.length === 0) return null;
  return (
    <section className="mt-8 border border-trus-yellow/50 p-4">
      <h2 className="text-trus-yellow text-xs font-bold tracking-widest uppercase">
        {heading}
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {refs.map((ref, i) => {
          const href = safeHref(ref.url);
          const thumb = (
            <img
              src={ytThumbUrl(ref.videoId)}
              alt=""
              width={120}
              className="shrink-0 border border-trus-white/15"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          );
          // "잘 전달된 영상인지" 판단용 공개 통계 — 값 있는 것만 표시(구버전 아크·null이면 생략).
          const stats = [
            ref.viewCount != null && Number.isFinite(ref.viewCount)
              ? `조회수 ${ref.viewCount.toLocaleString("ko-KR")}회`
              : null,
            ref.subscriberCount != null && Number.isFinite(ref.subscriberCount)
              ? `구독자 ${ref.subscriberCount.toLocaleString("ko-KR")}명`
              : null,
          ].filter(Boolean);
          const title = (
            <span className="flex flex-col gap-0.5">
              <span className="text-sm text-trus-white/85">{ref.title}</span>
              {stats.length > 0 && (
                <span className="text-xs text-trus-white/50">{stats.join(" · ")}</span>
              )}
            </span>
          );
          return (
            <li key={i} className="flex items-center gap-3">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 hover:text-trus-yellow"
                >
                  {thumb}
                  {title}
                </a>
              ) : (
                <>
                  {thumb}
                  {title}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
