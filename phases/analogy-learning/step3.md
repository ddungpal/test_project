# Step 3: 유이(analogist) 주입 — active 비유 프로필을 프롬프트에 반영

> 학습 루프를 **닫는** step. active `analogy_style` 프로필을 유이 시스템 프롬프트에 주입.
> ⚠️ 이 phase에서 **유일하게 fixture/promptHash에 영향**을 주는 step — "비면 안 건드림" 불변식을 반드시 지킬 것.

## 읽어야 할 파일

- `docs/specs/2026-07-03-analogy-learning-design.md` — §4.4 주입, §5 결정성.
- `src/agents/shared/styleProfile.ts` — `loadActiveThumbnailStyle`/`hasUsablePatterns` **정본 미러**.
- `src/agents/shared/approvedInsights.ts` — `appendLearnedInsights`(비면 원본 그대로=해시 불변) 패턴.
- `src/agents/analogist/{schema.ts,step.ts}` — `ANALOGIST_SYSTEM`·`analogyStep(llm, runId, input)`.
- `src/pipeline/researchCell.ts` (127·236행) — `analogyStep` **두 호출부**. 여기서 프로필 로드.
- `.claude/rules/rules.md` — 결정성/fixture 보존.

## 작업

### 1) 신규 `src/agents/shared/analogyStyle.ts` (styleProfile.ts 미러)
- `loadActiveAnalogyStyle(supa): Promise<ActiveAnalogyStyle | null>` — `style_profiles`에서 `component_type='analogy_style'` AND `status='active'` 최신 1행. 없으면 `null`.
- `appendAnalogyStyle(system: string, profile: ActiveAnalogyStyle | null): string` — **순수 함수**.
  - `profile`이 null이거나 patterns가 실질 내용 없으면(`hasUsablePatterns` 미러) **`system` 원본 그대로 반환**(바이트 동일 → promptHash 불변).
  - 있으면 `ANALOGIST_SYSTEM` 뒤에 지시 섹션 append: "── 레퍼런스에서 학습한 비유 기법(반영) ──" + techniques/target_domains/do/banned/distortion_guard를 짧게. evidence용 `style:<id>` 표기(approvedInsights 방식).

### 2) researchCell 배선 (두 호출부 dedup)
- `analogyStep` 두 호출 **직전에** (또는 셀 상단에서 1회) `loadActiveAnalogyStyle(supa)` 로드. researchCell이 이미 쓰는 supa 사용.
- 프로필을 `analogyStep` 입력으로 전달(예: `analogyStep(llm, runId, { concepts, facts, analogyStyle })`) → `analogist/step.ts`가 `appendAnalogyStyle(ANALOGIST_SYSTEM, analogyStyle)`로 system 조립.
  - 로드는 **1회만**(두 호출부가 같은 값 사용 — 중복 쿼리 금지).
  - **불변식**: active 프로필이 없으면 system이 기존과 바이트 동일 → 기존 유이 fixture/promptHash 그대로 통과해야 한다(테스트로 잠금).

## 테스트 `tests/analogyStyleInjection.test.ts`

- `appendAnalogyStyle(sys, null)` === `sys` (해시 보존).
- patterns 비어있음(빈 객체/필드 없음) → `sys` 원본 그대로.
- 정상 patterns → 반환에 "비유 기법" 섹션·techniques·`style:` 표기 포함.
- (선택) 유이 step: analogyStyle 미전달 시 system == `ANALOGIST_SYSTEM`(회귀).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 전부 exit 0. stale `.next` 의심 시 `rm -rf .next` 후 재빌드.
2. **핵심 체크**: active analogy 프로필이 **없을 때** 기존 유이 fixture/테스트가 전부 통과하는가(해시 불변)? → 이게 깨지면 주입이 무조건 실행돼 버린 것.
3. active일 때만 섹션이 붙나? 두 호출부가 로드 1회를 공유하나?
4. `git status`로 범위 외 파일(떠돌이 fixtures) 점검 후 제외.
