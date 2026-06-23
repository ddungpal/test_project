"use client";
// 구글 로그인 버튼 — Supabase OAuth(PKCE). 브라우저 클라이언트가 구글 인증으로 리다이렉트하고,
//   돌아올 때 /auth/callback 라우트가 코드를 세션으로 교환한다(owner 이메일이면 owner 승격).
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function GoogleSignInButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      const supa = createSupabaseBrowserClient();
      const { error } = await supa.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { access_type: "offline", prompt: "select_account" },
        },
      });
      if (error) {
        setError("구글 로그인 시작 실패 — 잠시 후 다시 시도하세요.");
        setLoading(false);
      }
      // 성공 시 브라우저가 구글로 이동(아래 코드 도달 안 함).
    } catch {
      setError("구글 로그인을 시작할 수 없습니다.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-bold text-black transition hover:bg-white/90 disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.9 2.6 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-17z" />
          <path fill="#FBBC05" d="M10.4 28.3c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8l-7.8-6.1C.9 16 0 19.9 0 24s.9 8 2.6 11.4l7.8-6.1z" />
          <path fill="#34A853" d="M24 48c6.4 0 11.8-2.1 15.7-5.8l-7.1-5.5c-2 1.3-4.5 2.1-8.6 2.1-6.4 0-11.8-3.7-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
        {loading ? "이동 중…" : "Google로 로그인"}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
