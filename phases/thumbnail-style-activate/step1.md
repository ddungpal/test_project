# Step 1: verify-feedback-wiring-and-runbook

**훅이 환류 배선을 통합 테스트로 못박고, 라이브 활성화 런북을 문서화한다.** 현재 `appendThumbnailStyle`(순수)는 `tests/styleProfile.test.ts`로 잘 커버되지만, **`hook_maker/prepare.ts`가 실제로 active 스타일을 로드해 주입하는 배선**(`loadActiveThumbnailStyle` → `input.style_profile` 세팅 + `appendThumbnailStyle`로 system 합성)은 테스트가 없다. 이 step에서 **그 배선을 통합 테스트로 고정**하고, 실제 DB 활성화는 **사람 게이트 런북**으로 남긴다(라이브 DB 변경은 사용자가 트리거).

## 읽어야 할 파일 (먼저 정독)
- `src/agents/hook_maker/prepare.ts` — 배선 대상. `const style = await loadActiveThumbnailStyle(supa); if (style) input.style_profile = style;` + `appendThumbnailStyle(appendLearnedInsights(HOOK_MAKER_SYSTEM, learned), style)`. prepare가 받는 인자(supa 등)·반환 형태 확인.
- `src/agents/shared/styleProfile.ts` — `loadActiveThumbnailStyle`(active 1행, 없으면 null)·`appendThumbnailStyle`(null/빈 patterns면 바이트 보존).
- `tests/styleProfile.test.ts` — 기존 순수 테스트(중복 금지 — 배선/통합만 추가).
- `corpus/thumbnails/ab-style-proposed-2026-06-23-16-18-50.json` — 활성화 대상 검수본(완화 반영본).
- `docs/roadmap-next.md` — Phase B "운영 절차" 섹션(여기에 활성화 런북을 잇는다).

## 작업
1. **prepare 배선 통합 테스트 추가**(`tests/` 신규 또는 기존 파일):
   - **fake Supa**(`loadActiveThumbnailStyle`가 기대하는 `.from().select().eq().eq().order().limit().maybeSingle()` 체인을 흉내내는 최소 스텁)로 active 썸네일 스타일 1행을 돌려주게 하고, `prepare`를 호출 → 결과 `system`에 "김짠부 썸네일 스타일 사양"·`style:<id>`·patterns 내용이 포함되고 `input.style_profile`이 세팅됨을 단언.
   - active 없음(maybeSingle null) → `system`이 스타일 섹션 **없이** 보존되고 `style_profile` 미세팅(해시 불변 경로) 단언.
   - prepare가 다른 무거운 의존(LLM·다른 테이블)을 타서 단위 테스트가 과하면, **배선 조합 단위**로 낮춰라: `loadActiveThumbnailStyle(fakeSupa)` 결과를 `appendThumbnailStyle`에 넣어 동일 단언(최소한 "active면 주입 / null이면 보존"을 고정). 과한 목킹으로 늘어지지 말 것.
2. **활성화 런북 문서화**(`docs/roadmap-next.md` Phase B 운영절차에 "썸네일 스타일 활성화(사람 게이트)" 하위 섹션 추가). 정확한 명령:
   ```bash
   set -a; . ./.env; set +a
   # 1) 검수본을 그대로 draft로 커밋 (LLM 미호출 — step0의 --from)
   LLM_BACKEND=claude-p npx tsx scripts/learn-ab-style.ts \
     --from corpus/thumbnails/ab-style-proposed-2026-06-23-16-18-50.json --commit
   # 2) 방금 만든 version 확인 후 active 승급 (기존 active는 자동 retired)
   npx tsx scripts/activate-style.ts <version>
   # 3) 확인: 다음 훅이 실행부터 system에 "김짠부 썸네일 스타일 사양" 주입 / loadActiveThumbnailStyle이 1행 반환
   ```
   - 사람 게이트임을 명시: **라이브 Supabase 변경**이라 사용자가 직접/감독 하에 실행. active는 component_type별 1개(partial unique). 되돌리려면 이전 version을 다시 activate.
3. 코드 변경은 **테스트 + 문서뿐**. 런타임 코드(prepare/styleProfile/스크립트)는 step0에서 끝났으니 **건드리지 마라**(테스트가 빨강이면 배선 버그이므로 보고만).

## 주의
- **DB·LLM 미접근 테스트**(fake Supa). 라이브 활성화는 AC에 넣지 마라 — 런북으로만.
- 기존 `styleProfile.test.ts` 단언과 중복 테스트 만들지 말 것(배선/통합 관점만 추가).
- `noUncheckedIndexedAccess`·`exactOptionalPropertyTypes` 준수.
- 범위: `tests/` + `docs/roadmap-next.md`. 런타임 코드 수정 금지.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0(새 배선 테스트 포함 그린).
2. `git diff`로 런타임 코드 불변(테스트·문서만) 자가확인.
3. step 1 갱신: 성공 → `"status":"completed"` + `"summary":"훅이 prepare 환류 배선 통합테스트 추가(active 주입/null 보존) + 활성화 런북(docs) 문서화. 런타임 불변. tc/test/build 그린"`. 실패(3회) → `"status":"error"` + `error_message`.

## ⚠️ 이 step 이후 (사람 게이트 — 하네스가 하지 않음)
활성화 자체(`--from --commit` → `activate-style`)는 **라이브 DB 변경**이므로 하네스가 실행하지 않는다. step0·1 머지 후 사용자가 위 런북을 직접 트리거하면 완화된 스타일이 훅이에 환류된다.
