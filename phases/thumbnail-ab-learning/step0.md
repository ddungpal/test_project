# Step 0: ab-style-learn  ⭐ (Phase B 핵심)

**A/B 성과 → "이긴 썸네일 스타일" 학습.** 사람이 검토한 `corpus/thumbnails/ab-results.json`(YouTube Test&Compare 9영상)을 읽어, **이긴 변형(가중)·진 변형(대조)**으로 김짠부 썸네일 스타일을 학습해 `style_profiles(thumbnail_copy)` draft를 만든다. Phase A의 `extract-style.ts`를 미러링하되 입력이 **A/B 성과 기반**이다.

> ⚠️ 이 step은 **코드만** 만든다. 실제 LLM 학습 실행(`--commit`)은 **돌리지 마라**(사람이 검토 후 $0 claude-p로 실행). AC는 `typecheck`+`test`만. 이유: 추출 산출물은 사람이 검수 후 승급해야 함(과적합 방지·extract-tone/style과 동일 패턴).

## 읽어야 할 파일 (먼저 정독)
- `corpus/thumbnails/ab-results.json` — **입력 데이터**. 형태: `videos[].{topic, golden_edition, youtube_video_id?, winner, relative_lift_pct, verdict, variants[].{variant, watch_share_pct, is_winner, copy_top?, copy_main, copy_box?, copy_sub?, visual}}`. metric=시청시간 점유율(CTR 아님).
- `scripts/extract-style.ts` — **미러 대상**(DB읽기→prep→callLLM 1회→dry-run/`--commit` 저장 구조·`invokedDirectly` 가드·`main().catch`).
- `src/agents/style_extractor/schema.ts` — `STYLE_EXTRACTION_SCHEMA`/출력 `patterns` 형태 **재사용**(출력 동일). **단 SYSTEM 프롬프트는 A/B용 신규**(아래).
- `src/performance/abVerdict.ts` — `judgeComponent(component, variants[{variant,ctr_pct,impressions?}], thresholds)` → `{winner, margin, decisiveness, decided}`. **재사용**해 ab-results.json의 verdict를 코드로 재확인(신뢰 X·계산). watch_share_pct를 ctr_pct 슬롯에 넣어 호출.
- `src/llm/config.ts` — `config.ab`(decisiveMargin 0.10·marginalMargin 0.03) 임계.
- `src/agents/roles.ts` — `style_extractor` 역할(이미 있음·재사용).
- `docs/tech.md` §13.2(가중 학습: weight=상대격차·decisive>marginal·inconclusive 보류), `CLAUDE.md`, `.claude/rules/rules.md`.

## 작업

### 1. `scripts/learn-ab-style.ts` (신규 — `extract-style.ts` 미러)
- 입력: `corpus/thumbnails/ab-results.json` 로드.
- **순수 헬퍼**(테스트 import용·export):
  - `buildAbStyleInput(videos)`: 각 영상을 `{ topic, verdict, winner: {copy, visual}, losers: [{copy, visual}] }`로 변환. **inconclusive 영상은 win/lose 신호에서 제외**(카피는 중립 참고로만, 또는 통째 스킵 — 보수적으로 스킵).
  - `verdictWeight(verdict, relative_lift_pct)`: decisive→큰 가중(예 1.0), marginal→작은 가중(예 0.5), inconclusive→0(제외). §13.2.
  - (선택) `judgeComponent` 재계산으로 ab-results.json의 verdict 일치 검증(불일치 시 경고).
- LLM 입력: `{ creator:"김짠부", note:"아래는 A/B 테스트로 성과가 확인된 썸네일들이다. '이긴' 표현 방식을 학습하라.", winners:[...가중], losers:[...대조] }`.
- `callLLM<StyleExtractionOutput>({ roleId:"style_extractor", system: AB_STYLE_SYSTEM, input, schema: STYLE_EXTRACTION_SCHEMA, runId:"ab-style-learn", maxTokens:4096 })`.
- 출력 patterns를 extract-style처럼 `?? []` 기본값으로 안전 수령.
- dry-run: `corpus/thumbnails/ab-style-proposed-<stamp>.json` 기록. `--commit`: `style_profiles(component_type='thumbnail_copy', version=max+1, patterns, status='draft')` + `profile_training_sources(profile_type='thumbnail_copy', style_profile_id, ab_variant_id=null[아직 미적재], weight)` — **provenance는 영상별 weight로**. source_ref에 "ab-results:videos=N,signal=5" 류 표기.
- `invokedDirectly` 가드 + `main().catch(process.exit(1))`.

### 2. `AB_STYLE_SYSTEM` 프롬프트 (`learn-ab-style.ts` 내 또는 style_extractor/schema.ts에 추가)
- "너는 김짠부 썸네일 **성과 분석가**다. 입력은 A/B 테스트로 **실제로 이긴/진** 썸네일들이다. 이긴 것들의 공통 **표현 방식**(후킹·프레이밍·시각)을 뽑고, 진 것 대비 무엇이 달랐는지 banned/약점으로 적는다. 추측 금지·입력에 실재하는 것만·한국어. **데이터가 적으면(N<10) 단정 말고 '경향'으로**(과적합 경계)."

### 3. `tests/abStyleLearn.test.ts` (신규)
- 순수 검증만(LLM 없음): `buildAbStyleInput`(inconclusive 제외·winner/loser 분리)·`verdictWeight`(decisive>marginal>inconclusive=0)·judgeComponent 재계산 일치.

## 주의 (구체)
- 빈배열 가능 필드 schema `required` 금지(이미 STYLE_EXTRACTION_SCHEMA가 준수 — 그대로 씀).
- `exactOptionalPropertyTypes`(undefined 명시대입 금지)·`noUncheckedIndexedAccess`(배열 `?.`).
- **추출 실행 금지**(DB 변경·사람 검수 전). 코드만.
- 범위: `learn-ab-style.ts` + (필요시 schema.ts에 AB_STYLE_SYSTEM) + 테스트. 파이프라인·다른 에이전트 금지.

## Acceptance Criteria
```bash
npm run typecheck
npm test
```

## 검증 절차
1. AC 실행 exit 0.
2. `git status` 변경 범위 확인(learn-ab-style.ts·테스트·schema.ts AB_STYLE_SYSTEM만).
3. `phases/thumbnail-ab-learning/index.json` step 0 갱신: 성공 → `"status":"completed"`, `"summary":"learn-ab-style.ts(A/B 가중 학습·inconclusive 제외)+AB_STYLE_SYSTEM+테스트. 추출 미실행(검수대기). typecheck/test 그린"`. 실패(3회) → `"status":"error"`+`error_message`.
