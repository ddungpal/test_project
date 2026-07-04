# Step 0: redundancy-flow

짠펜(scribe) 대본의 두 가지 품질 문제를 **프롬프트 입구에서** 막는다. 사후 검사·2차 편집 패스는 만들지 않는다(프롬프트 우선·재발 시 YAGNI).

1. **단락 내 의미 중복** — 같은 의미를 다른 말로 되풀이. 현재 `SCRIBE_SYSTEM`에 중복 금지 규칙이 0개다. "쉬운 설명 북극성"(비유·예시 먼저 → 그다음 설명) 패턴이 구조적으로 재진술을 유도하고(비유로 한 번·문자 그대로 또 한 번), 단일 패스 생성이라 모델이 자기 재진술을 못 잡는다.
2. **단락 간 연결 부자연** — 대본이 낭독하기에 끊긴다. `SCRIBE_SYSTEM`이 "의미 단위로 나눠라"만 강조해 각 섹션이 자기완결적으로 써지고, 세그먼트 간 전환/낭독 연속성 지시가 전무하다. 목표는 김짠부가 처음부터 끝까지 그대로 소리 내어 읽을 수 있는 대본이다.

짠펜은 대본 **전체를 한 번의 LLM 호출**로 생성하므로(`scribeStep`) 전 세그먼트를 서로 보면서 쓴다 — 즉 이 두 규칙은 단일 호출 안에서 전역적으로 적용될 수 있다. 단일 세그먼트 재작성(`scribeSegmentStep`)도 `SCRIBE_SYSTEM`을 그대로 포함하므로 이음새(seam) 문제에도 같은 규칙이 자동 적용된다.

## 읽어야 할 파일

먼저 아래를 읽고 `SCRIBE_SYSTEM`의 구조(■ 불릿 나열·기존 규칙 톤)를 파악하라. 기존 규칙을 약화시키지 않으면서 두 규칙만 추가한다:

- `CLAUDE.md` (프로젝트 개요·디자인 톤: 강렬·직설·사색/여백 금지)
- `src/agents/scribe/schema.ts` — `SCRIBE_SYSTEM`(schema.ts:69~117). 특히 "■ 쉬운 설명(북극성)" 줄, "■ 출력: 대본을 의미 단위 segment들로 나눠…" 줄, "■ money-safety" 줄, "■ 표절 금지" 줄. 그리고 그 아래 `SCRIBE_PERSONA_DIRECTIVE`·`SCRIBE_SEGMENT_DIRECTIVE`가 왜 별도 상수로 분리돼 있는지(promptHash 보존 주석) 확인하라.
- `src/agents/scribe/step.ts` — `scribeStep`/`scribeSegmentStep`이 `SCRIBE_SYSTEM`을 어떻게 조립하는지(두 모드 모두 base로 포함).

## 작업

`SCRIBE_SYSTEM` 문자열에 **■ 불릿 2개**를 추가한다. **프롬프트 문자열만** 수정한다 — 스키마·세그먼트 수·글자수·후처리(`normalizeSegmentPayload`)·로직 코드는 건드리지 않는다. 위치는 기존 ■ 불릿들 사이의 자연스러운 자리(중복 금지는 "표절 금지" 근처 텍스트 규율, 연결은 "출력…의미 단위" 근처)에 넣되, 기존 규칙과 모순되지 않게 배치하라.

### ① 중복 금지 규칙 (아래 의미를 반드시 박아넣는다)

```
■ 중복 금지(필수): 같은 의미를 다른 말로 되풀이하지 마라. 한 번 한 말은 다시 풀어 말하지 말고,
  다음 문장·단락은 반드시 새 정보를 더한다.
  - '쉬운 설명 북극성'으로 비유·예시를 먼저 준 뒤 설명할 때, 비유가 이미 전달한 요점을
    문자 그대로 다시 말하지 마라 — 설명은 요점 반복이 아니라 한 걸음 더(왜 그런지·그래서 뭘 할지) 나아간다.
  - 앞 segment에서 한 말을 뒤 segment에서 표현만 바꿔 반복하지 마라. 강조가 필요하면
    되풀이 대신 한 줄로 압축해 못 박아라.
```

### ② 자연스러운 연결 규칙 (아래 의미를 반드시 박아넣는다)

```
■ 자연스러운 연결(필수·낭독 기준): 대본은 김짠부가 처음부터 끝까지 그대로 소리 내어 읽을 수
  있을 만큼 이어져야 한다. segment는 의미 단위로 나누되, 각 단위는 앞 흐름을 받아 이어간다 —
  섹션마다 처음부터 다시 시작하듯 끊지 마라.
  - 화제가 바뀌는 지점은 김짠부 구어체 연결말(예: "그래서", "근데 여기서", "자 그럼")로 매끄럽게
    넘긴다. 단, 기계적으로 매 segment에 붙이지 말고 실제 전환이 필요한 곳에만.
  - money-safety 헤지('확인이 필요하다')도 흐름을 끊지 말고 말하듯 녹여 넣는다.
```

