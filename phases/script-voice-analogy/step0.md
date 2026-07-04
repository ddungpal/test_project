# Step 0: voice-empathy (짠펜)

짠펜(scribe) 대본의 두 문제를 **프롬프트 강화**로 잡는다. 사후검사·2차 패스는 안 만든다(프롬프트 우선·재발 시 YAGNI).

1. **말투가 김짠부 채널 목소리가 아님** — 진단: 활성 `tone_profile` v1이 실재하고(시그니처 워딩 16·상용구 13·8개 컴포넌트 전부) 짠펜에 주입되고 있으나, `■ 말투(필수)` 규칙이 **"그대로 체화한다"는 물렁 지시뿐**이다. 강제 템플릿·시그니처 강제 없음. 게다가 "표절 금지"가 목소리 마커 재현까지 밀어내는 긴장이 있다. (title 경로는 `appendTitleStyle` 강제 템플릿 + signature-missing 칩이 있지만 짠펜엔 등가물이 없다.)
2. **흥미도 저하 — 설명만 나열** — 공감대/후킹 규칙이 아예 없어서 대본이 설명 나열로 흐른다.

## 읽어야 할 파일

- `CLAUDE.md` (디자인 톤: 강렬·직설·사색/여백 금지)
- `src/agents/scribe/schema.ts` — `SCRIBE_SYSTEM`. 특히 기존 `■ 말투(필수)` 규칙(vocab·persona·phrases·hooks·rhythm을 "그대로 체화한다"·오프닝 고정 인사 하위불릿)과 그 아래 `■ 표절 금지` 줄. 톤이 어떤 필드(hooks/vocab/banned/rhythm/persona/phrases/easy_explain/sentence_length)로 주입되는지 인지하고, 기존 규칙을 약화시키지 않으면서 강화한다.
- 참고(강제 패턴 선례): `src/agents/shared/styleProfile.ts`의 `appendTitleStyle`(스킬레톤을 '강제 템플릿'으로 렌더). 짠펜에 배선하는 게 아니라 **말투 규칙 강화의 톤 참고용**으로만 본다 — 이 step은 프롬프트 문자열만 손댄다.

## 작업

`SCRIBE_SYSTEM` 문자열만 수정한다. 스키마·세그먼트 수·글자수·후처리·로직·`SCRIBE_PERSONA_DIRECTIVE`/`SCRIBE_SEGMENT_DIRECTIVE`는 건드리지 않는다.

### ① 말투 강제 (기존 `■ 말투(필수)` 규칙 강화)

- 규칙 첫 줄의 필드 나열에 **`sentence_length·easy_explain`을 추가**한다(현재 vocab·persona·phrases·hooks·rhythm만 언급 → 리듬·쉬운설명 예시 차원이 사각지대). 예: `…vocab·persona·phrases·hooks·rhythm·sentence_length·easy_explain을 그대로 체화한다`.
- 기존 하위불릿(오프닝 고정 인사) 아래에 다음 두 하위불릿을 **추가**한다:

```
- ★ 목소리 강제: tone의 signature_words(말버릇·시그니처 워딩)·phrases(상용구)는 참고용이 아니라
  실제로 대본에 박아 쓴다. 문장 리듬도 tone.rhythm 장치(예: 삼중 반복 강조)를 살려 김짠부처럼 말한다.
  밋밋한 표준 설명체로 흐르지 마라.
- 표절 금지는 과거 영상의 '문장·내용'을 베끼지 말라는 것이지, 채널 고유의 '목소리 마커'
  (고정 인사·시그니처 워딩·말버릇)까지 피하란 뜻이 아니다 — 목소리 마커는 김짠부 것이므로 그대로 쓴다.
```

- **모순 주의**: 방금 추가된 `■ 중복 금지` 규칙과 충돌하지 않게 — 중복 금지는 *의미*의 재진술을 막는 것이고, 목소리 마커(시그니처 워딩·인사·말버릇)의 반복 사용은 그 대상이 아니다. 필요하면 목소리 강제 불릿에 그 취지가 자연스럽게 드러나게 쓰되, 억지 문장은 넣지 마라.

### ② 공감대·흥미 (새 `■` 불릿 추가)

기존 불릿들 사이 자연스러운 자리(예: 말투/쉬운설명 근처 또는 자연스러운 연결 규칙 근처)에 추가한다:

```
■ 공감대·흥미(필수): 대본이 설명 나열로만 흐르지 않게, 중간중간 시청자가 "어 이거 내 얘긴데" 하고
  공감·후킹되는 지점을 김짠부 톤으로 넣는다. 흔한 고민·오해·망설이는 순간을 짚어 준다
  (예: "이거 진짜 헷갈리죠?", "나만 이런 거 아니에요").
  - 단, 억지 공감·클리셰 남발 금지, money-safety·사실은 그대로 지킨다. 매 단락 강제는 아니고
    흐름상 자연스러운 지점에만.
```

문안은 위 톤 그대로, 기존 `SCRIBE_SYSTEM`의 `■`/`-`/`·` 마커·들여쓰기 스타일과 일관되게 맞춘다.

### 회귀 가드 테스트 1개 (신설)

`tests/scribeVoiceEmpathy.test.ts`를 신설한다:
- `SCRIBE_SYSTEM`을 import.
- ①을 나타내는 안정 토큰(예: `"목소리 강제"`)과 ②를 나타내는 안정 토큰(예: `"공감대·흥미"`)을 각각 `toContain`으로 단언한다(실제 프롬프트에 쓴 문구와 같은 토큰).
- vitest·새 의존성 금지.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build   # MODULE_NOT_FOUND/PageNotFoundError면 dev 끄고 rm -rf .next 후 재빌드로 stale 판별
```

## 검증 절차

1. 위 AC 실행(전부 exit 0). **dev 서버 돌면 `.next` 지우지 말 것**(stale 500). 필요 시 dev kill 후 `rm -rf .next`.
2. `SCRIBE_SYSTEM` 눈 확인: 말투 강제(목소리 마커 실사용·리듬)·표절금지 구분·공감대 불릿이 들어갔고, 기존 규칙(쉬운설명 북극성·의미단위 출력·money-safety·중복금지·자연스러운 연결·표절금지·형식블록·visual)이 **하나도 삭제·약화 안 됐는지**.
3. `phases/script-voice-analogy/index.json`의 step0을 `completed`+`summary`로 갱신(실패 시 `error`/`blocked`).

## 금지사항

- 사후검사(toneFidelity 배선·정규식 검사)·2차 패스를 만들지 마라(프롬프트 우선·YAGNI).
- 스키마(`SCRIBE_SCHEMA`)·minItems·글자수·후처리(`normalizeSegmentPayload`)·lineage·`SCRIBE_PERSONA_DIRECTIVE`/`SCRIBE_SEGMENT_DIRECTIVE`를 변경하지 마라.
- 기존 규칙 삭제·약화 금지(특히 표절 금지 규칙 자체는 유지하되, 목소리 마커는 그 대상이 아님을 명확히).
- 명세 외 신규 파일(fixtures record 부산물·docs 등) 커밋 금지. 정당한 신규 파일은 `tests/scribeVoiceEmpathy.test.ts` 하나뿐. 커밋 전 `git status`로 범위 외 untracked 제외.
- 기존 테스트 깨뜨리지 마라.
