# Step 2: topic-included-warn

## 읽어야 할 파일

먼저 아래를 읽고 후보 주석·소프트 경고 배지 패턴을 이해하라:

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·가드레일·TRUS 3색
- **step 0·1 산출물**: `src/agents/thumbnail_maker/schema.ts`(주제 키워드 규칙)
- `src/agents/thumbnail_maker/prepare.ts` 및 후보 변환부 — `toCandidates`(후보 payload에 `ref_similarity`·`style_conformance` 주석을 부착하는 곳). **이 자리에 주제 키워드 누락 주석을 같은 방식으로 추가**한다
- `src/performance/` 또는 기존 `evaluateStyleConformance` 위치 — 순수 평가 헬퍼 패턴(`ab-style-conformance` phase 산출물). 같은 스타일의 순수함수로 만든다
- UI: `src/components/ThumbnailStudio.tsx` / 후보 카드 렌더(기존 `⚠ A/B 패배 패턴` 칩·`style_conformance` 표시) — 경고 배지를 같은 위치·톤으로
- 테스트: `tests/thumbnailMakerContract.test.ts` 또는 인접 테스트

## 배경

step 0·1은 "주제 키워드 포함"을 지시·학습으로 박았다. 강제 거부는 안 하지만(선택만 철학), 김짠부가 **누락을 한눈에 보고 고를 수 있게** 소프트 경고가 필요하다. 기존 `style_conformance`(⚠ 칩) 패턴을 그대로 미러링한다.

## 작업

### 1. 순수 판정 헬퍼
주제 키워드가 메인문구에 들어갔는지 휴리스틱으로 판정하는 **순수함수**를 추가한다(외부 의존·DB 없음):

```ts
// topic/selected_title에서 핵심 키워드 후보를 뽑아, main 문구들에 포함됐는지 본다.
// 모호하므로 보수적으로: 명백히 누락일 때만 true. 확신 없으면 false(=경고 안 띄움, 오탐 최소화).
export function detectTopicMissing(
  mains: string[], topic: string, selectedTitle: string,
): { missing: boolean; keyword: string | null };
```

판정 규칙(반드시):
- 키워드 추출은 보수적으로(불용어·조사 제거 후 핵심 명사구). 추출 불가하면 `missing:false`(경고 안 함).
- 정규화 후 부분일치(공백/대소문자 무시)로 포함 여부 판단.
- **오탐(없는데 경고)을 과탐보다 더 피하라** — 이유: 잘못된 경고가 신뢰를 깬다. 애매하면 경고하지 않는다.

### 2. 후보 주석
`toCandidates`에서 각 후보 payload에 `topic_missing`(또는 동등) **옵셔널 주석**을 부착한다 — `style_conformance` 옆에. payload 스키마의 다른 부분·계약은 건드리지 마라.

### 3. UI 경고 배지
후보 카드에 주제 키워드 누락 시 `⚠ 주제 키워드 없음`(또는 유사) 칩을 표시한다 — 기존 `⚠ A/B 패배 패턴` 칩과 같은 위치·톤·TRUS 3색. **표시 전용**(클릭 차단·자동 거부 없음).

### 4. 테스트
순수 헬퍼 단위 테스트: 포함/누락/추출불가/약자만 있는 경우 등 경계 케이스. 오탐 최소화 동작 확인.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 주석이 **옵셔널**이고 출력 계약(`thumbnail_main`/`boxes` 개수·maxLength·`additionalProperties`)을 깨지 않는가.
   - 경고가 **표시 전용**이고 후보를 자동 거부하지 않는가.
   - TRUS 3색·기존 칩 톤 일치.
   - 헬퍼가 순수함수(DB·네트워크 의존 없음)인가.
3. `phases/thumbnail-topic-curiosity/index.json`의 step 2 갱신.

## 금지사항

- 키워드 누락 후보를 자동 거부/필터링하지 마라. 이유: 김짠부 '선택만' 철학 — 판단은 사람이 한다(표시 전용).
- promptHash에 영향을 주지 마라(주석은 생성 *후* 부착 — `ref_similarity`/`style_conformance`와 동일 위치). 이유: 픽스처 보존.
- 후보 payload 스키마에 required 필드를 추가하지 마라(옵셔널 주석만).
- 경고 오탐을 과탐보다 우선해서 줄여라(애매하면 경고 안 함).
- 기존 테스트를 깨뜨리지 마라.
