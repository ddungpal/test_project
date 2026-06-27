# Step 1: outline-fewshot-render

## 읽어야 할 파일

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·가드레일
- **step 0 산출물**: `src/agents/structure_extractor/schema.ts`의 `reference_outlines` 형태(`{ topic, outline: [{ section, note? }] }[]`)
- `src/agents/shared/styleProfile.ts` — `appendStructureStyle`(1단계): 현재 `profile.patterns`를 JSON으로 통째 주입 + "── 김짠부 구성 사양 ──" 안내. 여기에 few-shot 목차 렌더 추가
- `src/agents/structurer/prepare.ts` — 구다리 주입(변경 불필요·확인용)

## 목표

structure 프로필 `patterns.reference_outlines`(step0이 채움)를 구다리 SYSTEM에 **가독성 있는 few-shot 목차 예시**로 렌더한다. 없으면 기존과 바이트 동일.

## 작업

`appendStructureStyle`(styleProfile.ts) 보강:
- 기존 집계 패턴 주입은 유지.
- `patterns.reference_outlines`가 있으면(배열·비어있지 않으면) 별도 블록을 덧붙인다:
  ```
  ── 김짠부 실제 목차 예시 ──
  아래는 김짠부 과거 영상의 실제 목차다. 이 전개 흐름을 참고해 이 주제에 맞는 목차를 재창작하라(섹션을 그대로 베끼지 마라).
  [주제1]
   1. 섹션 …
   2. 섹션 …
  [주제2]
   …
  ```
  - 각 편 topic + outline 섹션을 순서대로, 사람이 읽기 쉽게(원 JSON 덤프가 아니라 정리된 목록). note가 있으면 짧게 덧붙임.
  - 방어: patterns가 unknown 기반이므로 `reference_outlines`를 안전하게 배열/객체 검사 후 렌더(깨진 값이면 블록 생략).
- **없거나 빈 배열이면 이 블록을 추가하지 마라**(system 바이트 불변 — promptHash 보존).

⚠️ 집계 패턴 JSON 덤프 안에 reference_outlines가 중복 노출되는지 확인하라. 가독 렌더를 따로 둘 거면, JSON 덤프에서 reference_outlines를 빼고(또는 그대로 두되 중복 허용) — **결정적이고 byte-stable**하게만 하라. 중복이 토큰을 크게 늘리면 JSON 덤프에서 제외하는 쪽을 택하라.

## 테스트

`tests/styleProfile.test.ts`에 추가:
- `reference_outlines` 있는 프로필 → few-shot 블록이 렌더됨(주제·섹션 포함), 결정적.
- `reference_outlines` 없는/빈 프로필 → step0 이전과 동일하게 집계 패턴만(추가 블록 없음).
- 프로필 null → system 바이트 동일(기존 회귀 가드).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(오프라인엔 active structure 프로필이 없어 appendStructureStyle no-op → 구다리 promptHash 불변 → 기존 픽스처 보존. 깨지 마라. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - reference_outlines 없을 때 출력이 step0 이전과 동일한가(바이트 불변).
   - 렌더가 결정적(정렬·형식 고정)인가.
   - 깨진 reference_outlines 값에 크래시하지 않는가(방어).
3. `phases/structure-outline-fewshot/index.json`의 step 1 갱신. index.json 유효 JSON 유지.

## 금지사항

- 활성 프로필 없거나 reference_outlines 없을 때 구다리 SYSTEM을 바꾸지 마라(promptHash·픽스처 보존).
- step0 산출물(structure_extractor 스키마·extract 스크립트)을 바꾸지 마라.
- structurer/prepare.ts 주입 경로를 바꾸지 마라(이미 structure 프로필을 로드·주입한다 — 렌더만 보강).
- 기존 테스트를 깨뜨리지 마라.
