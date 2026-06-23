"use client";

import { useTransition } from "react";
import { signOut } from "@/app/actions/session";

// 로그아웃 버튼(Phase 5) — signOut 액션 호출 후 /login 으로 리다이렉트.
export function SignOutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => signOut())}
      disabled={pending}
      className="hover:text-trus-yellow disabled:opacity-50"
    >
      {pending ? "…" : "로그아웃"}
    </button>
  );
}
