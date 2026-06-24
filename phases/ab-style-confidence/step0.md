# Step 0: lift-frequency-confidence

**A/B 썸네일 학습의 신뢰도·표본 보강(과적합 완화).** 현재 5영상(decisive 3·marginal 2)에서 학습하고 lift·교차빈도를 안 쓰며 inconclusive를 버린다. 가중을 세분화하고 약신호를 살린다. **순수 로직 + 테스트만**(재학습 실제 실행은 사람게이트).

## 배경 (현재 한계)
- 학습 입력 = `decisive 1.0 / marginal 0.5 / inconclusive 0(스킵)`(`scripts/learn-ab-style.ts` `verdictWeight`·`buildAbStyleInput`). `relative_lift_pct`는 인자로 받지만 **미사용**(`_relativeLiftPct`). lift 12.4% 영상과 14.5% 영상이 같은 weight.
- inconclusive 4영상(통째 스킵, 135줄) — "두 안이 동등했다"는 신호(그 차원은 성과와 무관 → 과하게 학습하지 말라)를 버림.
- 1~2 사례뿐인 패턴과 여러 영상서 반복 승리한 패턴이 LLM 입력에서 구분 안 됨 → 소표본 과적합.

## 읽어야 할 파일 (먼저 정독)
- `scripts/learn-ab-style.ts` — `verdictWeight(verdict, _relativeLiftPct?)`(88줄·lift 미사용)·`buildAbStyleInput`(123줄·inconclusive continue 135줄)·`AB_STYLE_SYSTEM`(234~247줄)·`AbStyleInputVideo`(74~). **이 셋을 보강.**
- `src/performance/abVerdict.ts` — `judgeComponent`·decisiveness 판정(가중 근거). 분모 주의 주석(learn-ab-style 6줄): 파일 lift=(winner-2nd)/winner.
- `src/agents/style_extractor/schema.ts` — `ThumbnailStylePatterns`·`STYLE_EXTRACTION_SCHEMA`. **빈배열 가능 string[]는 required 금지**(7~9줄 주석) — confidence/tentative 추가 시 동일 규칙.
- `corpus/thumbnails/ab-results.json` — 입력 형태(verdict·relative_lift_pct·variants). `tests/abStyleLearn.test.ts` — 기존 순수 테스트 패턴.

## 작업
### 1) lift 반영 가중 (`verdictWeight`)
- `verdictWeight(verdict, relativeLiftPct?)`가 lift를 실제로 반영: decisive/marginal 기본값(1.0/0.5)에 **lift 정규화 미세조정**(예: 기본 × (1 + clamp(lift, 0, CAP)/SCALE), 상한 가드로 폭주 방지). 미지정/0이면 기본값과 동일(하위호환). inconclusive=0 유지.
- 상수(CAP·SCALE)는 파일 상단 명시. 결정적·단조(높은 lift → 높은 weight, 단 상한).

### 2) 교차빈도 신호 (`buildAbStyleInput` + 프롬프트)
- 각 영상 winner의 표현 특징을 그대로 LLM에 주되, **AB_STYLE_SYSTEM에 지시 추가**: "여러 영상에서 반복 등장하는 승리 패턴을 high-confidence로, 1~2 사례뿐인 패턴은 tentative로 분류하라." (코드가 패턴을 세는 게 아니라, LLM이 입력 전반을 보고 빈도를 판단하도록 명시 — 입력 구조는 최소 변경.)

### 3) inconclusive 등가신호 (`buildAbStyleInput`)
- inconclusive 영상을 **통째 스킵하지 말고**, 약한 '등가 신호'로 분리 전달: `equivalent_signals`(예: `{ topic, note: "A/B 동등 — 이 차원은 성과 차이 없음" }[]`). LLM이 "이 둘은 비슷해서 우열 못 가림 → 그 차이를 과하게 학습 말라"에 쓰게. weight=0 유지(positive 학습 제외), 단 신호는 보존.
- AB_STYLE_SYSTEM에 등가신호 사용 지시 1줄 추가.

### 4) 신뢰도 표기 (스키마)
- `ThumbnailStylePatterns`에 신뢰도 표기 추가: 패턴별이 부담되면 **overall** `confidence?: "high" | "tentative"` 또는 `tentative_notes?: string[]`(저표본 경고). **string[]/옵셔널은 required 제외**(빈배열 규칙). `appendThumbnailStyle`(styleProfile.ts)은 patterns를 JSON 직렬화로 그대로 전달하므로 추가 필드는 자동 노출 — 별도 배선 불필요.

## 주의
- **재학습을 실제로 돌리지 마라(LLM 호출 0).** 이유: 이 step은 학습 *로직* 보강 + 테스트. 실제 재학습→draft→activate는 사람게이트(claude-p 재실행).
- `verdictWeight` 하위호환: lift 미지정 시 기존 1.0/0.5/0과 동일해야(기존 abStyleLearn 테스트 보존).
- 스키마 추가 필드는 **required 금지**(forced tool_use 빈배열 누락→api 실패, 과거 critic 사건). step에서 `?? []`·옵셔널.
- `learn-ab-style.ts`는 parity/eval 경로 아님(독립 스크립트) — hook_maker 픽스처 무관.
- exactOptionalPropertyTypes·noUncheckedIndexedAccess 준수.

## 테스트 (`tests/abStyleLearn.test.ts` 확장 또는 신규)
- `verdictWeight`: lift 없음 → 1.0/0.5/0(기존). 높은 lift → 더 큰 weight(단 상한 이하). inconclusive → 0.
- `buildAbStyleInput`: decisive/marginal는 positive(weight>0), inconclusive는 positive에서 제외되되 `equivalent_signals`에 보존. 빈 입력 안전.
- (lift CAP 경계) 매우 큰 lift도 상한 넘지 않음.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0. 기존 abStyleLearn 테스트 보존(하위호환).
2. `git diff`로 learn-ab-style·schema만 변경, hook_maker/eval/픽스처 무변경 확인.
3. step 0 갱신: 성공 → `"status":"completed"` + `"summary":"verdictWeight lift 반영(상한 가드·하위호환) + buildAbStyleInput 교차빈도 프롬프트 지시 + inconclusive 등가신호 보존 + 스키마 confidence/tentative(required 제외) + 테스트. LLM/DB 0. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- 실제 재학습/LLM 호출/DB commit 금지(사람게이트).
- 스키마 신규 필드 required 금지.
- hook_maker·UI 수정 금지(다른 phase).
- 기존 테스트를 깨뜨리지 마라.
