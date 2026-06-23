import type { ProposalSource } from "@/lib/dashboard/proposalTypes";

// 제안 생성에 쓴 검색 출처(웹·YouTube) — 토글(<details>)로 숨겼다 열어 원문 확인.
//   순수 컴포넌트(네이티브 토글, JS 불필요). URL은 http/https만 링크(스킴 XSS 차단).
function safeHref(u: string): string | null {
  try {
    const p = new URL(u).protocol;
    return p === "http:" || p === "https:" ? u : null;
  } catch {
    return null;
  }
}

// 한국형 축약 숫자(1234567 → 123.5만).
function fmtCount(n: number | null | undefined): string | null {
  if (n == null) return null;
  if (n >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, "")}억`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1).replace(/\.0$/, "")}만`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}천`;
  return String(n);
}

export function SourceLinks({ sources }: { sources: ProposalSource[] }) {
  if (!sources || sources.length === 0) return null;
  const webN = sources.filter((s) => s.source === "web").length;
  const ytN = sources.filter((s) => s.source === "youtube").length;

  return (
    <details className="mt-3 border-t border-trus-white/10 pt-2">
      <summary className="cursor-pointer text-xs font-bold text-trus-white/55 hover:text-trus-yellow">
        🔗 검색 출처 {sources.length}개 (웹 {webN} · 유튜브 {ytN}) — 열어서 원문 확인
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5">
        {sources.map((s) => {
          const href = safeHref(s.url);
          return (
            <li key={s.id} className="flex items-start gap-2 text-xs">
              <span
                className={`mt-0.5 shrink-0 border px-1 py-0.5 text-[9px] font-black ${s.source === "youtube" ? "border-trus-yellow text-trus-yellow" : "border-trus-white/30 text-trus-white/50"}`}
              >
                {s.source === "youtube" ? "YT" : "WEB"}
              </span>
              <span className="min-w-0">
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-trus-white/80 underline hover:text-trus-yellow">
                    {s.title || s.url}
                  </a>
                ) : (
                  <span className="text-trus-white/50">{s.title || s.url}</span>
                )}
                {s.publisher && <span className="text-trus-white/35"> · {s.publisher}</span>}
                {s.source === "youtube" && (s.subscriberCount != null || s.viewCount != null) && (
                  <span className="text-trus-white/30">
                    {" ("}
                    {s.subscriberCount != null && `구독 ${fmtCount(s.subscriberCount)}`}
                    {s.subscriberCount != null && s.viewCount != null && " · "}
                    {s.viewCount != null && `조회 ${fmtCount(s.viewCount)}`}
                    {")"}
                  </span>
                )}
                <span className="ml-1 font-mono text-[10px] text-trus-white/25">{s.id}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
