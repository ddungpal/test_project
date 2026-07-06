# Step 2: shortlist-swap

확정 후 화면(`PostConfirmTitleEdit`)에서 저장된 후보 목록을 보여주고, "이걸 대표로" 버튼으로 최종 제목을 교체한다. 상태 전이·AI·파이프라인 재실행 없이 **제목 텍스트만** 스왑(방식 A).

## 읽어야 할 파일

- `/docs/specs/2026-07-06-title-shortlist-design.md` — 전체 설계(§2 나중에 고르기 + 엣지/결정).
- `/ARCHITECTURE.md`, `/CLAUDE.md`, `/.claude/rules/rules.md`.
- **step 0 산출물**: `src/lib/title/alternates.ts`(`promotePrimary` 사용) · `src/lib/dashboard/proposalTypes.ts`(`TitlePayload.alternates`).
- **step 1 산출물**: `src/components/ProposalSelector.tsx`(대표 확정 시 alternates가 어떤 형태로 저장되는지 — `{ ...대표, alternates: [...] }`).
- `src/components/PostConfirmTitleEdit.tsx` — 이번에 수정할 컴포넌트. 현재 확정 제목 표시·손편집·AI재생성·`editTitle` 호출·`useTransition`/`router.refresh()` 패턴을 꼼꼼히 읽어라.
- `src/app/actions/topicRun.ts`의 `editTitle(runId, payload: TitlePayload)`(라인 ~172) — 스왑에 재사용. `editSelectedTitle`로 새 selection 기록(상태 전이 없음). 시그니처 변경 금지.
- 온보딩 "자동 반영 안 됨 — 재생성 필요" 정직 카피 사례: `src/components/*`(OnboardingQuiz 등) — 톤 참고.

## 작업

`src/components/PostConfirmTitleEdit.tsx`:

1. effective payload에 `alternates`(길이 ≥1)가 있으면, 확정 제목 아래에 **후보 목록** 섹션을 렌더:
   - 각 후보 제목 텍스트 + "이걸 대표로" 버튼.
   - 정직 카피 한 줄(섹션 상단 또는 버튼 근처): *"썸네일·대본은 대표 제목 기준으로 만들어졌어요. 여기서 바꾸면 최종 제목만 교체됩니다."*
   - `alternates`가 없거나 비면 이 섹션은 렌더하지 않는다(기존 화면과 동일).
2. "이걸 대표로" 클릭 시:
   - `promotePrimary(effectivePayload, altIndex)`로 대표↔후보 맞교환한 새 `TitlePayload`를 만들고
   - 기존 `editTitle(runId, newPayload)`를 호출 → `router.refresh()`.
   - 진행 중 표시·에러 처리·`useTransition`은 기존 손편집 경로 패턴을 그대로 미러.
3. 손편집(제목 직접 수정) 경로와 공존: 손편집으로 대표 title을 바꿔도 `alternates`가 사라지지 않아야 한다(step 0 확인상 `{...p, title}` 스프레드가 보존하지만, 이 컴포넌트의 draft→저장 경로가 alternates를 포함한 effective payload를 넘기는지 확인하고, 누락되면 포함시켜라).

## Acceptance Criteria

```bash
npm run typecheck && npm run test && npm run build
```

전부 exit 0.

## 검증 절차

1. 위 AC 실행.
2. 아키텍처 체크리스트:
   - 스왑이 `editTitle`만 호출하고 상태 전이/Inngest/재생성 트리거를 추가하지 않았는가?
   - `alternates` 없을 때 화면이 기존과 동일한가(회귀 없음)?
   - 손편집이 `alternates`를 지우지 않는가?
   - 신규 색/그림자/그라데이션 없이 기존 Tailwind 토큰만 썼는가?
3. `phases/title-shortlist/index.json`의 step 2 업데이트(completed+summary / error / blocked).

## 금지사항

- 상태 전이·Inngest 이벤트 발행·스테이지 재생성 트리거를 추가하지 마라. 이유: 방식 A는 "재실행 없는 텍스트 스왑" — `editTitle`은 상태 전이 없이 selection만 기록한다.
- `editTitle`/`editSelectedTitle` 시그니처를 바꾸지 마라. 이유: 백엔드 무변경.
- 후보를 텍스트만이 아니라 썸네일 payload까지 스왑하도록 만들지 마라. 이유: 설계상 후보는 제목 문자열만(썸네일/대본 자산은 대표 기준 유지). 자산 변경은 기존 손편집·재생성 기능 몫.
- 스왑 시 사용자에게 재생성을 강요하거나 downstream을 자동 무효화하지 마라. 이유: 정직 카피로 고지만 한다(사용자가 필요시 수동 재생성).
- 기존 테스트를 깨뜨리지 마라.
