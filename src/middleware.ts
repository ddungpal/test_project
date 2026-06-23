// Supabase SSR 세션 갱신 미들웨어(Phase 5 진짜 인증) — 매 요청마다 만료 임박 세션 토큰을 갱신.
//   ★ 없으면 서버 컴포넌트/액션이 세션을 신뢰성 있게 못 읽는다(@supabase/ssr 요구사항).
//   ★ 여기서 인가는 안 한다(페이지가 requireOwnerPage로 게이트). 미들웨어는 쿠키 갱신만 — edge 런타임.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response; // env 없으면 통과(빌드/프리뷰 안전)

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser()가 만료 임박 토큰을 갱신하고 setAll로 쿠키를 새로 쓴다(인가 판단은 하지 않음).
  await supabase.auth.getUser();
  return response;
}

// 정적 자산·이미지·Inngest 엔드포인트는 제외(세션 갱신 불필요·성능).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/inngest|api/client-error).*)"],
};
