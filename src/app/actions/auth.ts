// Server Action 인증 가드(코드리뷰 P0) — service-role(RLS 우회) 쓰기 전에 호출자가 owner인지 검증.
//   SSR 클라이언트(anon+세션쿠키)로 세션 사용자 확인 → profiles.role='owner'만 통과.
//   파이프라인 코드(스크립트/Inngest)는 이 가드를 안 거치지만, 그건 서버 내부 신뢰 경로다.
import "server-only"; // admin(service-role) import 모듈 — 클라 번들 유입 시 빌드 타임 차단.
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server.js";
import { createAdminClient } from "../../lib/supabase/admin.js";

// 개발용 owner 바이패스(Phase 3·결정 a) — 로컬·단독 owner·$0 개발에서 로그인 UI 없이
//   대시보드 액션을 풀기 위함. 시드된 owner(profiles.role='owner') id를 반환한다.
//   ⚠️ 프로덕션 절대 금지 — 배포 전 진짜 Supabase 인증 와이어링 필요(Phase 5 하드닝).
//   이중 가드: 플래그 ON + NODE_ENV!=='production' 둘 다일 때만 동작.
let devOwnerIdCache: string | null = null;
function devBypassEnabled(): boolean {
  return process.env.DEV_OWNER_BYPASS === "1" && process.env.NODE_ENV !== "production";
}
async function getDevOwnerId(): Promise<string> {
  if (devOwnerIdCache) return devOwnerIdCache;
  const supa = createAdminClient();
  const { data, error } = await supa.from("profiles").select("id").eq("role", "owner").limit(1).maybeSingle();
  if (error) throw new Error(`DEV 바이패스 owner 조회 실패: ${error.message}`);
  if (!data) throw new Error("DEV 바이패스: role='owner' 프로필이 없음(seed-owner 먼저 실행).");
  devOwnerIdCache = data.id;
  return data.id;
}

/** 대시보드 표시용 — 바이패스 여부(서버에서만 호출). 배너 노출에 사용. */
export async function isDevBypass(): Promise<boolean> {
  return devBypassEnabled();
}

/** 세션 owner id를 해석 — 바이패스 or 실인증(세션→profiles.role='owner'). 미인증/비owner면 null(throw 안 함). */
async function resolveOwnerId(): Promise<string | null> {
  if (devBypassEnabled()) return getDevOwnerId();

  const supa = await createSupabaseServerClient();
  const { data: auth, error } = await supa.auth.getUser();
  if (error || !auth?.user) return null;
  const { data: profile, error: pe } = await supa.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (pe || profile?.role !== "owner") return null;
  return auth.user.id;
}

/** 미인증/비owner 여부(로그인 화면 표시 등). */
export async function getOwnerId(): Promise<string | null> {
  return resolveOwnerId();
}

/** Server Action 가드 — service-role 쓰기 전. 미인증이면 throw(액션 실패). */
export async function requireOwner(): Promise<string> {
  const id = await resolveOwnerId();
  if (!id) throw new Error("owner 인증이 필요합니다.");
  return id;
}

/** 페이지(서버 컴포넌트) 가드 — 미인증이면 /login으로 리다이렉트(에러 대신 우아하게). */
export async function requireOwnerPage(): Promise<string> {
  const id = await resolveOwnerId();
  if (!id) redirect("/login");
  return id;
}