문안은 위 톤 그대로 넣되, 기존 `SCRIBE_SYSTEM`의 들여쓰기·`■`/`-`/`·` 마커 스타일과 일관되게 맞춘다. ②의 "segment는 의미 단위로 나누되"는 기존 "■ 출력: 대본을 의미 단위 segment들로 나눠"와 **조화**시키는 문장이지 대체가 아니다(모순 금지).

### 회귀 가드 테스트 1개 (신설)

`tests/scribeRedundancyFlow.test.ts`를 신설한다. 두 규칙이 실수로 삭제·약화되면 깨지는 트립와이어다:

- `SCRIBE_SYSTEM`을 import.
- 규칙 ①을 나타내는 안정된 토큰(예: `"중복 금지"`)과 규칙 ②를 나타내는 안정된 토큰(예: `"낭독 기준"` 또는 `"자연스러운 연결"`)을 각각 `toContain`으로 1개씩 단언한다. (실제로 프롬프트에 쓴 문구와 **같은 토큰**을 골라라.)
- 프레임워크는 기존 테스트와 동일(vitest). 새 의존성 추가 금지.

## Acceptance Criteria

```bash
npm run typecheck   # 타입 에러 없음
npm test            # 신규 포함 전부 통과
npm run build       # 컴파일 에러 없음 (PageNotFoundError/chunk MODULE_NOT_FOUND이면 rm -rf .next 후 재빌드로 stale 캐시 판별)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다(전부 exit 0). **주의: dev 서버가 돌고 있으면 `.next`를 지우지 마라**(dev 500 + build "Failed to collect page data for /audit" stale 오류 유발). 필요 시 dev를 먼저 kill한 뒤 `rm -rf .next`.
2. `SCRIBE_SYSTEM`을 눈으로 확인한다:
   - 중복 금지·자연스러운 연결 두 ■ 불릿이 들어갔는가?
   - 기존 규칙(말투·쉬운설명 북극성·사실취급·표절 금지·형식블록·money-safety·visual·"의미 단위 segment")이 **하나도 삭제·약화되지 않았는가**?
   - ②가 "의미 단위로 나눠라" 기존 규칙과 모순되지 않고 조화되는가?
3. 결과에 따라 `phases/scribe-redundancy-flow/index.json`의 step0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- **사후 검사 코드나 2차 편집 패스를 만들지 마라.** 이유: 프롬프트 입구 차단이 근본 수정이다(선례 `copy-question-register`). 결정적 중복 탐지기·코헤런스 리바이저는 이걸로도 재발할 때만 별도 phase로 — 지금 넣으면 YAGNI.
- 출력 스키마(`SCRIBE_SCHEMA`)·`minItems`·세그먼트 글자수·후처리(`normalizeSegmentPayload`)·lineage(used_fact_idxs/used_asset_idxs) 로직을 변경하지 마라. 이유: 프롬프트 문안만 손보는 phase다.
- `SCRIBE_PERSONA_DIRECTIVE`·`SCRIBE_SEGMENT_DIRECTIVE`를 건드리지 마라(두 규칙은 base `SCRIBE_SYSTEM`에만 넣는다 — 세그먼트/페르소나 모드는 base를 포함하므로 자동 적용됨).
- 기존 규칙 문장을 삭제·약화하지 마라. 특히 "쉬운 설명 북극성"과 "의미 단위 segment"는 유지하되 새 규칙이 그 위에 얹히게 하라.
- 명세에 없는 신규 파일(fixtures/parity·youtube·tavily record 부산물·docs·다이어그램 등)을 커밋에 섞지 마라. 커밋 전 `git status`로 범위 외 untracked를 확인하고 제외한다. (이번 step의 정당한 신규 파일은 `tests/scribeRedundancyFlow.test.ts` 하나뿐.)
- 기존 테스트를 깨뜨리지 마라.

## 라이브 검증 (하네스 밖·사용자)

프롬프트 문안은 회귀 테스트로 *존재*만 잠긴다. **행동 확인은 라이브 런**: 새 대본 런을 리서치→스크립트까지 돌려, (1) 단락 내 같은 의미 재진술이 줄었는지, (2) 세그먼트가 낭독하기 자연스럽게 이어지는지 눈으로 확인한다. promptHash(scribe) 변경 → 다음 라이브 런에서 fixture 자동 재기록.
