# Step 1: topic-spread-system

`topic-keyword-spread`의 **LLM 프롬프트 레이어**. 촉이(`TOPIC_SCOUT_SYSTEM`)가 발굴 모드에서 후보를 **여러(top-N distinct) 수요 키워드에 고르게 분산**하도록 지시한다. step0이 외부 영상을 여러 테마로 깔아줬으니, 프롬프트도 "한 테마 쏠림 금지"를 명시해 쏠림을 막는다.

## 배경

- step0: 발굴 모드가 top-3 distinct 키워드로 youtube 검색 → external_items가 여러 테마로 분산(sourceQuery 태깅·pickSpreadYoutube).
- 그러나 현재 `TOPIC_SCOUT_SYSTEM`은 "후보 3개 이상"·"youtube 근거 과반"만 있고 **테마 분산 규칙이 없다** → 외부 영상이 분산돼도 LLM이 한 테마(강한 것)로 몰 수 있다.
- 실제 증상: 예적금 종류 4개. 분산 지침으로 막는다.

## 읽어야 할 파일

- `src/agents/topic_scout/schema.ts` — **`TOPIC_SCOUT_SYSTEM`**(주 대상)·`focus_keyword` 언급부·결합 원칙. `levelDirective`(수준 모드)·audience_level 블록.
- step0 산출물: `prepare.ts`(ytQueries=top-3)·`externalSignals.ts`(sourceQuery).

## 작업

### `TOPIC_SCOUT_SYSTEM`에 분산 규칙 추가 (발굴 모드)

기존 원칙 보존하고 덧붙인다. 핵심 의도(반드시):

- **★ 발굴 모드(focus_keyword 없음)에서는 후보를 한 주제에 몰지 말고, 시청자 수요가 큰 서로 다른 키워드(top 수요 키워드들·`kw:`)에 고르게 분산한다.**
  - 최소 **2~3개의 서로 다른 수요 키워드/테마**를 커버한다(가능하면 후보마다 다른 테마).
  - 한 테마(가장 강한 것)에 묶이는 후보는 **전체의 절반을 넘기지 않는다**(예적금만 4개 같은 쏠림 금지).
  - external_items(경쟁영상)도 여러 테마로 제공되므로, 각 테마의 잘 터진 영상을 근거로 **서로 다른 주제**를 낸다.
- **focus_keyword가 있으면(키워드 모드)** 이 분산 규칙은 적용하지 않는다 — 그 키워드의 구체적 하위 주제에 집중(기존 동작 유지).
- youtube 영상 기준(조회·반응·배수 우선)·youtube 근거 과반·overlap 최우선·댓글 신호·audience_level·김짠부 정체성 등 **나머지 원칙은 전부 보존**.

> 주의: "youtube 근거 과반"과 "테마 분산"이 충돌하지 않게 — 과반은 youtube evidence를 갖되, 그 youtube 근거가 **서로 다른 테마**를 가리키게 한다(여러 테마 영상이 입력에 있으므로 가능).

## fixture/promptHash 주의

`TOPIC_SCOUT_SYSTEM` 변경 → topic_scout promptHash 변경 → 다음 라이브 런 자동 재기록(claude-p $0). **AC 무관**. 손으로 재기록 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next`).
2. 체크리스트:
   - SYSTEM에 발굴 모드 분산 규칙(2~3 distinct 테마·한 테마 ≤ 절반)이 명시됐는가?
   - 키워드 모드(focus_keyword)는 분산 예외(집중 유지)인가?
   - youtube 기준·과반·댓글·audience_level·정체성 등 나머지 원칙 보존인가?
3. `phases/topic-keyword-spread/index.json`의 step 1 갱신.

## 금지사항

- 키워드 모드에 분산 규칙을 적용하지 마라(focus 집중 의도 훼손).
- "youtube 근거 과반" 규칙을 삭제하지 마라(유튜브 기준 유지) — 분산과 양립하게 문구만 조정.
- audience_level·김짠부 정체성·댓글(kw) 신호·external_items 필드명을 훼손하지 마라.
- 리서치 단계 프롬프트·다른 역할을 건드리지 마라. fixture를 손으로 재기록하지 마라.
- 명세 외 신규 파일을 커밋에 섞지 마라(`git status`). 기존 테스트를 깨뜨리지 마라.
