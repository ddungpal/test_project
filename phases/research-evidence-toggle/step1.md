# Step 1: script-review-toggle (검수 화면에 근거 토글 적용)

리서치 결과 정리 phase의 2단계. `ScriptReview`(최종 검수·유일한 사람 접점)의 "항상 펼친 인라인 fact"를
step0 `EvidenceToggle`로 **접이식**으로 바꾸고, 그동안 안 보이던 **자산을 라벨로** 노출한다. **pending
승인/반려는 그대로 작동해야 한다.** 설계 전문: `docs/specs/2026-07-01-research-evidence-toggle-design.md`(§B).
UI step → Esther 투입.

## 읽어야 할 파일

- `docs/specs/2026-07-01-research-evidence-toggle-design.md` — §B, 불변식(pending 보존).
- `src/components/ScriptReview.tsx` — **이 step이 수정.** 현재 구조:
  - 최상위 `decisions` state(fact id→승인/반려)·`pendingFacts = segments.flatMap(...pending)`·상단 요약 문구.
  - 세그먼트 map: `SegmentBody` + `s.facts.map(f => <FactChip ... decision onDecision />)` (**항상 펼침**).
  - `FactChip`(pending→토글, verified→출처, 그 외 미검증 표식), `safeHref`.
  - "최종 승인" → `reviewScriptAction(runId, { rejectFactIds })`.
- `src/components/EvidenceToggle.tsx`·`AssetLabel`(step0 산출·`{factCount,assetCount,pendingCount,children}`).
- `src/lib/research/evidence.ts` `pendingFactCount`(step0).
- step0 index.json summary(위젯·헬퍼 시그니처).

## 작업

### `ScriptReview.tsx` — 세그먼트별 근거를 EvidenceToggle로

- 각 세그먼트 렌더: `SegmentBody`(현행 유지) **아래**에 `<EvidenceToggle
  factCount={s.facts.length} assetCount={s.assets.length} pendingCount={pendingFactCount(s.facts)}>`.
  토글 children:
  - fact: 기존 `FactChip`(pending→승인/반려·verified→출처·미검증 표식) 그대로 — `decisions`/`setDecision`
    연결 유지.
  - 자산: `s.assets.map(a => <AssetLabel asset={a} />)` (신규 노출).
- **pending 보존(핵심)**: `decisions` state·`setDecision`·`pendingFacts`·"최종 승인"의 `rejectFactIds`
  수집·상단 요약 문구는 **그대로**. 결정 상태는 `<details>` 밖(컴포넌트 최상위)이라 접어도 유지된다.
- 근거 없는 세그먼트: `EvidenceToggle`이 `null` 반환(step0)이라 자동으로 토글 미표시 — 별도 분기 불필요.
- SegmentBody·상단 안내·최종 승인/수정 요청 버튼 무변경.

## 작업 시 주의

- `<details>` 기본 닫힘이라 pending fact가 접혀 보인다 — 이건 의도(요약 ⚠️ 배지가 신호). 결정 로직을
  토글 안으로 옮기지 마라(state는 밖에 있어야 접어도 안 잃는다).
- 상단 요약("확인 필요 N건 기본 승인…")은 전체 pending 총합이라 그대로 둔다(세그먼트별 토글과 별개로
  전체 신호 역할).

## 테스트

- 이 step은 UI 재배치(로직 신규 거의 없음)라 회귀 0이 핵심. 기존 ScriptReview 테스트(있다면) 유지.
- (선택) 근거 유/무 세그먼트에서 토글 유무가 갈리는지 얕은 확인. 무리한 details 토글 시뮬 금지.

## Acceptance Criteria

```bash
npm run typecheck   # tsc --noEmit, 에러 0
npm test            # vitest run, 전부 통과(회귀 0)
npm run build       # next build, 에러 0
```

## 검증 절차

1. 위 AC 3개 실행.
2. 체크리스트:
   - 세그먼트 fact가 `EvidenceToggle`(기본 닫힘)로 접히고, 요약에 "근거 N · ⚠️확인 필요 M"이 뜨는가?
   - `s.assets`가 `AssetLabel`로 노출되는가(기존엔 안 보이던 것)?
   - **pending 승인/반려·"최종 승인" rejectFactIds가 접어도 그대로 작동**하는가(state 토글 밖)?
   - TRUS 3색? 마이그 0? 백엔드·액션 무변경?
3. 결과 반영(step 1): 성공 → `completed`+`summary`(SegmentList·UnusedResearch가 step2 몫임을 명시) /
   3회 실패 → `error` / 사람 개입 → `blocked`.

## 금지사항

- `decisions` 결정 상태를 `<details>` 안으로 옮기지 마라. 이유: 접으면 unmount/재마운트로 결정이 날아갈 수 있다.
- `reviewScriptAction`·서버 전이·백엔드를 건드리지 마라. 이유: 이 step은 표시 재배치만.
- 자산 라벨에 표/케이스 내용을 렌더하지 마라(라벨만). 이유: 사용자 결정.
- SegmentList·UnusedResearch·page를 건드리지 마라. 이유: step2 몫.
- 기존 테스트를 깨뜨리지 마라. build가 `MODULE_NOT_FOUND`면 stale `.next` 의심(`rm -rf .next`).
