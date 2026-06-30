# Step 1: topic-scout-youtube-system

`topic-youtube-only`의 **LLM 프롬프트 레이어**. 촉이(`TOPIC_SCOUT_SYSTEM`)가 주제를 **유튜브 영상 기준**(현재 관심·조회수·반응도)으로 제안하도록 지시문을 재작성한다. step0이 입력에서 웹 기사를 끊었으니, 시스템 프롬프트도 웹 기사 프레이밍·`web:` evidence를 제거하고 유튜브 영상 + 댓글 중심으로 맞춘다.

## 배경

- step0: `prepare.ts`·`discovery.ts`가 웹 수집을 끊어 `external_items`는 **유튜브 경쟁영상만**(배수 랭킹), 후보는 comment + competitor만. 댓글(`kw:`) 유지.
- 현재 `TOPIC_SCOUT_SYSTEM`(`schema.ts`)은 "웹·YouTube 결합", "external_items(웹·경쟁영상)", "web:/yt:", "신규 제도·트렌드(외부 신호만 evidence)" 등 **웹 기사 전제**가 박혀 있다 → 입력과 불일치. 재작성 필요.

## 읽어야 할 파일

- `src/agents/topic_scout/schema.ts` — **`TOPIC_SCOUT_SYSTEM`**(line 66~87, 주 대상)·`TopicScoutInput`(external_items 필드)·`TOPIC_SCOUT_SCHEMA`(evidence_ids).
- step0 산출물: `prepare.ts`(external_items=유튜브만)·`discovery.ts`.
- `tests/` 중 topic_scout system/schema 참조 테스트(있으면) — 상수 참조라 내용 변경엔 견딘다.

## 작업

### `TOPIC_SCOUT_SYSTEM` 재작성 (유튜브 영상 + 댓글 기준)

기존 구조·공통원칙은 보존하되, **웹 기사 전제를 유튜브 영상으로 교체**한다. 반드시 반영할 의도:

- 입력 신호 설명을 둘로:
  - ① **시청자 댓글 신호**(`kw:…`·question_comment_count) — 내 구독자가 지금 궁금해하는 것(시청자 수요).
  - ② **유튜브 경쟁영상 신호**(`external_items`, `yt:…`: title·publisher·published_at·**조회수·구독자 대비 배수·반응도**) — **지금 밖에서 사람들이 보고 있는·조회수 잘 나온 영상**.
- **핵심 기준(새로 강조)**: 주제는 "**지금 유튜브에서 사람들의 관심을 받는가 / 조회수·반응이 좋은가**"를 우선한다. 경쟁영상 중 **구독자 대비 잘 터진(고배수)·반응 높은** 각도를 적극 반영.
- "웹·기사·신규 제도·정책 트렌드" 같은 **웹 기사 전제 문구 제거**. 외부 신호 = 유튜브 영상으로 단일화.
- evidence 유효 접두사에서 **`web:` 제거** → `'kw:'·'yt:'·'focuskw:<키워드>'·'tc:'`. (`TOPIC_SCOUT_SCHEMA`가 prefix를 강제하지 않으면 스키마 변경 불필요 — 프롬프트 지시만.)
- "external_items 비어있지 않으면 과반은 외부(web:/yt:) evidence" → "**과반은 유튜브 경쟁영상(`yt:`) evidence 포함**, reason에 어떤 영상(제목/채널/조회·반응)이 이 각도를 뒷받침하는지 명시"로 교체.
- 댓글-only 한계·overlap_terms(댓글 ∩ 유튜브) 최우선·focus_keyword 하위주제 발굴·김짠부 정체성·"제목 아닌 주제" 등 **나머지 원칙은 유지**.
- 시청자 수준(audience_level) 블록은 **불변**.

> 주의: 입력 필드명 `external_items`는 유지(step0이 youtube-only로 채움) — 프롬프트에서 "유튜브 경쟁영상"으로 부르되 필드명은 그대로(불필요한 스키마/타입 churn 회피).

## fixture/promptHash 주의

`TOPIC_SCOUT_SYSTEM` 변경 → topic_scout promptHash 변경 → 다음 **라이브 런 자동 재기록**(claude-p $0). **AC 무관**(eval은 fixture 파일 읽기·form-agnostic). 손으로 재기록 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next`).
2. 체크리스트:
   - SYSTEM에서 웹 기사 전제(웹·기사·정책 트렌드·`web:`)가 제거되고 유튜브 영상(조회·반응·배수) 기준이 명시됐는가?
   - 댓글 신호·overlap·audience_level·김짠부 정체성 등 나머지 원칙이 보존됐는가?
   - evidence 접두사 가이드에서 `web:`가 빠졌는가? (스키마가 prefix를 강제하면 거기도 정합 — 아니면 프롬프트만.)
3. `phases/topic-youtube-only/index.json`의 step 1 갱신.

## 금지사항

- `external_items` 필드명을 바꾸지 마라(youtube-only로 채워질 뿐). 이유: 불필요한 타입/스키마 churn.
- audience_level 정의 블록·김짠부 정체성·"제목 아닌 주제" 원칙을 훼손하지 마라. 이유: 검증된 품질 가드.
- 댓글(`kw:`) 신호를 프롬프트에서 제거하지 마라. 이유: 옵션 A — 시청자 관심 신호 유지.
- 리서치 단계 프롬프트·다른 역할을 건드리지 마라. 이유: 주제 선정 한정.
- fixture를 손으로 재기록하지 마라. 명세 외 신규 파일을 커밋에 섞지 마라(`git status`). 기존 테스트를 깨뜨리지 마라.
