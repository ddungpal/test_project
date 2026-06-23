# Step 2: style-loop-verify (승인 + 훅이 환류 검증 → 루프 닫힘)

**학습된 스타일 → 승인 → 훅이 환류**의 루프가 실제로 닫히는지 검증한다. 핵심 배선(활성화·훅이 주입)은 **이미 Phase A에서 만들었다**. 이 step은 **A/B로 학습된 draft**가 그 배선을 타는지 확인하고, 사람 승인 게이트를 명문화한다.

> 신규 코드는 적다(검증·테스트 중심). 새 에이전트·파이프라인 없음.

## 읽어야 할 파일 (먼저 정독)
- `scripts/activate-style.ts` — draft→active 승급(기존 active retire). A/B 학습 draft(component_type='thumbnail_copy')에도 그대로 동작하는지 확인.
- `src/agents/shared/styleProfile.ts` — `loadActiveThumbnailStyle`·`appendThumbnailStyle`(Phase A). 
- `src/agents/hook_maker/prepare.ts` — active 스타일 조건부 주입(Phase A). active 있으면 input.style_profile + system 섹션, 없으면 **바이트 불변**(parity 보존).
- `src/lib/supabase/database.types.ts` — `style_profiles`(active 단일성 partial unique, migration 18 B3).
- 기존 `tests/` 중 styleProfile/hook_maker 관련.

## 작업

### 1. 활성화 호환 확인
- `activate-style.ts`가 A/B 학습으로 생긴 draft(여러 draft 존재 가능 — corpus기반 + A/B기반)를 **id로 지정**해 active 승급할 수 있는지 확인. 안 되면 `--id <style_profile_id>` 인자 추가(어느 draft를 승급할지 사람이 선택). 기존 active는 retired로 내림(partial unique 위반 방지).

### 2. 환류 E2E 테스트 (`tests/styleLoop.test.ts` 신규 또는 기존 확장)
- 순수/단위 수준으로 루프를 검증:
  - active 스타일 patterns가 주어졌을 때 `appendThumbnailStyle`이 system에 스타일 규칙 섹션을 넣는다(훅이가 따라쓸 형태).
  - active 없을 때 훅이 input/system **불변**(promptHash 보존 가정) — `parity:replay`로 입증.
  - (가능하면) `loadActiveThumbnailStyle` 결과를 주입한 훅이 input 형태가 `HookMakerInput.style_profile`과 정합.

### 3. 승인 게이트 명문화
- `docs/operations.md` 또는 `docs/roadmap-next.md`에 짧게: "썸네일 스타일 학습 루프 운영 절차" = ① A/B 결과 추가 → `learn-ab-style.ts --commit`(draft) → ② 사람이 `style-proposed`/`ab-style-proposed` 산출물 검수 → ③ `activate-style.ts --id`로 승급 → ④ 다음 런부터 훅이 자동 환류. **과적합 방지: 신호<5건이면 활성화 보류 권장.**

## 주의
- 코드 변경 최소(검증·테스트·문서). activate-style.ts에 `--id`만 필요시 추가.
- **parity:replay 반드시 그린**(active 없을 때 훅이 불변 = 픽스처 보존).
- 범위 밖(에이전트·파이프라인·DB 스키마) 금지.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run parity:replay
```

## 검증 절차
1. AC 3개 exit 0. 특히 `parity:replay` 그린(픽스처 보존).
2. `git status` 변경 범위 확인.
3. step 2 갱신: 성공 → `"status":"completed"`, `"summary":"활성화 --id 선택+환류 E2E 테스트+운영절차 문서. 루프 닫힘 검증(active→훅이 주입·없으면 parity 보존). typecheck/test/parity 그린"`. 실패(3회) → `"status":"error"`+`error_message`.
