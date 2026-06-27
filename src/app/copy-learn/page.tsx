import { getCopyLearnVideos, getCopyStyleDrafts, getCorrections, getStructureProfiles } from "@/lib/dashboard/copyLearnView";
import { isDevBypass, requireOwnerPage } from "@/app/actions/auth";
import { CopyLearningForm } from "@/components/CopyLearningForm";

// 문구 학습 입력 화면(copy-learning-admin step2) — owner가 영상별 썸네일·제목 A/B + CTR(24h)를 입력→저장,
//   재학습 트리거→draft 검수→component별 활성화. 서버 컴포넌트: 매 요청 최신 DB(insights/page.tsx 패턴).
export const dynamic = "force-dynamic";

export default async function CopyLearnPage() {
  await requireOwnerPage();
  const [videos, drafts, corrections, structure, devBypass] = await Promise.all([
    getCopyLearnVideos(),
    getCopyStyleDrafts(),
    getCorrections(),
    getStructureProfiles(),
    isDevBypass(),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      {devBypass && (
        <div className="mb-6 border border-trus-yellow/40 px-3 py-2 text-xs text-trus-yellow/80">
          ⚠ 개발용 owner 바이패스 활성 — 로그인 없이 owner 권한으로 동작 중. 배포 전 진짜 인증 필요.
        </div>
      )}

      <h1 className="text-3xl font-black leading-tight">
        문구 <span className="text-trus-yellow">학습</span>
      </h1>
      <p className="mt-2 text-sm text-trus-white/60">
        영상별 썸네일·제목 A/B와 <b className="text-trus-white">CTR(24h)</b>을 입력하면, 재학습이 카피 스타일 초안을 만든다.
        검토 후 <b className="text-trus-white">직접 활성화</b>한 것만 다음 제작에 반영된다.
      </p>

      <CopyLearningForm videos={videos} drafts={drafts} corrections={corrections} structure={structure} />
    </main>
  );
}
