# Step 0: multiplier-core

새 phase `outlier-refs`의 **토대**. "구독자 대비 조회수가 잘 나온(아웃라이어) 영상"을 레퍼런스로 우선하기 위한 **순수 배수(views/subscribers) 계산·랭킹 헬퍼**를 깔고, 외부 영상의 **썸네일 이미지 URL**을 수집 데이터에 추가한다(step2 썸네일 시각 레퍼런스용). 이후 step1(제목·주제발굴 재정렬)·step2(썸네일 외부 레퍼런스)·step3(UI)의 공통 부품.

## 배경 (현행 — 배수 로직 없음)

- 현재 외부 레퍼런스는 **배수 기준이 없다**: 제목(`hook_maker/externalRefs.ts`)은 **조회수 desc**, 주제발굴(`topic_scout/discovery.ts`)은 **log10(조회수)** 로만 정렬. 구독자수는 fetch·저장·표시만 하고 **랭킹에 안 쓴다**.
- `ExternalItem`(`topic_scout/externalSignals.ts`)에 `viewCount`·`subscriberCount`가 **이미 둘 다 있다** → 배수 = `viewCount / subscriberCount` 계산 가능.
- `ExternalItem`엔 **썸네일 이미지 URL이 없다**(YT `snippet.thumbnails`를 안 잡음) → step2에서 외부 썸네일을 보여주려면 이 step에서 추가해야 한다.

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·크루.
- `src/agents/topic_scout/externalSignals.ts` — **`ExternalItem` 타입**(viewCount/subscriberCount)·**`searchYouTube`**(YT search.list, snippet 파싱·통계 보강). 이 step의 주 변경 대상(배수 헬퍼 + thumbnailUrl 수집).
- `src/agents/hook_maker/externalRefs.ts` — `pickTopExternalTitles`(step1이 배수로 바꿀 소비처 — 여기선 변경 안 함, 헬퍼만 제공).
- `src/agents/topic_scout/discovery.ts` line 84~95 — `signal_score`·evidence(step1 소비처).
- `tests/` 기존 순수 함수 테스트 스타일(예: `tests/winningRefs.test.ts`).

## 작업

### 1) 순수 배수 헬퍼 — `externalSignals.ts`에 추가(단일 출처)

```ts
// 구독자 대비 조회수 배수. 데이터 부족(조회수/구독자 null) 또는 구독자가 노이즈 바닥 미만이면 null.
//   floorSubs: 너무 작은 채널의 과장 배수(예: 구독 10명·조회 1만=1000배) 노이즈 컷.
export function viewsPerSubscriber(
  viewCount: number | null | undefined,
  subscriberCount: number | null | undefined,
  floorSubs?: number,   // 기본값은 호출부에서 — 예: 1000
): number | null;
```

규칙(반드시):
- `viewCount`/`subscriberCount`가 null·비유한·≤0이면 → `null`.
- `subscriberCount < floorSubs`(지정 시)면 → `null`(노이즈 컷 — 초소형 채널 과장 배수 배제).
- 그 외 → `viewCount / subscriberCount`.
- **순수 함수**(DB·네트워크·env 없음·throw 0).

(선택) 같은 파일에 `rankByMultiplier<T>(items, getView, getSub, opts)` 같은 정렬 헬퍼를 둘 수 있으나, 소비처가 2곳뿐이라 step1에서 각자 정렬해도 된다. **과설계 금지** — 최소는 `viewsPerSubscriber` 하나.

### 2) `ExternalItem`에 `thumbnailUrl` 추가 (additive)

- `ExternalItem`에 `thumbnailUrl: string | null` 추가.
- `searchYouTube`가 `snippet.thumbnails`(`high`?.url ?? `medium`?.url ?? `default`?.url)를 잡아 채운다. 웹(`source:"web"`) 항목·없으면 `null`.
- `YtSearchItem`의 snippet 타입에 `thumbnails` 필드 추가.
- **LLM 입력에 영향 없음**(thumbnailUrl은 evidence/UI용·LLM 프롬프트에 안 들어감) → topic_scout/hook_maker promptHash 불변. 단, evidence detail에 싣는 건 step1/step2 소관(여기선 타입·수집만).

### 3) 테스트 `tests/viewsMultiplier.test.ts`

- 정상 배수(조회 50만 / 구독 1만 = 50) 계산.
- 구독자 null/0 → null. 조회수 null → null.
- floorSubs 미만 채널 → null(노이즈 컷).
- (thumbnailUrl 수집은 네트워크라 단위테스트 어려우면 생략 — 순수 헬퍼만 테스트).

## fixture/promptHash 주의

이 step은 **LLM 입력을 바꾸지 않는다**(헬퍼·타입·thumbnailUrl 수집만 — 전부 LLM 프롬프트 밖). → topic_scout/hook_maker/thumbnail_maker promptHash **불변**·fixture 영향 0. (배수가 실제 LLM 입력에 반영되는 건 step1.)

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next` 후 재판별).
2. 체크리스트:
   - `viewsPerSubscriber`가 순수·null 방어·floorSubs 노이즈 컷을 하는가?
   - `thumbnailUrl` 추가가 additive(기존 소비처 안 깨짐)이고 LLM 입력 밖인가?
   - 기존 `pickTopExternalTitles`/`discovery` 동작은 **이 step에서 불변**인가(소비는 step1)?
3. `phases/outlier-refs/index.json`의 step 0 갱신.

## 금지사항

- 이 step에서 `pickTopExternalTitles`·`discovery`의 정렬을 바꾸지 마라. 이유: step1 범위 — 토대만 깐다.
- `rankByMultiplier` 같은 범용 정렬기를 미리 일반화하지 마라(소비처 2곳). 이유: 과설계(YAGNI) — `viewsPerSubscriber` 하나로 충분.
- thumbnailUrl을 LLM 프롬프트 입력에 넣지 마라. 이유: 텍스트 LLM은 이미지 URL을 못 쓴다 + promptHash 변동 유발. UI/evidence용.
- 명세 외 신규 파일(docs·다이어그램)을 커밋에 섞지 마라(`git status` 확인). 기존 테스트를 깨뜨리지 마라.
