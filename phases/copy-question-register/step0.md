# Step 0: question-register

제목·썸네일 카피에서 **정중-탐문형 질문 어미**("~받을까요?", "~보셨나요?", "~될까요?")가 나오는 버그를 프롬프트에서 막는다. 이 말투는 김짠부 채널이 안 쓰는 광고체인데, 현재 SYSTEM 프롬프트의 어투 규칙이 *명령·권유 종결만* 통제하고 **질문 어미는 사각지대**라서 외부 유튜브 레퍼런스의 정중-의문 클릭베이트 문법이 그대로 새어 나온다.

실제 사례(라이브 산출): 같은 주제(월배당 ETF)에서 한 후보군은 "이렇게 사두세요/속지 마세요"(정상)인데, 외부 레퍼런스가 섞인 후보군은 3개 전부 둘째 줄이 "진짜 사도 될까요?/1년이면 얼마 받을까요?/이것부터 보셨나요?"(전부 정중-탐문)로 나왔다. 구조가 "선언 1줄 + 정중질문 1줄"인데, 이건 외부 클릭베이트 제목의 전형적 문법이다.

## 읽어야 할 파일

먼저 아래를 읽고 SYSTEM 프롬프트 구조와 어투 규칙의 현재 한계를 파악하라:

- `CLAUDE.md` (프로젝트 개요·디자인 톤: 강렬·직설)
- `src/agents/thumbnail_maker/schema.ts` — `THUMBNAIL_MAKER_SYSTEM`. 특히 어투 규칙 줄("★어투(반드시 준수): 명령·권유는 …존댓말 종결…")과 그 위 "✗약한 묘사… 의문 나열은 금지" 줄, 그리고 외부 레퍼런스 가드 줄("reference_titles_external… 후킹 각도는 참고하되 낚시·교육조를 베끼지 말 것").
- `src/agents/hook_maker/schema.ts` — `HOOK_MAKER_SYSTEM`. 어투 전용 규칙이 **없고**, 외부 레퍼런스 가드는 "원칙" 목록의 reference_titles_external 줄("표현·훅 문구를 모방·차용하지 말고…")뿐이다.

두 SYSTEM이 어떻게 구성돼 있는지(배열 join, 기존 규칙 문장 톤) 꼼꼼히 읽고, 기존 규칙을 약화시키지 않으면서 질문 어미 규칙만 추가하라.

## 작업

두 SYSTEM 프롬프트에 **A(질문 어미 규칙)**와 **B(외부 레퍼런스 가드 강화)**를 추가한다. 프롬프트 문자열만 수정한다 — 스키마·로직·후처리 코드는 건드리지 않는다.

### A. 질문 어미 규칙 추가 (두 SYSTEM 모두)

핵심 불변식(반드시 이 의미로 박아넣어라):

> 정중-탐문형 질문 종결(`~까요? / ~셨나요? / ~인가요? / ~될까요? / ~할까요?`)은 김짠부 말투가 아니므로 **금지**한다. 부드럽게 묻는 탐문은 광고·낚시체다. 질문형 후킹을 쓸 거면 **도발·단정형**으로 쓴다(예: "적립식 투자 그만하세요?", "이래도 안 사요?", "이게 맞아요?", "아직도 예금하세요?"). 즉 질문 *자체*가 아니라 정중-탐문 *종결*을 금지하는 것이다.

- `THUMBNAIL_MAKER_SYSTEM`: 기존 "★어투(반드시 준수)" 줄에 이 규칙을 이어 붙이거나 바로 다음 줄로 추가한다. 기존 line의 "통념 반박('적립식 투자 그만하세요?')" 좋은-예시와 **모순되지 않게** — 그건 도발형 질문이라 허용임을 분명히 하라(질문의 종류를 가른다).
- `HOOK_MAKER_SYSTEM`: 어투 전용 규칙이 없으므로 "원칙" 목록에 "- ★어투: …" 한 줄을 신설해 같은 규칙을 넣는다.

