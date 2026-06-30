# Step 0: scribe-visual-cues

스크립트 품질 로드맵 **P5(`visual-cues`)의 짠펜 레이어** — 로드맵의 **마지막 phase**. 짠펜이 대본의 적절한 지점에 **시각 큐**(자막 핵심문구·화면 캡처·표/그래프 위치)를 `kind='visual'` 세그먼트로 emit하도록 한다. 김짠부 영상의 자막·화면 연출을 대본 단계에서 미리 제안하는 것.

## 배경 (P1·P2에서 이어짐 — 레일은 이미 있다)

- **P1**(완료): `SegmentKind`에 `'visual'`, `VisualPayload {cue, note?}`, 순수 `normalizeVisual`(cue 없으면 폴백), `SegmentList`의 `VisualBlock`(화면 배지 + cue + note 렌더). **즉 visual 세그먼트를 적재·렌더하는 레일은 100% 완성.**
- **P2**(완료): `SCRIBE_SCHEMA`의 segment `kind` enum에 이미 `'visual'` 포함, `payload`는 loose(object). **즉 스키마도 visual을 이미 허용.**
- **빠진 것 단 하나**: `SCRIBE_SYSTEM`이 table/case/explain만 지시하고 **visual 큐 emit은 지시하지 않는다** → 짠펜이 시각 큐를 전혀 만들지 않는다. 이 step이 그 지시를 추가한다.
- **중요**: 시각 큐는 **표현용(연출)** 이다 — 사실 단정이 아니므로 **검증·money-safety·새 에이전트·DB·리서치 데이터가 필요 없다**. P3/P4와 달리 짠펜 SYSTEM + (선택)정규화 + UI 폴리시만.

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·크루(짠펜=스크립트)·TRUS·이모지/사색톤 금지.
- `src/pipeline/segmentBlock.ts` **20~21행**(`VisualPayload`)·**59~66행**(`normalizeVisual`). 이 step에서 optional `cueType`을 더한다.
- `src/agents/scribe/schema.ts` — `SCRIBE_SCHEMA`(segment kind enum에 visual 이미 포함·payload loose) + `SCRIBE_SYSTEM`(P2의 table/case/explain 지시 — 여기에 visual 지시 추가). **schema는 변경 불필요**(이미 visual 허용) — SYSTEM만.
- `src/components/SegmentList.tsx` **107~** `VisualBlock`(현재 cue/note 렌더 — cueType UI는 step 1).
- `tests/segmentBlock.test.ts` — visual 정규화 테스트 스타일.

## 작업

### 1) `VisualPayload`에 optional `cueType` — `segmentBlock.ts`

```ts
export type VisualCueType = "subtitle" | "capture" | "chart" | "table";
export interface VisualPayload {
  cue: string;
  note?: string;
  cueType?: VisualCueType;  // P5: 자막/화면캡처/그래프/표 — UI가 종류별 배지. 없으면 일반 '화면'.
}
```

`normalizeVisual`에 cueType 흡수 추가(**기존 로직·하위호환 보존**):
- `p.cueType`이 위 4개 enum 중 하나면 흡수, 아니면 **무시**(stray 드랍 — 기존 철학). cueType 없는 기존 visual payload는 그대로 유효(하위호환).
- cue 없으면 폴백, note는 string일 때만 — **기존 규칙 불변**.

### 2) `SCRIBE_SYSTEM`에 visual 큐 emit 지침 추가

기존(P2의 table/case/explain·comparison/case 자산 우선·말투·lineage) 지침은 **전부 보존**하고, visual 큐 블록을 덧붙인다. 핵심 의도(반드시):

- 대본 흐름 중 **시각 연출이 도움이 되는 지점**에 `kind:"visual"` segment를 끼운다. payload = `{ cue: string, cueType?: "subtitle"|"capture"|"chart"|"table", note?: string }`.
  - **subtitle(자막)**: 화면에 띄울 핵심 문구(짧고 강한 한 줄).
  - **capture(화면 캡처)**: 보여줄 화면/예시(예: "가입 신청 화면 캡처").
  - **chart(그래프)**: 수치 추이를 그래프로(있는 fact 기반).
  - **table(표)**: 비교/정리를 표로(P3 비교표 위치 등).
- visual segment도 `text`는 필수다(스키마) — text엔 그 큐의 짧은 설명/라벨을 넣고, 상세는 payload.cue에. (text와 cue가 같아도 무방.)
- **표현용이므로 사실 단정이 아니다** — 단, chart/table 큐가 가리키는 수치는 검증된 fact·자산을 따른다(없는 수치를 그래프로 지어내지 마라).
- **억지/남용 금지(중요)**: 모든 단락에 시각 큐를 붙이지 마라. 김짠부 영상에서 **실제로 자막·화면이 들어갈 만한 결정적 지점에만** — 과하면 대본이 산만해진다. 시각 큐 없이 prose만인 대본도 정상이다.
- 김짠부 톤(직설·강렬) 유지. 이모지·사색적 표현 금지.

### 3) 테스트 `tests/visualCue.test.ts`

- `normalizeVisual`: cueType 4종 각각 흡수 통과 / cueType 없는 payload 통과(하위호환) / 잘못된 cueType(예 "gif") → 무시(드랍, cue/note는 유지) / cue 없으면 폴백(기존).
- `VisualCueType` export 확인.

## fixture 주의

`SCRIBE_SYSTEM` 변경 → scribe promptHash 변경 → 기존 scribe fixture는 다음 **라이브 런에서 자동 재기록**(claude-p $0). **AC 무관**(eval은 fixture 파일 읽기·form-agnostic). 손으로 재기록 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드가 stale `.next`로 깨지면 `rm -rf .next` 후 재판별).
2. 아키텍처 체크리스트:
   - `SCRIBE_SCHEMA`를 **불필요하게 바꾸지 않았는가**(visual·loose payload 이미 허용 — SYSTEM만)?
   - `normalizeVisual`의 기존 로직(cue 폴백·note 흡수)이 불변이고 cueType은 additive·하위호환인가?
   - SYSTEM에 "억지/남용 금지"가 명시됐는가(과한 시각 큐 방지)?
3. `phases/visual-cues/index.json`의 step 0 갱신(completed+summary / error / blocked).

## 금지사항

- 시각 큐 생성을 위한 새 에이전트·DB 컬럼·리서치 데이터를 만들지 마라. 이유: 시각 큐는 표현용 — 짠펜이 대본에서 직접 emit. 과설계 금지(YAGNI).
- `SCRIBE_SCHEMA`의 kind enum·payload 구조를 바꾸지 마라. 이유: P2에서 이미 visual·loose payload 허용 — 바꾸면 불필요한 promptHash 변동.
- `normalizeVisual`의 cue 폴백·note 흡수 로직을 바꾸지 마라(cueType 추가만). 이유: P1 동작 회귀.
- 모든 단락에 시각 큐를 붙이라는 지침을 만들지 마라. 이유: 대본 산만·김짠부 톤 훼손.
- scriptCell·UI(SegmentList)를 건드리지 마라. 이유: scriptCell은 normalizeSegmentPayload로 visual을 이미 적재(P1)·UI는 step 1.
- 이모지·사색적 표현을 쓰라는 지침 금지(TRUS·디자인 원칙).
- fixture를 손으로 재기록·삭제하지 마라. 명세 외 신규 파일을 커밋에 섞지 마라(`git status` 확인). 기존 테스트를 깨뜨리지 마라.
