# Step 0: topic-curiosity-system

## 읽어야 할 파일

먼저 아래를 읽고 썸네일 생성기 프롬프트·입력 구조를 이해하라:

- `CLAUDE.md`, `.claude/rules/rules.md` — 규칙·가드레일
- `src/agents/thumbnail_maker/schema.ts` — `THUMBNAIL_MAKER_SYSTEM` 전문(SYSTEM:44-68 부근), 출력 스키마(`thumbnail_main` 2개·maxLength 20 / `thumbnail_boxes` 2개·maxLength 12 / `additionalProperties:false`)
- `src/agents/thumbnail_maker/prepare.ts` — 입력 조립. `ThumbnailMakerInput`에 `topic`(선택 주제 title), `selected_title`이 이미 들어옴(topic은 `getSelectedStagePayload(supa,runId,"topic")`에서)
- `src/agents/shared/styleProfile.ts` — `appendThumbnailStyle`(active patterns를 SYSTEM 뒤에 덧붙임)
- `tests/thumbnailMakerContract.test.ts` — main/boxes 개수·후보 3개 계약 테스트

## 배경

김짠부 피드백: 썸네일에 **영상 주제 키워드가 무조건 들어가야** 하고(예: 주제 '레버리지 ETF' → 썸네일에 '레버리지 ETF'), 주요 내용을 **힌트처럼** 넣어 호기심을 유발해 클릭하게 만들고 그 답이 **영상 안에서 풀려야** 한다(curiosity gap). 현재 SYSTEM엔 이 규칙이 없다. `topic`·`selected_title`은 이미 입력에 있으므로 LLM이 키워드를 스스로 식별해 넣을 수 있다.

## 작업

`src/agents/thumbnail_maker/schema.ts`의 `THUMBNAIL_MAKER_SYSTEM`에 규칙 2개를 추가한다(기존 '원칙' 섹션 톤에 맞춰, 한국어):

1. **주제 키워드 필수**: "메인문구 2개 중 최소 하나에는 영상의 **주제 핵심 키워드를 그대로** 넣어라(입력 topic·selected_title에서 핵심 명사를 식별). 약자·우회·동의어로 바꾸지 마라. 예: 주제가 '레버리지 ETF'면 썸네일에 '레버리지 ETF'가 보여야 한다."
2. **호기심 갭**: "주요 내용을 힌트처럼 흘려 '왜?/어떻게?'를 남겨라 — 보는 사람이 답이 궁금해 클릭하고, 그 답은 영상 안에서 풀린다. 단, 스포일러처럼 다 말하지도, 낚시처럼 영상과 무관하지도 마라(영상이 실제로 답하는 호기심만)."

규칙 위치: 기존 "원칙:" 블록에 자연스럽게 합류시키되, 두 규칙이 강하게 읽히도록(★ 표기 등 기존 강조 스타일 따름).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(promptHash가 바뀌어 offline 픽스처가 record 모드로 재생성될 수 있다. eval 테스트는 출력 *형태*만 검증하므로 통과해야 한다. 만약 eval이 SYSTEM 문자열을 직접 비교한다면 그 골든만 갱신하라 — 출력 계약은 바꾸지 마라.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 출력 스키마(`thumbnail_main`/`thumbnail_boxes` 개수·maxLength·`additionalProperties:false`)를 **바꾸지 않았는가**.
   - SYSTEM 추가가 기존 어투 규칙(존댓말 명령·반말 금지)·TRUS 제약과 모순되지 않는가.
3. `phases/thumbnail-topic-curiosity/index.json`의 step 0 갱신(completed+summary / error / blocked).

## 금지사항

- 출력 스키마의 maxLength·required·`additionalProperties`를 바꾸지 마라. 이유: 계약 변경은 이 step 범위 밖이고 다운스트림·테스트를 깬다.
- 키워드 포함을 **하드 거부/스키마 강제**로 만들지 마라. 이유: 키워드 추출은 모호하고, 김짠부 '선택만' 철학상 강제 거부가 아니라 강한 지시 + (step 2) 소프트 경고로 간다.
- `prepare.ts` 입력 조립을 크게 바꾸지 마라(topic·selected_title은 이미 들어온다). 필요하면 SYSTEM 지시로 해결.
- 기존 테스트를 깨뜨리지 마라.
