# Step 1: title-style-extract

step0이 만든 `corpus/titles/channel-recent.json`(채널 최근 50개 실제 제목)을 입력으로 **제목 스타일을 학습**해 `style_profiles(component_type='title')` **draft**를 만든다. 활성화는 하지 않는다(사람 게이트). 활성 시 훅이(hook_maker)가 이미 주입 배선을 갖고 있어 다운스트림 코드 변경은 0이다.

## 읽어야 할 파일

먼저 아래를 읽고 제목 스타일의 **기존 학습·주입 계약**을 정확히 파악하라:

- `scripts/extract-tone.ts` — **이 스크립트의 형태를 그대로 미러링한다**: DB/파일 읽기 → 결정적 prep → `callLLM` 1회 → schema 검증 → 산출물 JSON 기록 → dry-run/`--commit`(commit 시에만 draft INSERT) → version=max+1 스코프. costGuard·config·FixtureMiss 처리 포함.
- `src/agents/shared/styleProfile.ts` — **제목 스타일 주입 계약의 단일 출처**. `loadActiveTitleStyle`·`appendTitleStyle`가 읽는 `patterns`(jsonb)의 **정확한 형태**를 확인하라. 학습이 만드는 patterns는 이 형태와 **반드시 일치**해야 활성화 시 훅이 주입이 깨지지 않는다. `TITLE_STYLE_SYSTEM` 상수도 여기(또는 import 경로)에 있다 — **재사용**한다.
- `src/performance/styleRelearn.ts` — 현재 제목 스타일이 ab_variants에서 어떻게 추출돼 `style_profiles(title)`로 저장되는지(component_type 스코프, patterns 모양). 이 step은 **소스만 ab_variants → 채널 raw 제목으로 바꾸는 것**이다. 추출 프롬프트·patterns 스키마를 여기서 재사용하고 새로 발명하지 마라.
- `scripts/activate-style.ts` — 활성화 스크립트(현재 `thumbnail_copy` 스코프). 이 step은 활성화를 **하지 않음**을 확인용으로만 참고. (제목 draft 활성화는 사람이 `/copy-learn`에서 수행.)
- step0 산출물: `corpus/titles/channel-recent.json` (`{video_id,title,published_at}[]`)

## 작업

### `scripts/extract-title-style.ts` (신규)
- **입력 읽기**: `corpus/titles/channel-recent.json` 로드. 없으면 명확한 에러("step0 ingest를 먼저 `--commit`으로 실행"). 제목 0개면 throw.
- **결정적 prep**: 제목 텍스트만 추출해 입력 구성. 예:
  ```ts
  const input = {
    creator: "김짠부",
    note: "아래는 같은 채널에 실제 발행된 영상 제목들이다. 제목 짓는 방식(어휘·구조·길이·후킹 장치)만 추출하라. 내용 주제가 아니라 '제목 스타일'을 학습한다.",
    titles: titles.map((t) => t.title),
  };
  ```
- **`callLLM` 1회**: `roleId: "title_extractor"`, `system: TITLE_STYLE_SYSTEM`(재사용), `schema`는 제목 스타일 patterns 스키마(styleRelearn/styleProfile에서 쓰는 것과 동일 형태). backend=claude-p 시 $0, fixtures로 재현.
- **산출물 파일**: dry-run/commit 공통으로 `corpus/titles/title-style-proposed-<stamp>.json`에 `{source_ref, patterns, evidence_summary}` 기록(검수용). `source_ref` 예: `channel:titles=50 @<stamp>`.
- **`--commit` 시에만 DB INSERT**: `style_profiles`에 `{ component_type: 'title', version: max(title version)+1, patterns, status: 'draft' }`. **version은 component_type='title' 스코프로 max+1**(thumbnail_copy/structure 버전과 섞지 마라). provenance(`profile_training_sources`)는 raw 제목이라 edition_id가 없으므로 **생략**하거나 source_ref에 근거만 남긴다(FK 위반 INSERT 금지).
- **활성화 안 함**: 항상 `status='draft'`로만 저장. active 전환 코드를 넣지 마라.

### 테스트 — `tests/extractTitleStyle.test.ts` (신규 또는 기존 패턴 확장)
- 결정적 prep(제목 배열 → input 구성)과 schema 검증을 fixtures 리플레이로 검증(`extract-tone`/parity 테스트 패턴 미러). 실제 LLM 과금 0.
- patterns가 `appendTitleStyle`이 소비하는 형태를 만족하는지 최소 1케이스로 가드.

### `package.json`
- `extract-tone`처럼 편의 스크립트 한 줄 추가 가능: `"title:extract": "tsx scripts/extract-title-style.ts"`(선택, tone:extract 미러).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(실제 추출(callLLM)·DB INSERT는 AC에서 호출하지 않는다 — 라이브 학습·활성화는 사람이 머지 후. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - patterns 형태가 `loadActiveTitleStyle`/`appendTitleStyle`(styleProfile.ts) 소비 형태와 일치하는가(활성화 시 훅이 주입 계약 보존).
   - `TITLE_STYLE_SYSTEM`·기존 제목 patterns 스키마를 재사용했는가(새 프롬프트/스키마 발명 아님).
   - `style_profiles` INSERT가 `component_type='title'` 스코프 version=max+1이고 `status='draft'`인가(활성화 안 함, 다른 component_type과 버전 안 섞임).
   - CTR/performance_metrics를 일절 읽지 않는가(결정1=(A) 순수 스타일).
   - 훅이(`hook_maker/*`)·styleProfile.ts 등 다운스트림 주입 코드를 수정하지 않았는가(배선은 이미 존재).
3. `phases/title-channel-learn/index.json`의 step 1을 갱신한다(completed+summary / error / blocked). **index.json은 반드시 유효한 JSON으로 저장하라.**

## 금지사항

- 자동 활성화 금지(`status='active'` 전환, 기존 active retired 처리 등). 이유: 사람 게이트 — 사용자가 `/copy-learn`에서 검수 후 승격한다.
- `appendTitleStyle`/`loadActiveTitleStyle`이 읽는 patterns 형태를 바꾸지 마라. 이유: 활성화 시 훅이 주입·프롬프트 해시 계약이 깨진다.
- CTR·`performance_metrics`·`ab_variants` 가중을 쓰지 마라. 이유: 결정1=(A) 순수 스타일 학습(실제 제목 패턴만).
- 훅이(hook_maker)·styleProfile.ts·structurer 등 생성/주입 코드를 수정하지 마라. 이유: 이 step은 학습 소스 추가만, 주입 배선은 이미 존재.
- `profile_training_sources`에 edition_id 없이 FK 위반 INSERT 하지 마라. 이유: raw 제목은 corpus edition이 아니다 — provenance는 생략하거나 source_ref로만.
- 기존 테스트를 깨뜨리지 마라.
