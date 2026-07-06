# Step 0: alternates-model

제목 후보 보관(title-shortlist) 기능의 **타입 + 순수 헬퍼 + 유닛 테스트**. UI·액션·백엔드는 이 step에서 손대지 않는다.

## 읽어야 할 파일

먼저 아래를 읽고 설계 의도와 기존 패턴을 파악하라:

- `/docs/specs/2026-07-06-title-shortlist-design.md` — 이 기능의 전체 설계(방식 A: 대표 1개 + 후보 보관).
- `/ARCHITECTURE.md` — FE/BE/DB 계층 지도.
- `/CLAUDE.md`, `/.claude/rules/rules.md` — 프로젝트 규칙(특히: 컴포넌트에서 유닛 테스트할 순수 헬퍼는 `src/lib/**`에 두고 export).
- `src/lib/dashboard/proposalTypes.ts` — `TitlePayload` 인터페이스(여기에 필드 1개 추가).
- `src/app/actions/topicRun.ts`의 `editTitle`(라인 ~172) — 스왑이 나중 step에서 호출할 기존 액션. `{...p, title}` 스프레드로 payload 전체를 새 selection으로 기록(상태 전이 없음). 이 헬퍼가 만드는 payload가 여기에 그대로 들어간다.
- 기존 순수 헬퍼+테스트 패턴 참고: `src/lib/outline/` 또는 `src/lib/onboarding/recap.ts` + 대응 `tests/*.test.ts`.

## 작업

### 1. 타입 확장 — `src/lib/dashboard/proposalTypes.ts`

`TitlePayload` 인터페이스에 옵셔널 필드 1개 추가:

```ts
alternates?: string[]; // 대표 외에 함께 저장한 후보 제목(0~2개). 제목 문자열만 — 썸네일/hook 필드는 대표 것만 유지.
```

다른 필드·인터페이스는 건드리지 마라.

### 2. 신규 순수 헬퍼 — `src/lib/title/alternates.ts`

`TitlePayload`(`@/lib/dashboard/proposalTypes`)를 import해 아래 두 순수 함수를 export한다. **부수효과·I/O·DB 접근 없음.**

```ts
/**
 * 대표 payload에 추가 후보 제목들을 alternates로 부착한다.
 * - extraTitles를 정제: 트림, 빈문자 제거, 대표 title과 중복 제거, 서로간 중복 제거.
 * - 정제 후 상한 2개(초과분은 버린다).
 * - 정제 결과가 0개면 alternates 키를 넣지 않는다(원본과 형태 동일).
 * ★ 불변식: extraTitles가 실질적으로 비면 반환값은 primary와 deep-equal 이어야 한다
 *   (alternates 키가 undefined도 아니고 아예 없음). 이유: 다운스트림 promptHash/fixture 보존.
 */
export function mergeAlternates(primary: TitlePayload, extraTitles: string[]): TitlePayload;

/**
 * 대표 title과 alternates[altIndex]를 맞교환한 새 payload를 반환한다.
 * - 나머지 필드(thumbnail_layout 등)는 스프레드로 그대로 보존.
 * - altIndex가 범위를 벗어나거나 alternates가 없으면 payload를 변경 없이 반환.
 * - 교환 후 이전 대표 title이 alternates의 같은 자리에 들어간다(목록 길이 유지).
 */
export function promotePrimary(payload: TitlePayload, altIndex: number): TitlePayload;
```

상한 값(2)은 파일 상단 상수로 두고 주석으로 근거를 남겨라(대표 1 + 추가 2 = A/B/C 3후보 화면 기준).

### 3. 유닛 테스트 — `tests/titleAlternates.test.ts`

vitest. 최소 아래 케이스:

- `mergeAlternates`: 후보 2개 정상 부착 / 대표 title과 중복인 후보 제거 / 빈문자·공백 후보 제거 / 상한 초과(3개 넣으면 2개만) / **후보 0개 또는 전부 정제 탈락 시 반환값이 primary와 deep-equal(불변식)**.
- `promotePrimary`: 대표↔후보 맞교환 정상 / 나머지 필드(thumbnail_layout 등) 보존 / 범위 밖 index는 무변경 / alternates 없을 때 무변경.

## Acceptance Criteria

```bash
npm run typecheck && npm run test && npm run build
```

전부 exit 0. 신규 테스트(`tests/titleAlternates.test.ts`)가 통과에 포함되어야 한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 순수 헬퍼가 `src/lib/title/`에 있고 컴포넌트/액션을 import하지 않는가?
   - `TitlePayload` 변경이 옵셔널 1줄뿐이고 기존 소비처를 안 깨뜨리는가?(typecheck로 확인)
   - CLAUDE.md 보안 규칙(민감정보 커밋 금지) 위반 없는가?
3. 결과에 따라 `phases/title-shortlist/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약(생성 파일·export 함수)"`
   - 3회 시도 후 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- UI 컴포넌트(`ProposalSelector.tsx`, `PostConfirmTitleEdit.tsx`)·서버 액션·게이트·마이그레이션을 손대지 마라. 이유: 이 step은 lib+test 전용, 스코프 분리(다음 step이 소비).
- `mergeAlternates`가 후보 0개일 때 `alternates: []`를 넣지 마라. 이유: 불변식(빈 배열도 형태 변경 → promptHash/fixture 오염). 키 자체를 넣지 않는다.
- 헬퍼에 DB·fetch·Date.now 등 부수효과를 넣지 마라. 이유: 순수함수여야 컴포넌트 밖에서 유닛 테스트된다.
- 기존 테스트를 깨뜨리지 마라.
