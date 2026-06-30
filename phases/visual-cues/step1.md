# Step 1: visual-cue-ui (Esther)

P5의 **UI 레이어**(순수 프론트엔드) — 로드맵 마지막 step. 짠펜이 emit한 `kind='visual'` 세그먼트를 대본 화면에서 **종류별(자막/화면캡처/그래프/표) 시각 큐 배지**로 명확히 보여준다. P1이 만든 기본 `VisualBlock`(단일 '화면' 배지)을 step 0의 `cueType`에 맞춰 확장한다.

## 배경

- **P1**: `SegmentList`의 `VisualBlock`이 visual 세그먼트를 '화면' 배지 + cue + note로 렌더(단일 종류).
- **step 0**(P5): `VisualPayload`에 optional `cueType`('subtitle'|'capture'|'chart'|'table') 추가 + 짠펜이 cueType과 함께 visual 큐 emit.
- **이 step**: `VisualBlock`이 cueType별로 다른 라벨/배지를 보여주게 한다. 백엔드 무변경.

## 읽어야 할 파일

- `src/components/SegmentList.tsx` — **107~119행 `VisualBlock`**(현재 '화면' 배지 + payload.cue + note). 이 컴포넌트만 확장.
- step 0 산출물: `src/pipeline/segmentBlock.ts`의 `VisualPayload`·`VisualCueType`.
- `src/components/ComparisonAssetTable.tsx`·`CaseAssetView.tsx` — P3/P4의 TRUS 배지·강조 패턴 참고.
- `CLAUDE.md` TRUS Create: Black/Yellow/White **3색만**, 그라데이션·그림자·**이모지 금지**(직설). 토큰 `trus-white`/`trus-yellow`/`trus-black`.

## 작업

### 1) `VisualBlock`을 cueType 인지로 확장

- `payload.cueType`에 따라 배지 라벨을 바꾼다(직설 텍스트 — 이모지 금지):
  - `subtitle` → **자막**
  - `capture` → **화면**
  - `chart` → **그래프**
  - `table` → **표**
  - 없음(레거시) → 기존 **화면**(하위호환).
- 배지는 기존 trus-yellow 보더 톤 유지(P1 VisualBlock 스타일 계승). cue(주 텍스트) + note(보조, 있으면) 렌더는 유지.
- prose/table/case 렌더는 **변경 금지**(회귀 0).

### 2) 디자인

- **TRUS 3색만**(임의 색·그라데이션·그림자·이모지 금지). cueType 구분은 라벨 텍스트로(색 남발 금지 — trus-yellow 강조 한 톤).
- 기존 VisualBlock 레이아웃·다른 kind 렌더 회귀 0.

## 금지/범위

- 백엔드(`segmentBlock.ts`·scriptCell·scribe·researchView)를 건드리지 마라. 순수 프론트엔드(`SegmentList.tsx`만).
- prose/table/case 렌더 마크업을 바꾸지 마라. 이유: 회귀 0(실 런 대부분 prose).
- 새 npm 의존성 추가 금지.
- TRUS 3색 외 색·그라데이션·그림자·이모지 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(빌드 깨지면 `rm -rf .next` 후 재판별).
2. 디자인/아키텍처 체크리스트:
   - TRUS 3색만(임의 색·그라데이션·그림자·이모지 0)?
   - 변경이 `SegmentList.tsx`로 한정(백엔드 0)?
   - cueType 없는 레거시 visual이 '화면'으로 안전하게 표시(하위호환)?
   - prose/table/case 렌더 회귀 0?
3. `phases/visual-cues/index.json`의 step 1 갱신(completed+summary / error / blocked).

## 금지사항

- 위 "금지/범위" 전체 준수.
- 명세 외 신규 파일(docs·다이어그램·빌드 산출물)을 커밋에 섞지 마라. `git status` 확인·범위 외 제외(하네스 `git add -A` 떠돌이 함정).
- 기존 테스트를 깨뜨리지 마라.
