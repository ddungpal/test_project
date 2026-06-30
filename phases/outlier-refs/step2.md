# Step 2: thumbnail-outlier-gather

`outlier-refs`의 **썸네일 외부 레퍼런스 데이터 레이어**. 선택된 주제로 **구독자 대비 조회수가 터진(아웃라이어) 외부 유튜브 영상의 썸네일**을 수집해, 썸네일 단계 UI에서 김짠부가 시각 레퍼런스로 볼 수 있게 한다(이미지 + 배수). LLM 변경은 없다.

## ‼️ 설계 제약 (정직하게)

**썸네일메이커는 텍스트 생성기**(`tools:[]`·이미지 못 읽음)다. 따라서 외부 썸네일 **이미지**는 LLM에 못 먹인다 — **김짠부에게 보여주는 시각 레퍼런스**(ThumbnailStudio)로만 쓴다. (외부 영상의 **제목**(텍스트)은 이미 step1에서 배수 정렬되어 `reference_titles_external`로 썸네일메이커에 들어가므로, 카피 생성 개선은 step1이 담당. 이 step은 **이미지 시각 레퍼런스**만 추가.)

## 배경

- step0: `viewsPerSubscriber`·`ExternalItem.thumbnailUrl`.
- step1: 제목/주제발굴 배수 정렬.
- 외부 수집은 `topic_scout/externalSignals.gatherExternalSignals`(웹+YT search) — `hook_maker/externalRefs.gatherTitleReferences`가 이미 이걸 재사용하는 패턴이 있다(옵트인 게이트 `TITLE_REFERENCES==="youtube"`·best-effort·fixture $0).
- 썸네일 단계 UI = `ThumbnailStudio.tsx`(클라이언트), `src/app/runs/[id]/page.tsx`(서버)가 렌더·prop 전달.

## 읽어야 할 파일

- `src/agents/hook_maker/externalRefs.ts` — `gatherTitleReferences`·`titleReferencesEnabled`·`pickTopExternalTitles`(step1 수정됨). **이 step의 `gatherOutlierThumbnails`는 이 패턴을 미러**.
- `src/agents/topic_scout/externalSignals.ts` — `gatherExternalSignals`·`ExternalItem`(thumbnailUrl·viewCount·subscriberCount)·`viewsPerSubscriber`(step0).
- `src/lib/dashboard/*.ts` — 서버 read 뷰 패턴(예: `researchView.ts`·`scriptView.ts` — `"server-only"`·`createAdminClient`). `getOutlierThumbnailRefs`도 이 패턴.
- `src/pipeline/context.ts` — `getSelectedStagePayload(supa, runId, "topic")`로 선택된 주제 읽기.
- `src/app/runs/[id]/page.tsx` — 썸네일 단계(thumbnails_proposed) 렌더·`ThumbnailStudio` prop 전달 지점.

## 작업

### 1) 수집 헬퍼 — `gatherOutlierThumbnails` (externalRefs.ts 또는 신규 모듈)

```ts
export interface OutlierThumbnailRef {
  id: string;                     // url 기반 안정 id
  title: string;
  thumbnailUrl: string;           // 외부 영상 썸네일 이미지(표시용)
  url: string;                    // 영상 링크
  publisher: string | null;       // 채널명
  viewCount: number;
  subscriberCount: number | null;
  multiplier: number | null;       // viewsPerSubscriber
}

// 게이트 off면 즉시 [](네트워크 0). best-effort try/catch(throw 전파 금지).
export async function gatherOutlierThumbnails(topic: string, n: number): Promise<OutlierThumbnailRef[]>;
```

