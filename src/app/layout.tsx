import type { Metadata } from "next";
import "./globals.css";
import { getOwnerId, isDevBypass } from "@/app/actions/auth";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "produce script — 제작 동료 AI",
  description: "김짠부 콘텐츠 제작 5단계를 보조하는 AI 크루 대시보드",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 실 세션 owner면 로그아웃 노출(바이패스는 로그아웃 의미 없어 숨김).
  const [ownerId, devBypass] = await Promise.all([getOwnerId(), isDevBypass()]);
  const showSignOut = !!ownerId && !devBypass;

  return (
    <html lang="ko">
      <body>
        <header className="border-b border-trus-white/15">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <a href="/" className="flex items-baseline gap-2">
              <span className="text-trus-yellow text-lg font-black tracking-tight">produce script</span>
              <span className="text-xs text-trus-white/50">제작 동료 AI</span>
            </a>
            <nav className="flex gap-4 text-xs font-bold tracking-widest uppercase text-trus-white/60">
              <a href="/" className="hover:text-trus-yellow">
                런
              </a>
              <a href="/insights" className="hover:text-trus-yellow">
                인사이트
              </a>
              <a href="/copy-learn" className="hover:text-trus-yellow">
                문구 학습
              </a>
              <a href="/audit" className="hover:text-trus-yellow">
                감사
              </a>
              {showSignOut && <SignOutButton />}
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
