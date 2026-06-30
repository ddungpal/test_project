# Step 2: segment-render-ui (Esther)

P1 토대의 **렌더 레일**. `SegmentList`가 `kind`별로 분기 렌더하도록 스캐폴드하고(prose는 현행 유지·table/case/visual는 형식 표현), 더불어 **A3(문단↔근거 가시화)** 를 강화한다. 이 step은 **순수 프론트엔드**(서버·DB·액션 무변경) — Esther 투입 step이다.

옵션 A 범위: 실제 런에서는 아직 전부 prose로 들어오므로 table/case/visual 분기는 **데모시드/스토리북 없이도 코드로 동작**해야 한다. 진짜 형식 블록의 실 데이터는 P2~P5에서 채워진다. 이 step은 **kind가 채워지면 즉시 보이는 렌더 레일**을 완성한다.

## 읽어야 할 파일

- step 1 산출물: `src/lib/dashboard/scriptView.ts`의 `SegmentView`(이제 `kind`/`payload` 포함), `src/pipeline/segmentBlock.ts`의 payload 타입(`TablePayload`/`CasePayload`/`VisualPayload`/`SegmentKind`).
- `src/components/SegmentList.tsx` — **현재 전체**(prose 단락 + fact/asset chip). 이걸 확장한다.
- `src/app/runs/[id]/page.tsx` 371·378·387행 — `SegmentList` 렌더 위치(props 시그니처 불변이면 호출부 수정 불필요).
- `CLAUDE.md`의 **TRUS Create 디자인** 섹션: Black `#121212`/Yellow `#F8F082`/White **3색만**, 그라데이션·그림자 금지, 강렬·직설. Tailwind 토큰 `trus-white`/`trus-yellow`/`trus-black`.
- 기존 컴포넌트 1~2개(예: 같은 디렉토리)에서 TRUS 토큰·접근성 패턴을 확인하라.

## 작업

### 1) `SegmentList`에 kind 스위치

각 세그먼트 렌더를 `s.kind`로 분기. **prose는 현재 마크업을 그대로 유지**(회귀 0). 나머지는 payload를 형식으로 렌더:

- **`prose`**: 현행 그대로(번호 + `whitespace-pre-wrap` 단락).
- **`table`** (`payload: TablePayload`): `columns`를 헤더로, `rows`를 본문으로 하는 **표**. TRUS 3색(헤더=trus-yellow 강조, 보더=trus-white/15). `caption` 있으면 표 위/아래 캡션. 셀은 텍스트만(이스케이프 자동).
- **`case`** (`payload: CasePayload`): `intro`(있으면) + 각 `branch`를 "**조건** → 결과" 형태로 분기 목록. 조건은 trus-yellow 강조, 결과는 trus-white.
- **`visual`** (`payload: VisualPayload`): 시각 큐 **배지**(예: "🎬 자막/캡처" 톤은 금지 — 직설 텍스트 배지) + `cue` 텍스트 + `note`(있으면 보조). trus-yellow 보더 배지.
- payload가 `null`인데 kind가 prose가 아닌 경우는 step 1 정규화가 막지만, **방어적으로 prose 폴백 렌더**(빈 화면 금지).

타입 안전: `payload`가 union이므로 `switch (s.kind)` 안에서 좁혀 쓰거나, 작은 하위 컴포넌트(`TableBlock`/`CaseBlock`/`VisualBlock`)로 분리해도 좋다(같은 파일 내). 새 의존성 추가 금지(table 라이브러리 등 — 순수 `<table>` + Tailwind면 충분).

### 2) A3 — 문단↔근거(fact/asset) 가시화 강화

현재 fact/asset chip(13~26행)은 작은 truncate 칩이다. **이 단락이 무엇에 근거하는지** 더 잘 보이게 강화하되 과하지 않게:

- fact chip: `fact:` 라벨을 더 명확히(예: 작은 trus-white/40 "근거" 라벨 prefix), hover full-text는 유지.
- asset chip: "숫자"/"비유" 구분 유지, trus-yellow 톤 유지.
- chip 영역이 형식 블록(표/케이스/시각)에도 동일하게 붙도록 한다(prose 전용이 아니라 모든 kind 공통 푸터).
- **과설계 금지**: 새 패널·아코디언·툴팁 라이브러리 도입 금지. 기존 칩 마크업을 다듬는 선에서.

## Acceptance Criteria

```bash
npm run typecheck   # 타입 에러 0(payload union 좁히기 정확)
npm test            # 전체 통과
npm run build       # 컴파일 에러 0
```

## 검증 절차

1. AC 커맨드 실행(빌드 깨지면 `rm -rf .next` 후 재판별).
2. 디자인/아키텍처 체크리스트:
   - **TRUS 3색만** 사용했는가(임의 색·그라데이션·그림자 0)?
   - prose 렌더 마크업이 **현행과 동일**한가(회귀 0)?
   - 서버/DB/액션 코드 변경이 **0**인가(순수 프론트엔드)?
   - payload null/깨짐 시 빈 화면 없이 prose 폴백되는가?
   - 새 npm 의존성 추가가 없는가?
3. `phases/script-format-model/index.json`의 step 2 갱신(completed+summary / error / blocked).

## 금지사항

- 서버 컴포넌트·`scriptView.ts`·`scriptCell.ts`·액션을 수정하지 마라. 이유: 이 step은 순수 프론트엔드 렌더 레일.
- TRUS 3색(Black/Yellow/White) 외 색·그라데이션·그림자를 쓰지 마라. 이유: 디자인 시스템 위반.
- 표/UI 라이브러리 등 새 의존성을 추가하지 마라. 이유: 순수 `<table>`+Tailwind로 충분(YAGNI).
- prose 세그먼트의 기존 마크업을 바꾸지 마라. 이유: 실 런은 전부 prose라 회귀가 곧장 사용자에게 노출됨.
- 범위 외 신규 파일을 커밋에 섞지 마라(`git status` 확인).
- 기존 테스트를 깨뜨리지 마라.