- 게이트 = `titleReferencesEnabled()`(`TITLE_REFERENCES==="youtube"`) **재사용**(외부 유튜브 레퍼런스 단일 옵트인).
- `gatherExternalSignals({ webQueries:[topic], ytQuery: topic, maxPerQuery, volatility:"slow" })` → youtube·thumbnailUrl!=null·viewCount!=null 항목만 → step0 `viewsPerSubscriber(view, sub, FLOOR_SUBS)`로 배수 → **배수 desc**(null 후순위)·url 디덥 → 상위 n.
- (선택·권장) **김짠부 자기 채널 제외**: publisher가 김짠부(@zzanboo)면 외부 레퍼런스에서 뺀다(자기 참조 방지). 채널명/핸들 상수로 비교(불확실하면 주석으로 TODO만 남기고 스킵 가능).

### 2) 서버 read — `getOutlierThumbnailRefs(runId)` (dashboard view)

- `"server-only"` 뷰 함수: 선택된 주제(`getSelectedStagePayload(...,"topic")`)를 읽어 `gatherOutlierThumbnails(topic, N)` 호출, `OutlierThumbnailRef[]` 반환. 주제 없거나 게이트 off면 `[]`.
- **ponytail 주석(비용 천장·업그레이드 경로)**: 이 read는 렌더 시 YouTube API를 친다(dev는 fixture $0, 운영은 호출). 천장이 문제되면 썸네일 prepare 시 1회 수집해 영속화하는 경로로 업그레이드. 지금은 옵트인·best-effort·소량 N으로 충분. (`// ponytail: gather-on-read, persist if render cost matters`)

### 3) page.tsx — 썸네일 단계에 prop 전달

- 썸네일 단계(thumbnails_proposed) 렌더 시 `getOutlierThumbnailRefs(run.id)`를 호출(다른 dashboard read들과 같은 위치·게이트 off면 []), 결과를 `ThumbnailStudio`에 새 prop `outlierRefs`로 넘긴다(렌더는 step3).
- 게이트 off/빈 결과면 prop은 빈 배열 → step3 UI가 아무것도 안 그린다(회귀 0).

### 4) 테스트 `tests/outlierThumbnails.test.ts`

- `gatherOutlierThumbnails`의 **순수 가공부**를 테스트 가능하게: items(고정 ExternalItem 배열) → 배수 정렬·thumbnailUrl/viewCount 게이트·자기채널 제외·상위 n. (네트워크는 fake/주입 또는 순수 pick 함수 분리해 테스트 — `pickTopExternalTitles` 테스트 방식 미러.)
- 게이트 off면 [] (titleReferencesEnabled false).

## fixture/promptHash 주의

이 step은 **LLM 입력을 바꾸지 않는다**(수집·서버 read·prop 전달만) → 모든 역할 promptHash 불변·fixture 영향 0. 외부 수집은 search fixture 레이어로 dev $0.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next`).
2. 체크리스트:
   - 게이트 off면 네트워크 0·`[]`인가? best-effort try/catch로 throw 전파 막는가?
   - step0 `viewsPerSubscriber` 재사용(재구현 금지)인가? 배수 desc·null 후순위인가?
   - LLM 입력/프롬프트 변경이 0인가(순수 데이터·UI 경로)?
   - ponytail 비용 천장 주석이 있는가?
3. `phases/outlier-refs/index.json`의 step 2 갱신.

## 금지사항

- 외부 썸네일 이미지/URL을 썸네일메이커 LLM 입력에 넣지 마라. 이유: 텍스트 LLM은 이미지를 못 쓴다 + 불필요한 promptHash 변동. UI 시각 레퍼런스 전용.
- 새 옵트인 env를 만들지 마라 — `TITLE_REFERENCES="youtube"` 재사용. 이유: 외부 유튜브 레퍼런스 단일 게이트(설정 분산 방지).
- `viewsPerSubscriber`·`gatherExternalSignals`를 재구현하지 마라(import 재사용). 이유: 드리프트·중복.
- ThumbnailStudio 렌더 마크업을 바꾸지 마라(prop만 추가·기본 []). 이유: 렌더는 step3.
- fixture를 손으로 만들지 마라. 명세 외 신규 파일을 커밋에 섞지 마라(`git status`). 기존 테스트를 깨뜨리지 마라.
