# Step 3: outlier-refs-ui (Esther)

`outlier-refs`의 **UI 레이어**(순수 프론트엔드). (1) 썸네일 단계에 **외부 아웃라이어 영상 썸네일 레퍼런스 패널**(이미지 + 배수)을 띄우고, (2) 기존 외부 출처 표시(SourceLinks)에 **구독자 대비 배수**를 노출한다.

## 배경

- step1: 제목·주제발굴이 배수 정렬됨(`ExternalTitleRef.multiplier`·discovery evidence.multiplier).
- step2: `getOutlierThumbnailRefs(runId)` → `OutlierThumbnailRef[]`(title·thumbnailUrl·multiplier·viewCount·subscriberCount·url·publisher)가 `ThumbnailStudio`에 `outlierRefs` prop으로 전달됨(게이트 off면 []).
- 썸네일메이커는 이미지를 못 읽으므로 이 패널은 **김짠부 시각 레퍼런스**(영감)다.

## 읽어야 할 파일

- `src/components/ThumbnailStudio.tsx` — 썸네일 A/B/C 편집 UI. step2가 넘긴 `outlierRefs` prop을 받아 패널을 추가한다.
- step2 산출물: `OutlierThumbnailRef` 타입·`getOutlierThumbnailRefs`.
- `src/components/SourceLinks.tsx` — 외부 출처 표시(`구독 N · 조회 M`). 여기에 배수 추가.
- `src/lib/dashboard/proposalTypes.ts` — `ProposalSource`(SourceLinks가 받는 타입 — multiplier 노출하려면 여기/소스 저장에 배수가 있어야. 없으면 SourceLinks는 view/sub로 즉석 계산 표시만).
- `src/components/ComparisonAssetTable.tsx`·`CaseAssetView.tsx` — TRUS 표시 패턴 참고.
- `CLAUDE.md` TRUS Create: Black/Yellow/White **3색만**, 그라데이션·그림자·이모지 금지.

## 작업

### 1) `ThumbnailStudio` — 외부 아웃라이어 썸네일 패널

- `outlierRefs: OutlierThumbnailRef[]` prop 추가(기본 []). 비어 있으면 패널 미표시(게이트 off·수집 0 → 회귀 0).
- 패널: 제목 "이 주제로 구독자 대비 터진 영상" 류. 각 ref를 카드로 — **썸네일 이미지**(`<img>` `thumbnailUrl`, lazy·고정 비율·`alt`=title) + 제목 + **배수 배지**(`구독대비 ×50` 식, trus-yellow 강조) + 조회수/구독자(보조) + 영상 링크(`url`, http/https만·`rel="noopener noreferrer" target="_blank"`).
- 이미지 로드 실패 방어(onError 또는 빈 src 가드). 가로 스크롤/그리드로 N개 나열. **A/B/C 편집·교정 패널 동작은 불변**(레퍼런스는 보조 영역).

### 2) `SourceLinks` — 배수 노출

- youtube 출처에서 `viewCount`·`subscriberCount`가 둘 다 있으면 **배수**(`구독대비 ×K`)를 `구독 N · 조회 M` 옆에 덧붙인다. (배수 값이 source/proposalTypes에 없으면 view/sub로 즉석 계산 — 단순 표시·trus-yellow.)
- 기존 표시·토글 동작 불변.

### 3) 디자인

- **TRUS 3색만**(임의 색·그라데이션·그림자·이모지 금지). 배수 배지·강조는 trus-yellow 한 톤.
- `<img>`는 외부 URL — 안전하게(스킴/도메인 신뢰는 YouTube 썸네일 호스트). next/image 강제 아님(순수 `<img>` 허용 — 새 설정·의존성 회피).

## 금지/범위

- 백엔드(gather·서버 read·externalSignals·LLM)를 건드리지 마라. 순수 프론트엔드 + prop/표시.
- 외부 썸네일 이미지를 LLM/생성 입력으로 보내지 마라(시각 레퍼런스 전용).
- ThumbnailStudio의 A/B/C 생성·재생성·확정·교정 로직을 바꾸지 마라(레퍼런스 패널 추가만). 이유: 회귀 위험.
- 새 npm 의존성(이미지 라이브러리 등) 추가 금지 — `<img>` + Tailwind.
- TRUS 3색 외 색·그라데이션·그림자·이모지 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next`).
2. 디자인/아키텍처 체크리스트:
   - TRUS 3색만(임의 색·그라데이션·그림자·이모지 0)?
   - `outlierRefs` 빈 배열이면 패널 미표시(게이트 off 회귀 0)?
   - 이미지 링크가 http/https·noopener·alt·로드실패 방어인가?
   - A/B/C 편집·교정 동작 회귀 0인가?
   - 백엔드/LLM 변경 0인가?
3. `phases/outlier-refs/index.json`의 step 3 갱신.

## 금지사항

- 위 "금지/범위" 전체 준수.
- 명세 외 신규 파일(docs·다이어그램·빌드 산출물)을 커밋에 섞지 마라(`git status` 확인). 기존 테스트를 깨뜨리지 마라.
