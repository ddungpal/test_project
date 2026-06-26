# Step 0: fold-stray-fields (스타일 추출 출력의 최상위 잔류 필드를 patterns 안으로 fold)

**스타일 재학습(style_extractor)이 LLM의 구조 드리프트로 결정적으로 실패하는 문제를 해소한다.** 스키마가 4개 필드를 최상위에서도 허용하고, 코드가 그것을 `patterns` 안으로 접어넣는다.

## 배경 (실제 사건 — 왜 이렇게)
- `style_extractor` 스키마(`STYLE_EXTRACTION_SCHEMA`)는 `banned`/`confidence`/`tentative_notes`/`skeletons`를 `patterns` 객체 **안**에 두도록 요구한다(top-level `additionalProperties:false`, required=[patterns, evidence_summary]).
- 그런데 claude-p는 이 4개를 **일관되게 최상위(patterns의 형제)**로 출력한다(개념상 메타데이터라 자연스러운 해석). 실제 라이브 출력 구조:
  ```json
  { "patterns": { "copy": {...}, "visual": {...} },
    "banned": [...], "confidence": "high", "tentative_notes": [...], "skeletons": {...},
    "evidence_summary": "..." }
  ```
- 결과: top-level `additionalProperties:false` → **"must NOT have additional properties" ×4 검증 실패**. 설령 통과해도 `normalizePatterns`가 `rawP.banned`/`rawP.skeletons`(=patterns 내부)를 읽으므로 **데이터 유실**.
- **실제 사건**: 제목 재학습이 라이브 호출 2회(claude-p 재시도) 모두 이 구조로 실패 → draft 생성 불가. (직전 phase의 픽스처 record 버그와는 **별개**의 근본 문제. 그건 고쳐졌고 이젠 라이브 호출됨.)
- 해결: LLM이 4개 필드를 **최상위에 두든 patterns 안에 두든** 결정적으로 처리. ① 스키마가 top-level에서도 허용 ② 코드가 top-level 잔류분을 patterns 안으로 fold한 뒤 정규화. 다운스트림(`ThumbnailStylePatterns`·`style_profiles.patterns` jsonb·`appendThumbnailStyle`·`evaluateStyleConformance`)은 **기존 nested 구조 그대로**.

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md` · `CLAUDE.md` — 계층·비용($0).
- `src/agents/style_extractor/schema.ts` — **수정 대상.** `STYLE_EXTRACTION_SCHEMA`(52)·`StyleExtractionOutput`(44)·`ThumbnailStylePatterns`(15). 특히 patterns 내부의 banned(96)/confidence(97)/tentative_notes(98)/skeletons(101) 정의.
- `scripts/learn-ab-style.ts` — **수정 대상.** `normalizePatterns`(246, `rawP.banned`·`normalizeConfidence`·`normalizeSkeletons` 호출)·결과 조립(381 `normalizePatterns(out.data.patterns)`)·`AB_STYLE_SYSTEM`(499)·`TITLE_STYLE_SYSTEM`(518).
- (참고) `normalizeConfidence`/`normalizeSkeletons` 본문 — patterns에서 confidence/skeletons를 읽는 방식(fold 후 그대로 동작해야 함).

## 작업
### 1) `src/agents/style_extractor/schema.ts` — top-level에서도 4필드 허용 (중복 정의 금지)
- patterns 내부에 쓰는 필드 스키마(banned=strArray, confidence=enum, tentative_notes=strArray, skeletons=객체)를 **named const로 추출**해 patterns 내부와 top-level **양쪽에서 재사용**(중복 정의 드리프트 방지).
- `STYLE_EXTRACTION_SCHEMA` top-level `properties`에 `banned`/`confidence`/`tentative_notes`/`skeletons`를 **옵셔널로 추가**(required는 `[patterns, evidence_summary]` 그대로·`additionalProperties:false` 유지 — 이제 이 4개는 명시 허용).
- `StyleExtractionOutput` 인터페이스에 top-level 옵셔널 필드 추가: `banned?`/`confidence?`/`tentative_notes?`/`skeletons?`(타입은 ThumbnailStylePatterns의 해당 필드 재사용).

### 2) `scripts/learn-ab-style.ts` — top-level 잔류분을 patterns로 fold (순수 헬퍼)
```ts
/** LLM이 banned/confidence/tentative_notes/skeletons를 patterns 밖 top-level에 둔 경우 patterns 안으로 접어넣는다(순수).
 *  patterns 내부 값이 있으면 그쪽 우선(이중 출력 방어). 둘 다 없으면 미설정. */
