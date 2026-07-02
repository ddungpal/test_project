# Step 2: target-first-ui

홈 새 런 UI(`NewRunButton`)에 4번째 탭 **"타겟 먼저"**를 추가한다. 한 줄 타겟 자유입력 → `startTopicRun`에 targetPersona 전달. 기존 세 탭(discovery/keyword/seed)의 패턴을 그대로 미러한다.

## 읽어야 할 파일

- `docs/specs/2026-07-02-target-first-mode-design.md` — "UX" 절.
- `phases/target-first-mode/step0.md`·`step1.md` 및 산출물 — `startTopicRun(topic?, levelSplit?, targetPersona?)` 시그니처(step0)와 촉이 동작(step1). UI가 이 action을 호출한다.
- `src/components/NewRunButton.tsx` — **수정 대상.** `type Mode = "discovery" | "keyword" | "seed"`(~L13), 탭 렌더(~L72-74), state(mode·topic·keyword·intent·levelSplit·refs ~L18-21), levelSplit 토글(~L59-65), discovery 제출 `startTopicRun(undefined, levelSplit)`(~L82), keyword 제출(~L96-102), seed 제출(~L112-179). **키워드 탭이 가장 가까운 미러 대상**(단일 텍스트 입력 + 제출).
- `src/app/page.tsx` — `<NewRunButton>` 렌더 지점(참고·수정 불필요 예상).

## 작업

`src/components/NewRunButton.tsx`만 수정:

- `Mode`에 `"targetFirst"` 추가 + 4번째 탭 버튼 "타겟 먼저".
- state에 `targetPersona`(string) 추가.
- 탭 본문: 한 줄 자유입력(textarea 또는 input) — placeholder 예: "2030 사회초년생, 목돈 굴리기 막막한 사람". 짧은 안내문("이 타겟에게 맞는 주제만 촉이가 발굴합니다").
- 제출: `startTopicRun(undefined, undefined, targetPersona.trim())` — **topic 없음(discovery 경로)·levelSplit 미전달**(이 탭에선 levelSplit 숨김·전달 안 함). 빈 입력이면 제출 비활성(키워드 탭의 빈값 가드 미러).
- **levelSplit 토글은 이 탭에서 렌더하지 마라**(discovery/keyword 탭에서는 그대로 유지). 고정 persona가 대상을 정의하므로.
- TRUS 3색·기존 탭 스타일 재사용. 새 색·그라데이션·그림자 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test            # 기존 테스트 전부 통과
npm run build
```

- 클라이언트 컴포넌트 UI라 단위 테스트 필수 아님(순수 헬퍼 추출할 로직 없음·인라인). 기존 테스트 불변. **순수 헬퍼가 필요하면 컴포넌트가 아니라 `src/lib/**`에 두고 export**(vitest `@/` alias 부재로 컴포넌트 직접 테스트 시 스위트 로드 실패하는 기존 함정 회피).

## 검증 절차

1. 위 AC 실행.
2. 체크리스트: 4번째 탭이 discovery/keyword/seed와 공존(기존 3탭 동작 불변). target-first 제출이 `startTopicRun(undefined, undefined, persona)` 호출. levelSplit는 이 탭에서만 숨김(다른 탭 유지). TRUS 3색.
3. `phases/target-first-mode/index.json` step 2 갱신.
4. **UI 동작(탭 전환·제출)은 클라 사이드라 브라우저 수동 검증 필요** — summary에 "브라우저 검증 대기" 명시.

## 금지사항

- **기존 3탭(discovery/keyword/seed)의 동작·제출 인자를 바꾸지 마라. 이유: 회귀. discovery는 `startTopicRun(undefined, levelSplit)` 그대로.**
- **이 탭에 levelSplit 토글을 렌더하지 마라. 이유: 고정 persona가 대상을 정의(설계 결정). 단 다른 탭의 levelSplit은 보존.**
- **백엔드(action·prepare·stage·schema)를 수정하지 마라. 이유: step0/1에서 끝냄. 이 step은 UI만.**
- **새 색·그라데이션·그림자 금지(TRUS Create 3색).**
- 기존 테스트를 깨뜨리지 마라.