### B. 외부 레퍼런스 가드 강화 (두 SYSTEM 모두)

reference_titles_external 관련 줄에 다음 의미를 명시적으로 추가한다:

> reference_titles_external(외부 고조회 유튜브 제목)의 **정중-의문 어미(~까요/~셨나요 등)는 절대 차용 금지** — 각도·소재만 참고하고, 문장 종결은 김짠부 단정·직설체로 재작성한다.

- `THUMBNAIL_MAKER_SYSTEM`: 기존 reference_titles_external 언급 줄("…낚시·교육조를 베끼지 말 것")에 정중-의문 어미 금지를 덧붙인다.
- `HOOK_MAKER_SYSTEM`: 기존 reference_titles_external 줄("표현·훅 문구를 모방·차용하지 말고…")에 정중-의문 어미 금지를 덧붙인다.

### 회귀 가드 테스트 1개 (신설)

`tests/copyQuestionRegister.test.ts`를 신설한다. 규칙이 실수로 삭제·약화되면 깨지는 트립와이어다:

- `THUMBNAIL_MAKER_SYSTEM`과 `HOOK_MAKER_SYSTEM`을 import.
- 각각 정중-의문 금지 규칙을 나타내는 안정된 문구(예: 두 SYSTEM에 공통으로 박은 `"~셨나요"` 또는 `"정중-탐문"` 같은 키 토큰)를 `toContain`으로 1개씩 단언한다. (A에서 실제로 쓴 문구에 맞춰 토큰을 고를 것 — 테스트와 프롬프트가 같은 토큰을 쓰게 하라.)
- 프레임워크는 기존 테스트와 동일(vitest). 새 의존성 추가 금지.

## Acceptance Criteria

```bash
npm run typecheck   # 타입 에러 없음
npm test            # 신규 포함 전부 통과
npm run build       # 컴파일 에러 없음 (PageNotFoundError/chunk MODULE_NOT_FOUND이면 rm -rf .next 후 재빌드로 stale 캐시 판별)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다(전부 exit 0).
2. 두 SYSTEM 프롬프트를 눈으로 확인한다:
   - 정중-탐문형 금지 + 도발·단정 질문 허용이 둘 다 명확한가?
   - 기존 어투 규칙(반말 명령 금지·존댓말 종결)과 line의 통념반박 좋은-예시가 그대로 살아있는가?
   - 외부 레퍼런스 가드에 정중-의문 어미 차용 금지가 들어갔는가?
3. 결과에 따라 `phases/copy-question-register/index.json`의 step0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- styleConformance(`src/agents/hook_maker/styleConformance.ts`)·toneFidelity(`src/performance/toneFidelity.ts`)·titleSignature 같은 **사후 검사 코드를 건드리지 마라.** 이유: A+B(프롬프트 입구 차단)가 근본 수정이다. 사후 어미 분류기(정규식 검사)는 이걸로도 재발할 때만 별도 phase로 — 지금 넣으면 YAGNI.
- 출력 스키마(`THUMBNAIL_MAKER_SCHEMA`·`HOOK_MAKER_SCHEMA`)·candidate 개수·글자수(maxLength) 제약을 변경하지 마라. 이유: 톤 규칙만 손보는 phase다.
- 기존 어투 규칙(반말 명령 금지·존댓말 종결 강제)을 약화하거나, line의 "적립식 투자 그만하세요?" 같은 도발형 질문 좋은-예시를 지우지 마라. 이유: 질문 *종류*(도발 허용/탐문 금지)를 가르는 것이지 질문 자체를 막는 게 아니다.
- 명세에 없는 신규 파일(fixtures/parity record 부산물·docs·다이어그램 등)을 커밋에 섞지 마라. 커밋 전 `git status`로 범위 외 untracked를 확인하고 제외한다. (이번 step의 정당한 신규 파일은 `tests/copyQuestionRegister.test.ts` 하나뿐.)
- 기존 테스트를 깨뜨리지 마라.