export function foldStrayPatternFields(data: StyleExtractionOutput): StyleExtractionOutput["patterns"];
```
- 반환 = `out.data.patterns`에 top-level `banned`/`confidence`/`tentative_notes`/`skeletons`를 병합(patterns 내부 우선, 없을 때만 top-level 값 사용). `exactOptionalPropertyTypes` — 값 있을 때만 키 추가.
- 결과 조립부(381) 변경: `patterns: normalizePatterns(foldStrayPatternFields(out.data))`.
- `normalizePatterns`·`normalizeConfidence`·`normalizeSkeletons`는 **변경 불필요**(fold된 patterns를 받으면 기존대로 동작).

### 3) 프롬프트 명시 (보조 — AB_STYLE_SYSTEM·TITLE_STYLE_SYSTEM)
- 각 프롬프트에 출력 구조를 한 줄 명시: "출력 최상위는 `patterns`와 `evidence_summary` 둘뿐이다. `banned`·`confidence`·`tentative_notes`·`skeletons`는 반드시 `patterns` 객체 *안*에 넣어라." (fold가 보장하므로 보조 안전장치 — 드리프트 빈도↓.)

## 주의 (구체)
- **다운스트림 불변**: 저장되는 `style_profiles.patterns`(jsonb)는 여전히 banned/confidence/tentative_notes/skeletons를 **patterns 안에** 가진 nested 구조여야 한다(fold의 목적). `ThumbnailStylePatterns` 타입·`appendThumbnailStyle`·`evaluateStyleConformance` 등을 건드리지 마라. 이유: 환류·생성 경로 영향 0.
- **스키마 필드 정의 중복 금지**: top-level과 patterns-level에 같은 필드 스키마를 두 번 적지 말고 const 재사용. 이유: 한쪽만 바뀌는 드리프트.
- **patterns 내부 우선**: 모델이 (드물게) 양쪽에 다 넣으면 patterns 내부 값을 채택. 이유: 결정성.
- **fold는 순수 함수**(DB·IO 없음)로 분리해 테스트. 이유: 단위 검증.
- **required 불변**: `[patterns, evidence_summary]` — 4필드는 옵셔널(빈배열/누락 허용 규칙, schema.ts:7-9 주석). 이유: 빈 가능 필드 required 금지 원칙.
- **promptHash 변경 주의**: 스키마·프롬프트가 바뀌면 style_extractor promptHash가 변해 기존 record 픽스처는 새로 녹화된다($0). **오프라인 parity/eval 골든셋이 style_extractor를 포함하면** 그 골든을 갱신하거나 형태만 보게 하라(기존 hook-thumbnail-revamp 정석). 포함 안 하면 영향 없음 — 확인할 것.

## 테스트 (`foldStrayPatternFields` 순수 헬퍼)
- top-level에만 4필드 → patterns 안으로 fold됨(현 실패 케이스 재현·핵심 가드).
- patterns 내부에만 → 그대로(하위호환).
- 양쪽 다 → patterns 내부 우선.
- 둘 다 없음 → 해당 키 미설정(빈배열은 normalize가 채움).
- fold 후 `normalizePatterns`가 banned/confidence/skeletons를 정상 산출(통합 1케이스 권장).

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy가 직접 실행해 exit code 확보).
2. 체크: top-level 4필드가 patterns로 fold됨·스키마 const 재사용(중복 없음)·다운스트림 nested 구조 불변·required 불변·fold 순수·promptHash 변경이 오프라인 테스트를 안 깸.
3. `phases/style-extract-fold-stray/index.json` step 0 갱신(성공→completed+summary 등).

## 금지사항
- 다운스트림(ThumbnailStylePatterns·appendThumbnailStyle·evaluateStyleConformance·환류/생성)을 건드리지 마라. 이유: fold는 LLM I/O 경계에서만·저장 구조 불변.
- 스키마 필드 정의를 top/patterns 양쪽에 복붙하지 마라. 이유: 드리프트.
- required에 4필드를 넣지 마라. 이유: 빈배열 가능 필드 required 금지(과거 critic 사건).
- 기존 테스트를 깨뜨리지 마라.
