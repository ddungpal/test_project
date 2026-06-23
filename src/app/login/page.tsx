import { redirect } from "next/navigation";
import { getOwnerId, isDevBypass } from "@/app/actions/auth";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

// 로그인(Phase 5 진짜 인증) — 구글 OAuth 전용. 이미 owner면 대시보드로.
export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  oauth: "구글 로그인에 실패했습니다. 다시 시도해 주세요.",
  denied: "이 계정은 접근 권한이 없습니다(owner 전용).",
  owner: "owner 권한 설정 중 오류가 발생했습니다.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // 이미 인증된 owner(또는 바이패스)면 로그인 화면 건너뜀.
  if (await getOwnerId()) redirect("/");
  const devBypass = await isDevBypass();
  const { error } = await searchParams;
  const errorMsg = error ? (ERROR_MESSAGES[error] ?? "로그인 중 오류가 발생했습니다.") : null;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-black leading-tight">
        제작 동료 <span className="text-trus-yellow">로그인</span>
      </h1>
      <p className="mt-2 text-sm text-trus-white/60">owner 구글 계정으로 로그인하세요.</p>

      {errorMsg && (
        <p className="mt-4 border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-300">{errorMsg}</p>
      )}

      {devBypass ? (
        <p className="mt-8 border border-trus-yellow/40 px-3 py-2 text-xs text-trus-yellow/80">
          개발용 바이패스가 켜져 있어 로그인 없이 접근됩니다. 이 화면은 바이패스를 끄면 동작합니다.
        </p>
      ) : (
        <div className="mt-8">
          <GoogleSignInButton />
        </div>
      )}
    </main>
  );
}
