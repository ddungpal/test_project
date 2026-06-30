# Step 2: scribe-case-from-asset

P4의 **짠펜 연결 레이어**. 짠펜이 `format='case'` 섹션에서 **즉흥으로 분기를 짜는(P2)** 대신, step1의 **검증된 케이스 자산(`explanation_assets[kind='case']`)** 을 받아 정확한 케이스 블록을 emit하도록 한다. P3 step2(`scribe-table-from-comparison`)와 **구조가 동일**하다.

## 배경

- **P2**: 짠펜이 format='case'를 보고 분기를 즉흥 생성(얕음).
- **step1**(P4): 분기가가 댓글 발굴 + 검증된 사실로 `kind='case'` 자산(branches/grounded)을 만들어 저장.
- **이 step**: 짠펜이 그 자산으로 케이스 섹션을 채운다(improvise 금지).
- 적재·렌더 레일은 P1, asset 입력·money 게이트 골격은 **P3 step2에서 이미 일반화**됨(`isAssetUsable`·`buildAssetsInput`) → 이 step은 그 헬퍼에 **case 분기만 추가**.

## 읽어야 할 파일

- `src/pipeline/comparisonAsset.ts` — **P3 step2가 추가한 순수 헬퍼** `isAssetUsable`(money 게이트)·`buildAssetsInput`(통과분만 + comparison payload 포함). **이 step은 여기에 case 분기를 더한다**(또는 case는 `caseAsset.ts`에 두고 이 헬퍼들이 호출 — 구현 재량, 단 단일 출처 유지).
- `src/pipeline/scriptCell.ts` — line 74~81(asset 로드·필터=`isAssetUsable`)·line 92(`buildAssetsInput`)·lineage(불변). P3에서 이미 comparison을 흘리도록 일반화됨 — case도 같은 경로로 흐른다.
- `src/agents/scribe/schema.ts` — `SCRIBE_SCHEMA`(kind/payload)·`SCRIBE_SYSTEM`(P2 format emit + P3 comparison 우선 지침). 이 step은 case 자산 우선 지침 보강.
- `src/pipeline/caseAsset.ts` — `normalizeCaseAsset`·`CaseAssetPayload`(step0).
- `src/pipeline/segmentBlock.ts` — `normalizeCase`(세그먼트 case payload — 짠펜이 emit한 case 블록 적재 시 통과 형태). **자산 payload(grounded 포함)와 세그먼트 payload({condition,outcome})의 형태 차이**에 주의: 짠펜은 자산을 보고 세그먼트 case 블록(`{branches:[{condition,outcome}]}`)을 만든다(grounded는 outcome 텍스트에 "확인 필요"로 반영).

## 작업

### 1) money 게이트·입력 빌드에 case 추가 — `comparisonAsset.ts`(또는 caseAsset.ts, 단일 출처)

- `isAssetUsable`에 case 분기 추가:
  ```ts
  a.kind === "case" ? normalizeCaseAsset(a.payload) !== null : ...
  ```
  깨진/분기<2 케이스 자산은 드랍(money-safety).
- `buildAssetsInput`: case asset이면 `payload: normalizeCaseAsset(a.payload)`(branches+grounded)를 함께 전달. number/analogy/comparison 분기는 불변. idx=통과 순서로 lineage 인덱스 일치(P3 규칙 유지).

### 2) `SCRIBE_SYSTEM` 보강 (case 자산 우선)

기존(P2·P3) 지침 보존하고 덧붙인다:

- `format='case'` 섹션에서 **case 자산이 입력에 있으면, 그 branches를 그대로 써서** `kind='case'` 세그먼트(`payload={intro?, branches:[{condition,outcome}]}`)를 만든다. **즉흥·분기 변경 금지.**
- branch의 `grounded=false`(또는 outcome에 "확인 필요")인 경우 그 결론을 단정하지 말고 "확인 필요"를 유지한다(money-safety).
- case 자산이 없으면 P2 동작(데이터 부족하면 prose).
- case 자산을 쓴 segment는 그 asset을 `used_asset_idxs`에 링크(lineage).

### 3) 테스트 `tests/scribeCase.test.ts`

- `isAssetUsable`이 case 자산을 `normalizeCaseAsset` 유효성으로 통과/드랍.
- `buildAssetsInput`이 case payload(branches+grounded)를 포함.
- end-to-end: case 자산 → 짠펜이 kind='case' segment emit → `normalizeSegmentPayload`(normalizeCase) 통과 → 적재(P1·step0 함수 재사용으로 흐름 1건 못박기).

## fixture 주의

`SCRIBE_SYSTEM` 변경 → scribe promptHash 변경 → 다음 라이브 런 자동 재기록(claude-p $0). **AC 무관**. 손으로 재기록 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next` 후 재판별).
2. 아키텍처 체크리스트:
   - `isAssetUsable`에 case 분기가 있고 깨진/분기<2 케이스는 드랍되는가?
   - freshness·표절·전이·cost·lineage 매핑이 **불변**인가(case 분기 추가 외)?
   - SYSTEM이 "case 자산 있으면 즉흥 금지·branches 그대로·미검증 outcome 확인필요"를 명시하는가?
3. `phases/case-branching/index.json`의 step 2 갱신(completed+summary / error / blocked).

## 금지사항

- scriptCell의 freshness 게이트·표절 가드·전이·cost flush·lineage 매핑을 수정하지 마라(case 분기 추가 외). 이유: 무결성 회귀.
- case 자산의 미검증 branch outcome을 단정으로 넣는 지침을 만들지 마라. 이유: money-safety.
- `SegmentList`(렌더)를 건드리지 마라. 이유: P1 완성·step3은 검수 뷰만.
- `isAssetUsable`/`buildAssetsInput`을 복제하지 마라(단일 출처 유지 — P3가 만든 헬퍼에 분기만 추가). 이유: 게이트 로직 중복은 표류 위험.
- fixture를 손으로 재기록·삭제하지 마라. 범위 외 신규 파일을 커밋에 섞지 마라(`git status` 확인). 기존 테스트를 깨뜨리지 마라.
