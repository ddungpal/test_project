# Step 2: scribe-table-from-comparison

P3의 **짠펜 연결 레이어**. 짠펜이 `format='table'` 섹션에서 **즉흥으로 표를 짜는(P2)** 대신, step1의 **검증된 비교 자산(`explanation_assets[kind='comparison']`)** 을 받아 그 구조화 데이터로 정확한 표 블록을 emit하도록 한다.

## 배경

- **P2**: 짠펜이 outline의 format을 보고 `kind='table'` payload를 평면 fact에서 즉흥 생성(얕음).
- **step1**(P3): 비교가가 검증된 사실로 `kind='comparison'` 자산(entities/dimensions/cells/grounded)을 만들어 `explanation_assets`에 저장.
- **이 step**: 짠펜이 그 비교 자산을 입력으로 받아, 해당 표 섹션의 payload를 **자산의 검증된 셀로** 채운다(improvise 금지).
- 적재·렌더 레일은 P1에서 완성 → scriptCell은 **자산 입력·money 게이트 분기만** 손댄다.

## 읽어야 할 파일

- `src/pipeline/scriptCell.ts` — **전체 정독**. 특히:
  - line 74~81: `explanation_assets` 로드 + **money-safety 필터**(`kind === "number" ? math_verified : distortion_checked`). comparison 분기를 여기 추가한다.
  - line 92: `assetsInput` 구성(현재 `concept`/`kind`/`numeric_example`/`analogy`만 전달) — comparison은 `payload`도 전달해야 짠펜이 셀을 본다.
  - line 96: `scribeStep` 호출(input.assets). line 143~165: lineage(`used_asset_idxs` → `script_segment_explanation_assets`). **lineage 로직은 불변**(comparison asset도 같은 경로로 링크됨).
- `src/agents/scribe/schema.ts` — `SCRIBE_SCHEMA`(P2에서 kind/payload 추가됨)·`SCRIBE_SYSTEM`(P2에서 format emit 지침). 이 step은 SYSTEM에 "comparison 자산 우선" 지침을 보강한다.
- `src/pipeline/comparisonAsset.ts` — `normalizeComparison`·`ComparisonPayload`(step0).
- step1 산출물: `src/agents/comparator/*`, `explanation_assets`의 comparison row(payload).

## 작업

### 1) scriptCell — comparison asset 로드·게이트·입력 전달

- **로드**(line 74~): select에 `payload` 포함(이미 `*` 아니면 명시 추가).
- **money 게이트**(line 81 필터)에 comparison 분기 추가:
  ```ts
  a.kind === "number" ? a.math_verified === true
  : a.kind === "analogy" ? a.distortion_checked === true
  : a.kind === "comparison" ? normalizeComparison(a.payload) !== null   // 구조 유효한 비교만
  : false
  ```
  이유: 깨진/빈 비교 자산은 표로 박제 금지(money-safety). 셀별 `grounded`는 payload 안에 보존돼 짠펜이 "확인 필요"로 다룬다.
- **assetsInput**(line 92): comparison asset이면 `payload: normalizeComparison(a.payload)`를 함께 전달(number/analogy는 기존 그대로). 짠펜이 entities/dimensions/cells를 봐야 표를 정확히 만든다.
- **lineage 불변**: comparison asset도 기존 `used_asset_idxs` → `script_segment_explanation_assets` 경로로 링크된다(추가 코드 없이 자동). 확인만.

### 2) `SCRIBE_SYSTEM` 보강 (comparison 우선)

P2의 format emit 지침에 덧붙인다(기존 문장 보존):

- `format='table'` 섹션에서 **comparison 자산이 입력에 있으면, 그 자산의 entities/dimensions/cells를 그대로 써서** `kind='table'` payload를 만든다(columns=dimensions[+entity 열], rows=entity별 값). **즉흥 생성·값 변경 금지** — 검증된 데이터를 옮기는 것.
- 셀의 `grounded=false`(또는 값이 "확인 필요")인 칸은 표에 **"확인 필요"로 그대로** 두고 단정하지 마라(money-safety).
- comparison 자산이 없으면 P2 동작(평면 fact로 신중히 — 데이터 부족하면 prose).
- comparison 자산을 쓴 segment는 그 asset을 `used_asset_idxs`에 링크(lineage).

### 3) 테스트 `tests/scribeComparison.test.ts`

- scriptCell의 money 게이트가 comparison 자산을 `normalizeComparison` 유효성으로 통과/드랍하는지(순수 분기 단위 — 가능하면 헬퍼로 추출해 테스트).
- comparison payload가 짠펜 입력(assetsInput)에 포함되는지(fake supa/driver 패턴 — 기존 scriptCell 관련 테스트 참고. 단위가 어려우면 게이트/입력 빌드를 순수 헬퍼로 추출해 테스트).
- end-to-end: comparison 자산 → 짠펜이 kind='table' segment emit → `normalizeSegmentPayload` 통과 → 적재(P1·P2 함수 재사용으로 흐름 1건 못박기).

## fixture 주의

`SCRIBE_SYSTEM` 변경 → scribe promptHash 변경 → 다음 라이브 런에서 자동 재기록(claude-p $0). **AC 무관**(eval은 fixture 파일 읽기). 손으로 재기록 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next` 후 재판별).
2. 아키텍처 체크리스트:
   - money 게이트에 comparison 분기가 있고 깨진 비교는 드랍되는가?
   - lineage(`script_segment_explanation_assets`)·전이·표절 가드·freshness 게이트가 **불변**인가?
   - SYSTEM이 "comparison 있으면 즉흥 금지·검증 데이터 그대로·미검증 칸 확인필요"를 명시하는가?
3. `phases/comparison-table/index.json`의 step 2 갱신(completed+summary / error / blocked).

## 금지사항

- scriptCell의 freshness 게이트·표절 가드·전이·cost flush·lineage 매핑 로직을 수정하지 마라(comparison 분기 추가 외). 이유: 무결성 회귀.
- comparison 자산의 미검증 셀을 단정으로 표에 넣는 지침을 만들지 마라. 이유: money-safety.
- `SegmentList`(렌더)를 건드리지 마라. 이유: P1에서 완성·step3 UI는 검수 뷰만.
- fixture를 손으로 재기록·삭제하지 마라.
- 범위 외 신규 파일을 커밋에 섞지 마라(`git status` 확인). 기존 테스트를 깨뜨리지 마라.
