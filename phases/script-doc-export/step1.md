# Step 1: export-download-route

## 배경 (자기완결)

step 0의 `buildScriptDocMarkdown`(순수 조립)을 실제 런 데이터에 연결하고, 대본이 완성된 런에서 **`.md` 파일을 다운로드**하는 route + 버튼을 만든다. 사용자는 받은 `.md`를 구글 문서로 가져와 확인한다.

## 읽어야 할 파일

- `src/lib/export/scriptDoc.ts` (step 0) — `buildScriptDocMarkdown`·`ScriptDocInput`.
- `src/pipeline/context.ts` — `getSelectedStagePayload(supa, runId, stage)`(제목: `title_thumb` payload의 `.title`·`.alternates`).
- `src/app/runs/[id]/page.tsx` — **확정 썸네일을 화면이 어떻게 읽어 표시하는지** 찾아 그 읽기 경로를 재사용(썸네일은 슬롯 구조 — `thumbnail` stage / `thumbnailSlot` / getSelectedStagePayload 중 UI가 쓰는 것). `thumbnail_main`·`thumbnail_boxes`를 얻는다. **script_review/approved 상태 분기**(버튼 놓을 위치)도 확인.
- `src/pipeline/scriptCell.ts` — `script_segments` 조회 형태(ord 순·kind·text·payload). 같은 방식으로 읽는다.
- `src/app/api/inngest/route.ts` — Next.js route handler 패턴(App Router).
- `src/app/actions/auth.ts` — `requireOwner()`.
- `src/lib/supabase/admin.ts` — `createAdminClient()`.

## 작업

### 1) 다운로드 route handler

**신규** `src/app/api/runs/[id]/export/route.ts` (GET):
- `requireOwner()`(오너만).
- runId로 조립 입력 수집:
  - 제목: `getSelectedStagePayload(supa, runId, "title_thumb")` → `.title`(+`.alternates`).
  - 썸네일: 위 page.tsx가 쓰는 읽기 경로 재사용 → `thumbnail_main`·`thumbnail_boxes`.
  - 스크립트: `script_segments`를 `run_id`로 조회, `ord` 오름차순, `{ kind, text, payload }`.
- `buildScriptDocMarkdown(...)` 호출 → 마크다운 문자열.
- `Response`로 반환: `Content-Type: text/markdown; charset=utf-8`, `Content-Disposition: attachment; filename="<safe(제목)>.md"`.
  - 파일명 안전화: 제목에서 파일명 불가 문자(`/ \ : * ? " < > |` 등) 제거·공백 정리. 제목 없으면 `script-<runId 앞8>.md`.
- 세그먼트가 없으면(대본 미완) 400 또는 안내 메시지(방어).

### 2) 내보내기 버튼 (UI)

- `src/app/runs/[id]/page.tsx`의 **대본이 있는 상태**(script_review·approved) 뷰에 **"구글 문서용 내보내기"** 버튼/링크 추가.
- 구현: `<a href={`/api/runs/${runId}/export`} download>` 또는 버튼 클릭 → 해당 URL로 이동(브라우저가 다운로드). 서버 액션이 아니라 **route 다운로드**라 `<a download>`가 가장 단순.
- 보조 안내 한 줄: "제목·썸네일·더보기란(빈칸)·스크립트를 김짠부 문서 구조로 내려받아 구글 문서로 가져오세요."
- TRUS Create 토큰만(3색·신규 색/그림자/그라데이션·이모지 금지).

**핵심 규칙:**
- 오너 검증(`requireOwner`) 필수 — 스크립트 원문은 민감(거버넌스). 비오너 접근 차단.
- 썸네일 읽기는 **page.tsx가 이미 쓰는 경로를 재사용**한다(새 조회 로직 재발명 금지 — 어긋나면 확정본과 다른 썸네일이 나온다).
- `buildScriptDocMarkdown`(step 0)을 그대로 호출만 — 조립 로직을 route에 다시 쓰지 마라.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```
- 빌드가 stale `.next`로 깨지면 `rm -rf .next` 후 재판별.
- 실제 다운로드·구글 문서 가져오기는 라이브라 AC 아님 — route 타입·빌드·기존 테스트로 검증. 순수 조립은 step 0 테스트가 커버.

## 검증 절차

1. AC 실행.
2. 버튼이 대본 있는 상태(script_review/approved)에만 뜨는지·다운로드 링크가 export route를 가리키는지.
3. route가 `requireOwner`·`Content-Disposition attachment`·안전 파일명을 갖는지.
4. `git status`로 범위 외 untracked 제외.
5. `phases/script-doc-export/index.json` step 1 갱신(완료 → completed + summary / 실패 → error).

## 금지사항

- 조립 로직을 route에 중복 구현하지 마라(step 0 `buildScriptDocMarkdown` 호출만).
- 썸네일 확정본 읽기를 새로 만들지 마라(page.tsx 경로 재사용).
- `requireOwner` 생략 금지(민감 원문 보호).
- 더보기란/고정댓글 자동 생성 금지(빈 칸).
- 신규 색/그림자/이모지 금지(TRUS Create). 마이그·의존성 추가 금지. 기존 테스트 깨뜨리지 마라.
