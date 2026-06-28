# Step 3: standalone-script-seed (money-safety)

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙(특히 데이터 무결성·money-safety)
- `src/pipeline/scriptCell.ts:41-96` — 짠펜 셀 진입 가드(`research_approved`) + **사용 가능 fact/asset 필터(게이트)**. 이 게이트를 **건드리지 말고** 통과하는 행을 시드하는 게 핵심
- `src/pipeline/researchCell.ts:117-127` — research_facts/explanation_assets에 쓰는 컬럼 형태(시드 행 모양 참고)
- `supabase/migrations/` 중 `research_facts`·`explanation_assets` 정의 — **NOT NULL·CHECK 제약**(특히 `isVerifiedValid` 류 CHECK). 시드 행이 이 제약을 위반하면 insert가 깨진다
- `src/domain/enums.ts:84-98` — `isVerifiedValid`(verified일 때만 강제되는 규칙 — 'unverified'면 우회됨)
- `src/pipeline/standalone/deps.ts` — step0 `STANDALONE_DEPS.script`(seeds: structure, facts, assets)
- step2의 seeder(`seedStandaloneRun`/`runStandalone`) — 여기에 script 분기 확장

## 목표

짠펜 단독 실행: 사용자가 **구성 + 검증된 사실(여러 줄) + (선택)예시자산**을 직접 넣으면, 그걸 시드해 `research_approved`까지 walk한 뒤 짠펜만 실행한다. **scriptCell 게이트 코드를 수정하지 않고**, 게이트가 이미 허용하는 형태로 행을 시드한다.

## 작업

step2의 seeder에 `target==="script"` 분기 추가(step2의 throw 제거):

1. **walk 경로**: `created → … → structure_selected → researching → research_ready → research_review → research_approved`. 전부 `ALLOWED_TRANSITIONS` 합법(researchCell은 **실행하지 않는다** — 통과만 하고 facts/assets는 직접 시드). 전이는 `transitionRun`.
2. **structure 시드**: step0 `structureSelectionPayload`로 stage_proposals+stage_selections(step2와 동일 방식).
3. **research_facts 시드**(money-safety 핵심): 사용자가 입력한 사실 각 줄을 `research_facts` 행으로 insert하되, **scriptCell 게이트(`human_approved === true` OR (escalated_to_human===false && verification_status==='verified'))를 `human_approved=true`로 통과**시킨다:
   - `run_id`, `claim=<사용자 텍스트>`, `human_approved=true`, `escalated_to_human=false`, `verification_status='unverified'`, `is_financial=false`, `freshness='fresh'`, `recheck_after=null`, 그 외 NOT NULL 컬럼은 안전 기본값.
   - **이유(주석으로 코드에 남겨라)**: 단독 모드에서 사실은 *사람이 명시적으로 입력*한 것이므로 `human_approved=true`가 정직한 표현이다. AI가 자동 생성한 미검증 사실을 끼워넣는 걸 막는 게 게이트의 목적인데, 사람 입력은 그 목적에 부합한다. `verification_status='unverified'`로 둬서 `isVerifiedValid` CHECK(verified일 때만 강제)를 건드리지 않는다(=financial/primary 강제 회피).
4. **explanation_assets 시드(선택)**: 입력이 있으면 행 insert. scriptCell이 쓰는 자산은 `kind==='number'→math_verified=true`, `kind==='analogy'→distortion_checked=true`인 것만 통과하므로, 사용자 입력 자산도 그 플래그를 true로 시드(역시 사람 입력 책임). 입력 없으면 0행(짠펜은 facts만으로도 동작).
5. `runStandalone("script", …)`가 시드 후 `PIPELINE.script.event` 발사.

## Acceptance Criteria

```bash
npm run typecheck
npm test
```

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 테스트(신규): script 시드 후 — run.state가 `research_approved`, 시드한 research_facts가 scriptCell의 `usable` 필터를 통과(`human_approved===true`), 자산 플래그 true면 통과·false면 제외. structure selection 정확히 읽힘. 시드 경로 callLLM 0회.
3. 체크리스트:
   - **scriptCell.ts(게이트·셀 로직)를 수정하지 않았다** — 시드 행만으로 통과.
   - 시드 행이 research_facts/explanation_assets의 NOT NULL·CHECK를 위반하지 않는다.
   - `is_financial=false`·`verification_status='unverified'`로 verified-CHECK를 우회(financial primary 강제 안 걸림).
4. `phases/standalone-stages/index.json`의 step 3 갱신.

## 금지사항

- `scriptCell.ts`의 fact/asset 게이트나 freshness 게이트를 약화·수정하지 마라. 이유: money-safety 안전망. 단독 실행은 게이트를 *통과하는 행을 시드*하는 것이지 게이트를 푸는 게 아니다.
- 시드 fact를 `verification_status='verified'`로 넣지 마라. 이유: 거짓 검증 표기 + `isVerifiedValid` CHECK(독립출처2·citation·quote·financial→primary)에 걸려 insert가 깨지거나 데이터가 거짓이 된다. `human_approved=true`로 통과시켜라.
- 시드 중 callLLM 호출·`transitionRun` 우회 금지(step2와 동일). 기존 테스트를 깨뜨리지 마라.
