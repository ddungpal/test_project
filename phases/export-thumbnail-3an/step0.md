# Step 0: thumbnail-variants-align

## 배경 (자기완결 — 이 phase의 목적)

직전 phase `script-doc-export`가 대본 문서를 `.md`로 내보낸다(`buildScriptDocMarkdown` + `GET /api/runs/[id]/export`). 실제 김짠부 구글 문서 템플릿(tab t.0 "원본 (일반 스크립트)")과 대조하니 **썸네일 섹션이 다르다**. 이 step은 **썸네일 섹션만** 실제 템플릿에 맞춘다.

### 실제 템플릿의 썸네일 섹션 (맞춰야 할 목표)
```
썸네일

[1안]  메인 : <상단문구> / <하단문구>
       작은 박스1 : <박스1>
       작은 박스2 : <박스2>

[2안]  메인 : … / …
       작은 박스1 : …
       작은 박스2 : …

[3안]  메인 : … / …
       작은 박스1 : …
       작은 박스2 : …
```

### 사용자가 확정한 변경 3가지
1. **메인 = 한 줄, `/`로 연결**: 우리 `thumbnail_main`은 2개(상단 후킹·하단 how)인데, 지금은 `메인 :` 2줄로 낸다 → **`메인 : <상단> / <하단>` 한 줄**로 합친다.
2. **3안 전부**: 우리는 썸네일을 **3후보 중 선택**하므로, 그 **3후보를 `[1안]`/`[2안]`/`[3안]`**으로 전부 넣는다(지금은 선택된 1개만).
3. **더보기란/고정댓글 = 빈칸 유지**: 지금 플레이스홀더 그대로. **변경 없음**.

## 데이터 소재 (확인 완료)

- 썸네일 3후보 = 최신 `stage_proposals`(stage='thumbnail')의 `candidates` 배열(3개).
  - 각 후보: `{ idx, reason, payload, evidence_ids }`. **`candidate.payload.thumbnail_main`**(2개)·**`candidate.payload.thumbnail_boxes`**(2개).
- "최신 proposal" = `getSelectedStagePayload`가 쓰는 것과 동일하게 `created_at desc, limit 1`(재생성으로 proposal이 여러 개면 최신). `src/pipeline/context.ts:getSelectedStagePayload` 참고.

## 읽어야 할 파일

- `src/lib/export/scriptDoc.ts` — 수정 대상. 현재 `ScriptDocInput.thumbnailMain`/`thumbnailBoxes`(단일)와 `thumbnailSection`.
- `src/app/api/runs/[id]/export/route.ts` — 수정 대상. 현재 `getSelectedStagePayload(thumbnail)`로 단일 썸네일을 읽는 부분.
- `src/pipeline/context.ts` — `getSelectedStagePayload`(최신 proposal + candidates 조회 패턴). 3후보 로드에 같은 조회를 재사용.
- `tests/scriptDoc.test.ts` — 인터페이스 변경 반영·[N안] 렌더 케이스로 갱신.
- `corpus/raw/[김짠부] 스크립트-*.md` 1개 — 실제 `[N안]`/`메인 : … / …`/`작은 박스N :` 형식 확인(구조만).

## 작업

### 1) `scriptDoc.ts` — 썸네일 입력을 다중 안으로

`ScriptDocInput`의 단일 썸네일 필드를 **배열**로 교체:
```ts
export interface ScriptDocInput {
  title: string;
  titleAlternates?: string[];
  thumbnails: { main: string[]; boxes: string[] }[]; // 3안(각 main 2·boxes 2). 순서대로 [1안][2안][3안].
  segments: { kind?: string; text: string; payload?: unknown }[];
}
```
`thumbnailSection` 렌더:
- `썸네일` 라벨 아래, 각 안을 `[1안]`/`[2안]`/`[3안]`으로.
- 각 안: **`메인 : ${main.join(" / ")}`** 한 줄 + `작은 박스1 : ${boxes[0]}` + `작은 박스2 : ${boxes[1]}`(있는 만큼·방어).
- `thumbnails`가 비면 라벨만(throw 금지).
- 안 사이 빈 줄로 구분(템플릿처럼).

**나머지 섹션(제목·더보기란/고정댓글·스크립트)·구분선·순서는 건드리지 마라.** 특히 더보기란은 지금 플레이스홀더 그대로.

### 2) `export route` — 3후보 로드

썸네일 읽기를 단일(`getSelectedStagePayload`)에서 **최신 thumbnail proposal의 candidates 3개**로 바꾼다:
- `stage_proposals`에서 `run_id`+`stage='thumbnail'`을 `created_at desc, limit 1`로 조회 → `candidates`.
- 각 candidate의 `payload.thumbnail_main`(→`main`)·`payload.thumbnail_boxes`(→`boxes`)를 뽑아 `{ main, boxes }[]`로 매핑(order 유지 = 후보 순서 = [1안][2안][3안]).
- proposal/candidates 없으면 빈 배열(방어 — 섹션은 라벨만).
- `buildScriptDocMarkdown({ ..., thumbnails })`로 전달. 제목·스크립트 로드는 **그대로**.

### 3) 테스트 갱신

`tests/scriptDoc.test.ts`:
- 새 인터페이스(`thumbnails` 배열)로 갱신.
- `[1안]`/`[2안]`/`[3안]` 라벨 + `메인 : <a> / <b>`(한 줄·슬래시) 렌더 확인.
- 3안 전부 렌더·빈 배열이면 라벨만·박스 부족 방어.

**핵심 규칙:**
- 메인은 반드시 **한 줄·`/` 연결**(2줄 아님).
- 후보 **순서 보존**([1안]=candidates[0]).
- 더보기란/고정댓글·제목·스크립트·구분선·순서 **무변경**.
- 순수 함수 유지(scriptDoc.ts에 DB/fetch 없음). route만 DB 읽기.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```
- 빌드가 stale `.next`로 깨지면 `rm -rf .next` 후 재판별.

## 검증 절차

1. AC 실행.
2. git diff가 `scriptDoc.ts`·`export/route.ts`·`scriptDoc.test.ts`만 잡히는지.
3. 메인 한 줄·3안·더보기란 무변경 확인.
4. `git status`로 범위 외 untracked(fixtures 등) 제외.
5. `phases/export-thumbnail-3an/index.json` step 0 갱신(완료 → completed + summary / 실패 → error).

## 금지사항

- 제목·더보기란/고정댓글·스크립트 섹션·구분선·섹션 순서를 바꾸지 마라(썸네일 섹션만).
- 메인을 2줄로 내지 마라(한 줄·`/`).
- `scriptDoc.ts`에 DB/fetch import하지 마라(순수 유지). route가 데이터 로드.
- 마이그·의존성 추가 금지. 기존 테스트를 깨뜨리지 마라.
