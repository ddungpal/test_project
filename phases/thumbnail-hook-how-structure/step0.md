# Step 0: hook-how-structure-and-strength-cap (상·하단 hook→how 골격 + 강도 상한)

## 읽어야 할 파일

- `docs/specs/2026-07-03-thumbnail-hook-how-structure-design.md` (설계·충돌분석 전문)
- `src/agents/thumbnail_maker/schema.ts` — `THUMBNAIL_MAKER_SYSTEM`(교체·추가 대상). 특히:
  - "★메인문구는 '단정·명령·목표 선언'으로 세게 밀어붙인다…" 줄 (R-A: 뒤에 상한 줄 추가).
  - "thumbnail_main의 두 문구는 상단/하단으로 각각 그 자체로 완성된 메시지여야 한다…" 줄 (R-C: **이 줄을 교체**).
- `tests/copyQuestionRegister.test.ts` — 프롬프트 상수 `toContain` 회귀 가드 패턴(미러).
- `tests/thumbnailPersona.test.ts` — `system === THUMBNAIL_MAKER_SYSTEM` 바이트동일 가드(상수 참조라 교체해도 통과 확인).
- `.claude/rules/rules.md`, `CLAUDE.md`, 관련 `docs/` — 시작 전 직접 읽을 것.

## 배경 (판정: (A) corpus 오인코딩 교정)

김짠부 실제 썸네일은 원래 **상단=후킹 → 하단=how**로 이어진다. 그런데 기존 규칙 R-C는 "반쪽 잘린 문장"을
막으려다 **"각 줄 독립 후킹·연결 금지"까지 과잉교정**해 정당한 hook→how를 막았다. 이 step은 R-C를 hook→how
골격으로 **교체**하고, R-A에 **강도 상한**을 더한다. 방향 전환이 아니라 corpus 원형으로의 교정.

⚠️ 코드 로직 변경 없음 — `THUMBNAIL_MAKER_SYSTEM` 문자열만 수정. 스키마·payload·마이그·의존성 0.

## 작업 (schema.ts `THUMBNAIL_MAKER_SYSTEM`)

### (1) R-C 교체 — hook→how 골격

기존 줄 **삭제하고 대체**:
- 삭제: `"- thumbnail_main의 두 문구는 상단/하단으로 각각 그 자체로 완성된 메시지여야 한다. 둘이 이어져야만 말이 되는 반쪽(예: '배당받고도'+'주가 빠집니다')은 금지 — 각 줄을 따로 봐도 후킹이 성립하게 쓴다. (상·하단이 같은 주제를 다른 각도로 강조하는 건 OK, 단 한 문장을 둘로 자르는 건 금지.)"`
- 대체(같은 위치·같은 배열 원소):
  `"- ★상·하단 골격(반드시 준수): thumbnail_main은 [상단=후킹] → [하단=how]로 이어지는 한 쌍이다. 상단은 궁금증을 유발(왜?·정말?·이래도?)하고, 하단은 그 답의 방향='어떻게/무엇으로'를 준다 — 두 줄을 함께 읽으면 무슨 영상인지(주제+각도)가 드러나고, 상단이 던진 궁금증을 하단이 받아 대화가 이어진다. 단 각 줄은 문법적으로 온전한 구여야 한다 — 한 문장을 어중간히 자른 반쪽(예: '배당받고도'+'주가 빠집니다')은 금지(그건 how가 아니라 잘린 문장). 상단은 답을 다 말하지 말고(스포일러 금지) 궁금증만 남긴다. 예: 상단 '통장에 돈 묵히면 손해' → 하단 '파킹통장이 정답'."`
- 바로 아래 예시 줄(`thumbnail_main = ["통장에 돈 묵히면 손해","파킹통장이 정답"]…`)은 이 골격과 정렬 → **그대로 둔다**.

### (2) R-A 강도 상한 추가

기존 "★메인문구는 '단정·명령·목표 선언'으로 세게 밀어붙인다…active 스타일의 emphasis_words·main_copy_notes를
그대로 따른다." 줄은 **재작성 금지·그대로 두고**, 바로 뒤에 새 원소 한 줄 추가:
- `"- ★강도 상한(과잉 금지): 세게 밀어붙이되 강한 긍정·강한 부정을 한 문구에 겹쳐 쌓지 마라 — 예 ✗ '묻지마 매수 최악'(극단 부정 겹침)·'무조건 사세요 안 사면 폭망'. 확신·단정은 유지하되 극단어(무조건/절대/최악/폭망/후회 류)는 한 문구에 최대 1개, 자극·과장 낚시로 넘어가지 않는다(겹쳐 쌓으면 오히려 싸구려·불신). 단정은 단어 하나로 충분하다."`

### 정합 확인
- 새 골격이 기존 "★어미 대비(둘 다 ~요 금지)"·"★어투(존댓말 종결)"·"★주제 키워드 필수"·"호기심 갭"과 모순 없는지 확인
  (모두 공존 가능 — 골격은 구조, 나머지는 표면 규칙).
- "3개는 서로 다른 앵글로 차별화"는 **후보 A/B/C 간** 규칙이지 상·하단 규칙이 아니므로 그대로 둔다.

## 테스트 `tests/thumbnailHookHowStructure.test.ts` (신규)

`copyQuestionRegister.test.ts` 스타일(프롬프트 상수 toContain):
- `expect(THUMBNAIL_MAKER_SYSTEM).toContain("상·하단 골격")` 및 `toContain("하단=how")`.
- 제거 확인: `expect(THUMBNAIL_MAKER_SYSTEM).not.toContain("각 줄을 따로 봐도")`.
- 강도 상한: `expect(THUMBNAIL_MAKER_SYSTEM).toContain("강도 상한")`.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 실행(exit 0). build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드로 판별(rules.md).
2. 체크리스트: R-C 옛 문구가 완전히 사라졌나(교체·잔존 금지)? 골격이 hook→how로 명확한가?
   R-A 원문은 보존하고 상한만 뒤에 붙였나? 기존 어미대비·어투·주제키워드 규칙과 모순 없나?
   thumbnailPersona.test(바이트동일 가드) 통과하나?
3. `git status`로 명세에 없는 신규 파일(fixtures 등) 섞였는지 확인·범위 외 제외(rules.md).
4. `phases/thumbnail-hook-how-structure/index.json` step0을 `completed`+`summary`로 갱신하고 phase status도 `completed`로.

## 금지사항

- R-A(세게 밀어붙인다) 원문을 재작성·약화하지 마라 — 상한 줄만 **추가**(세게는 유지).
- 반쪽 잘린 문장 금지("배당받고도"+"주가 빠집니다")는 **유지**(hook→how는 의미 연결이지 문법 절단이 아님).
- 코드 로직·스키마·payload를 바꾸지 마라(프롬프트 문자열만).
- hook/how·강도 위반의 코드 검출·관측 로깅을 추가하지 마라(범위 밖·의미적).
- 기존 테스트(copyQuestionRegister·thumbnailPersona 등)를 깨뜨리지 마라.
