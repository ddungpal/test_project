// 완성된 런의 제목·썸네일·더보기란(빈칸)·스크립트를 김짠부 구글 문서용 .md로 내려주는 다운로드 route.
//   조립은 step0 buildScriptDocMarkdown이 전담 — 이 route는 데이터만 모아 호출한다(중복 구현 금지).
//   민감 원문 보호: requireOwner 필수(맨 앞).

import { requireOwner } from "@/app/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSelectedStagePayload } from "@/pipeline/context";
import { getScriptView } from "@/lib/dashboard/scriptView";
import { buildScriptDocMarkdown } from "@/lib/export/scriptDoc";

// 배열이면 문자열만, 아니면 빈 배열로 강등(scriptDoc thumbnailSection이 forEach → undefined 금지).
function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireOwner(); // 민감 원문 보호·거버넌스. 맨 앞.
  const { id: runId } = await params;
  const supa = createAdminClient();

  // 제목(title_thumb = 역사적 이름, 현재 '제목 전용').
  const titlePayload = (await getSelectedStagePayload(supa, runId, "title_thumb")) as
    | { title?: string; alternates?: string[] }
    | null;
  const title = titlePayload?.title ?? "";
  const titleAlternates = Array.isArray(titlePayload?.alternates)
    ? titlePayload.alternates.filter((x): x is string => typeof x === "string")
    : undefined;

  // 썸네일: 확정 시 A/B/C 배열(edited_payload) 또는 단일 후보 payload. 대표 = 첫 번째.
  const thumbSel = await getSelectedStagePayload(supa, runId, "thumbnail");
  const first = Array.isArray(thumbSel) ? thumbSel[0] : thumbSel;
  const firstObj = (first ?? {}) as Record<string, unknown>;
  const thumbnailMain = toStringArray(firstObj.thumbnail_main);
  const thumbnailBoxes = toStringArray(firstObj.thumbnail_boxes);

  // 스크립트(getScriptView가 이미 ord 순 정렬).
  const segs = await getScriptView(runId);
  if (segs.length === 0) {
    return new Response("대본이 아직 없습니다.", { status: 400 });
  }
  const segments = segs.map((s) => ({ kind: s.kind, text: s.text, payload: s.payload }));

  const md = buildScriptDocMarkdown({
    title,
    ...(titleAlternates ? { titleAlternates } : {}),
    thumbnailMain,
    thumbnailBoxes,
    segments,
  });

  // 파일명 안전화: 파일명 불가 문자·제어문자 제거·공백 정리. 비면 runId 슬러그.
  //   한글이 Content-Disposition에서 안 깨지게 ASCII 폴백 + filename*=UTF-8'' 둘 다 준다.
  const safe = title.replace(/[/\\:*?"<>|\x00-\x1f]/g, "").replace(/\s+/g, " ").trim() || `script-${runId.slice(0, 8)}`;
  const fileName = `${safe}.md`;
  const asciiFallback = `script-${runId.slice(0, 8)}.md`;

  return new Response(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
