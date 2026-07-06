# 제목 후보 보관 (title-shortlist) — 설계

- 날짜: 2026-07-06
- 방식: **(A) 대표 1개 + 후보 보관** — 제목 확정 시 대표 1개를 정하고 나머지 1~2개를 후보로 함께 저장, 최종 제목은 나중에(발행 전 아무 때나) 후보 중에서 교체.
- 제약: **마이그레이션 0 · 새 테이블 0 · 상태(state) 0 · 파이프라인 재실행 0.**

## 배경 / 문제

김짠부 직접 피드백 학습(`owner-feedback-rules`) 이후 제목 퀄리티가 좋아져, A/B/C 후보가 여러 개 다 괜찮은 상황이 생김. 지금은 `ProposalSelector`(title_thumb 단계)에서 **딱 1개만** 라디오로 골라 확정 → 그 제목 하나가 downstream(썸네일·구성·리서치·대본)으로 흘러감. "지금 하나로 못 정하겠고 1~3개 남겨뒀다 나중에 고르고 싶다"는 요구.

## 핵심 불변식

downstream 4곳(`structurer/prepare.ts`, `thumbnail_maker/prepare.ts`, `researchScope.ts` ×2)은 전부
`getSelectedStagePayload(supa, runId, "title_thumb").title` 로 **단일 제목 문자열**을 읽는다.
→ **대표 제목을 `payload.title`에 그대로 두면 downstream은 코드 무변경.**
→ `alternates`가 없으면 payload는 기존과 바이트 동일 → promptHash/fixture 보존 · 학습 신호 미오염.

## 데이터 모델 (마이그 0)

`TitlePayload`(`src/lib/dashboard/proposalTypes.ts`)에 옵셔널 필드 1개 추가:

```ts
alternates?: string[]; // 대표 외에 함께 저장한 후보 제목(0~2개). 제목 문자열만 — 썸네일/hook 필드는 대표 것만 유지.
```

확정된 selection payload = `{ title: <대표>, alternates: ["후보2", "후보3"], ...썸네일필드 }`.
저장 경로는 기존 그대로: `selectProposal`의 `editedPayload`(jsonb)로 실려 저장됨 → **백엔드/게이트 무변경**.

후보는 **제목 문자열만** 보관한다(썸네일 레이아웃·메인문구 등 대표 payload의 나머지 필드는 대표 것 유지). (이유: downstream 자산은 대표 기준으로만 생성 — 후보는 최종 제목 텍스트 교체용일 뿐. 후보별 썸네일까지 살리는 건 B안이고 이번 범위 밖.)

## 1. 선택 화면 — `ProposalSelector.tsx` (title_thumb 분기만)

- **대표 지정 = 지금 라디오 흐름 100% 유지.** A/B/C 카드 클릭 → `chosenIdx` = 대표. 확정 UI(선택 이유·수정·"이 안으로 확정")도 그대로.
- **추가되는 것:** 각 후보 카드에 작은 체크박스 "**후보로 같이 저장**". 대표 외에 최대 2개까지 체크(총 3개 상한). 대표로 지정한 카드의 체크박스는 숨김/비활성(대표는 자동 포함).
- **확정(submit) 시:** 체크된 추가 후보들의 title을 모아
  `editedPayload = { ...대표payload, alternates: [체크된 후보 title들] }` 으로 `selectTitles` 호출.
  - 대표 payload가 손편집(editing)됐으면 그 편집본 위에 alternates를 얹는다(기존 editing 병합 로직 유지).
  - 추가 후보 0개면 `alternates` 키를 넣지 않는다(불변식: 바이트 동일).
- title_thumb **외 단계(topic/structure)는 무변경** — 체크박스 UI는 title_thumb 분기에서만 렌더.

## 2. 나중에 고르기 — `PostConfirmTitleEdit.tsx`

이 컴포넌트는 확정(titles_selected) 이후 런 내내 노출되며 이미 제목 손편집·AI재생성을 한다. 여기에 후보 스왑을 얹는다.

- 확정 제목 아래에 `payload.alternates`가 있으면 **후보 목록** 표시(각 제목 + "**이걸 대표로**" 버튼).
- "이걸 대표로" 클릭 → 대표 title과 해당 후보 title을 **맞교환**한 새 payload로 기존 `editTitle(runId, payload)` 호출.
  - `editTitle`은 `TitlePayload` 전체를 받아 `editSelectedTitle`로 새 selection 기록 → **상태 전이 0 · AI 0 · 파이프라인 재실행 0**.
  - 스왑 후 새 대표 title이 `.title`에, 이전 대표는 `alternates`로 내려감. 썸네일 등 나머지 필드는 스프레드로 보존.
- 정직 카피 한 줄:
  *"썸네일·대본은 대표 제목 기준으로 만들어졌어요. 여기서 바꾸면 최종 제목만 교체됩니다."*
  (이 코드베이스의 기존 "자동 반영 안 됨 — 정직 카피" 패턴 미러.)

## 건드리는 파일

| 파일 | 변경 |
|---|---|
| `src/lib/dashboard/proposalTypes.ts` | `TitlePayload.alternates?: string[]` 1줄 |
| `src/components/ProposalSelector.tsx` | title_thumb 분기: 후보 체크박스 + submit 시 alternates 병합 |
| `src/components/PostConfirmTitleEdit.tsx` | alternates 목록 + "이걸 대표로" 스왑(editTitle 재사용) + 정직 카피 |

- 백엔드/액션/게이트/마이그/스키마 **무변경**(기존 selectTitles·editTitle·editedPayload 재사용).
- `editTitle`의 `{...p, title}` 스프레드가 이미 alternates 보존 → 손편집이 후보를 안 지운다(확인 완료).

## 엣지 / 결정

- 대표만 고르고 후보 0개 → 오늘과 동일 동작(alternates 키 없음).
- 스왑은 **제목 텍스트만** 교체 — 썸네일/대본 미갱신(정직 카피로 고지). 자산까지 바꾸려면 손편집·재생성(기존 기능)으로.
- 후보 상한 3개(대표 1 + 추가 2). (이유: A/B/C 3후보 화면 기준. 상한 넘겨 저장할 이유 없음 — YAGNI.)
- 학습 신호: 후보 보관은 학습에 별도 신호 안 보냄(대표=selected가 기존대로 학습됨). alternates는 순수 편의 저장.

## 테스트 (독립 AC)

- 순수 헬퍼로 스왑 로직을 뽑아 유닛 테스트(대표↔후보 맞교환·나머지 필드 보존·상한). — 컴포넌트 밖 `src/lib/**`에 두고 컴포넌트는 호출만(vitest `@/` alias 부재 규칙).
- `alternates` 없을 때 payload 바이트 동일(불변식) 회귀 가드.
- 기존 typecheck/test/build 0 회귀.
