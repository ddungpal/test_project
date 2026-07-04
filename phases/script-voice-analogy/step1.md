# Step 1: analogy-open-outcome (유이/analogist)

유이(analogist)의 비유가 매력적이지 않은 문제를 **프롬프트 강화**로 잡는다. 사용자 요구: 비유·예시를 "나중에 더 오를지·횡보할지·떨어질지 모든 가능성을 가진 케이스"로 고도화.

진단: `ANALOGIST_SYSTEM`이 비유 품질에 대해 **친숙함(‘아!’ 하게)·사실 정합성·distortion_note(왜곡 실토)**만 지시하고, **결과의 다방향성(불확실성)을 담으라는 지시가 0**이다. 그래서 한 방향으로만 좋게/나쁘게 끝나는 결정적 비유가 나온다. 비유 자체의 결과-프레이밍을 소유하는 건 유이다(추출기·짠펜 아님).

## 읽어야 할 파일

- `src/agents/analogist/schema.ts` — `ANALOGIST_SYSTEM`(비유 담당 유이)과 출력 스키마(`concept`·`analogy`·`distortion_note`). 특히 `- analogy: 처음 듣는 사람도 '아!' 하게…` 줄과 `- distortion_note:` 줄, `■ 사실 기반(필수)` 줄.
- `src/agents/analogist/step.ts` — `analogyStep`이 `appendAnalogyStyle(ANALOGIST_SYSTEM, analogyStyle)`로 학습 기법을 얹는 구조(프롬프트 변경은 promptHash·골든 fixture 갱신 유발 — 인지만).
- 참고: `src/agents/shared/analogyStyle.ts`의 append 텍스트(기법만 학습·소재 재사용 금지 이중가드). 이번 규칙이 그 가드와 모순되지 않아야 한다(결과 다방향성은 '기법' 차원이라 무관).

## 작업

`ANALOGIST_SYSTEM` 문자열만 수정한다. 출력 스키마·`step.ts`·`appendAnalogyStyle`·로직은 건드리지 않는다.

`- analogy: …` 줄 아래(또는 그와 자연스러운 자리)에 다음 취지의 규칙을 **추가**한다:

```
- 결과가 열린 케이스로: 비유·예시는 하나의 결과로 단정하지 말고, 나중에 오를 수도·제자리(횡보)일 수도·
  떨어질 수도 있는 여러 가능성을 함께 담는다(특히 투자·수익처럼 결과가 불확실한 개념).
  한 방향으로만 좋게/나쁘게 끝나는 비유는 피한다. 단, 검증된 사실과 어긋나선 안 되고,
  불확실한 걸 확실한 것처럼 말하지 않는다.
```

- 기존 `■ 사실 기반(필수)`·money-safety 취지와 **양립**(오히려 강화 — 불확실을 확실처럼 말하지 말라는 것과 같은 방향).
- `ANALOGIST_SYSTEM`의 기존 마커·톤 스타일과 일관되게. `- ` 하위불릿 형식 유지.

### 회귀 가드 테스트 1개 (신설)

`tests/analogistOpenOutcome.test.ts`를 신설한다:
- `ANALOGIST_SYSTEM`을 import.
- 새 규칙의 안정 토큰(예: `"결과가 열린"` 또는 `"횡보"`)을 `toContain`으로 단언한다(실제 문구와 같은 토큰).
- vitest·새 의존성 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build   # MODULE_NOT_FOUND/PageNotFoundError면 dev 끄고 rm -rf .next 후 재빌드로 stale 판별
```

## 검증 절차

1. 위 AC 실행(전부 exit 0). dev 서버 돌면 `.next` 지우지 말 것.
2. `ANALOGIST_SYSTEM` 눈 확인: 결과 다방향 규칙이 들어갔고, 기존 규칙(친숙함·사실 기반·distortion_note·김짠부 톤)이 삭제·약화 안 됐는지. analogyStyle append 가드와 모순 없는지.
3. `phases/script-voice-analogy/index.json`의 step1을 `completed`+`summary`로 갱신(실패 시 `error`/`blocked`).

## 금지사항

- 출력 스키마(`concept`·`analogy`·`distortion_note`)·`analogyStep`·`appendAnalogyStyle`·`analogyStyle.ts`를 변경하지 마라.
- `analogy_extractor`(추출기) 프롬프트는 이번 범위 아님 — 건드리지 마라(기법 학습 경로는 별개).
- 기존 규칙 삭제·약화 금지.
- 명세 외 신규 파일 커밋 금지. 정당한 신규 파일은 `tests/analogistOpenOutcome.test.ts` 하나뿐. 커밋 전 `git status`로 범위 외 untracked 제외.
- 기존 테스트 깨뜨리지 마라.
