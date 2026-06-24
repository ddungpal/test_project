# Step 1: conformance-ui

**부합도/위반을 제목·썸네일 카드에 표면화(프론트엔드).** step0이 각 후보 payload에 `style_conformance: { banned_hits, winning_score }`를 주석했다. 김짠부가 선택할 때 "이 안이 A/B 학습(이긴/진 패턴)에 얼마나 맞는지" 보이게 한다.

## 읽어야 할 파일 (먼저 정독)
- `src/lib/dashboard/proposalTypes.ts` (step0 갱신) — `TitlePayload.style_conformance?: { banned_hits: string[]; winning_score: number }`.
- `src/components/CandidateBody.tsx` — `title_thumb` 분기. 직전 phase에서 `ref_similarity` 경고 칩(`⚠ 레퍼런스와 유사`)을 제목 옆에 렌더하는 패턴이 있음. **그 옆에 conformance 표시 추가.**
- `src/agents/hook_maker/styleConformance.ts`(step0) — `STYLE_CONFORMANCE_BANNED_FLAG` 상수(단일 출처로 import).

## 작업
`CandidateBody.tsx` title_thumb 분기, payload `p.style_conformance` 사용(없으면 표시 생략):
- **⚠ banned 매칭 칩**: `sc.banned_hits.length >= STYLE_CONFORMANCE_BANNED_FLAG`이면 `⚠ A/B 패배 패턴`(노랑) 칩 — ref 경고 칩 옆/아래. (가능하면 hits 첫 항목을 title 속성/툴팁으로.)
- **부합도 점수(작게)**: `winning_score`를 `A/B 부합 NN%`처럼 작은 캡션(`text-[10px] text-trus-white/45`). 0이면(중립·신호없음) 생략.
- 위치: 기존 제목 블록(`mt-3 border-t pt-2`) 안, ref 경고와 같은 줄/아래. TRUS 3색·radius 0·그림자 금지.
- payload는 unknown — `p.style_conformance?.banned_hits ?? []`·`?? 0` 방어. title_thumb 외 단계엔 미적용(해당 분기에만).

## 주의
- **표시 전용** — 자동 거부/필터 금지(김짠부 '선택만' 철학: 정보 제공, 판단은 사람). banned여도 후보는 그대로 보이고 선택 가능.
- step0의 데이터·백엔드는 건드리지 마라.
- 임계값은 `STYLE_CONFORMANCE_BANNED_FLAG` import(하드코딩 중복 금지).
- 직전 phase 산출(ref_similarity 칩·레이아웃 삭제·간격)을 깨지 마라.
- 이 step은 **UI 신호** → Esther 투입.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 전부 exit 0.
2. (가능하면) 로컬: style_conformance 있는 후보에서 ⚠칩·부합도% 표시, 없으면 생략, 다른 단계 영향 없음 육안. 헤드리스면 타입·빌드 갈음.
3. step 1 갱신: 성공 → `"status":"completed"` + `"summary":"CandidateBody title_thumb에 style_conformance 표시(⚠ A/B 패배 패턴 칩 STYLE_CONFORMANCE_BANNED_FLAG 기준 + A/B 부합 NN% 캡션, 없으면 생략). 표시 전용·자동거부 없음. ref 칩·간격 보존. tc/test/build 그린"`. 실패(3회) → `"status":"error"`+`error_message`.

## 금지사항
- 자동 거부/필터 금지(표시만).
- 백엔드/step0 수정 금지.
- 기존 테스트·직전 phase UI를 깨뜨리지 마라.
