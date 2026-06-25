# Step 1: learn-emit-skeletons (학습 시 스켈레톤 방출 — 백엔드)

**재학습(API)이 patterns뿐 아니라 step0의 스켈레톤(`CopySkeletons`)까지 같이 만들어 `style_profiles.patterns.skeletons`에 저장.** 기존 재학습 LLM 호출에 편승(추가 호출 0). 생성 배선은 step2.

## 배경 (왜 이렇게)
- 사용자 의도: **재학습할 때만 API 비용** — 그래서 스켈레톤도 별도 호출 없이 **기존 재학습 LLM 콜의 출력 스키마를 확장**해서 같이 받는다.
- step0의 `CopySkeletons{ title?, thumbnail? }`(슬롯 `{number}|{target}|{keyword}|{topic}`)를 학습 LLM이 '이긴 패턴을 재사용 가능한 템플릿으로' 함께 출력 → patterns에 실어 저장.
- 하위호환: 스켈레톤 없는 기존/구버전 프로필은 step2에서 LLM 폴백(로컬 생성 비활성).

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md`, `docs/tech.md`(§13.2), `CLAUDE.md`.
- `src/agents/shared/localCopyGen.ts`(step0) — `CopySkeletons`/`TitleSkeleton`/`ThumbnailSkeleton` 타입. **저장 형태는 이 타입과 정확히 일치**(step0 생성기가 읽는다).
- `scripts/learn-ab-style.ts` — `learnAbStylePatterns`(학습 본체)·`ThumbnailStylePatterns`·confidence/tentative_notes **안전수령 패턴(340~)**. 스켈레톤도 **같은 안전수령**(누락/무효 → 키 생략, throw 금지)으로 받는다.
- `src/agents/style_extractor/schema.ts`·`src/agents/*/schema.ts` — LLM 출력 스키마(ajv) 정의 방식. 스켈레톤 필드를 **옵셔널**로 추가.
- `src/performance/styleRelearn.ts` — `styleRelearnSweepComponent`가 학습 결과 patterns를 `style_profiles`(draft)로 insert하는 지점. patterns에 skeletons가 실려 그대로 저장되는지 확인.
- `src/app/actions/copyLearn.ts`·`src/lib/dashboard/copyLearnView.ts` — `getCopyStyleDrafts`가 patterns 원본을 실어 보냄(상세 보기). skeletons도 노출되면 검수 가능(필수 아님).

## 작업
### 1) 학습 LLM 출력 스키마에 `skeletons` 옵셔널 추가
- 학습 프롬프트(SYSTEM)에 지시 추가: "이긴 패턴을 **재사용 가능한 스켈레톤**으로도 출력하라 — 슬롯 `{number}/{target}/{keyword}/{topic}`만 사용, 주제 무관한 고정 표현 + 슬롯 조합. title N개·thumbnail N개(메인2·박스2 템플릿). banned 표현은 넣지 말 것."
- 출력 스키마(ajv)에 `skeletons?: { title?: [...], thumbnail?: [...] }` 옵셔널(required 금지 — 빈 배열/누락 허용, 신규 에이전트 원칙).

### 2) 안전 수령 → `patterns.skeletons`
- `learnAbStylePatterns`가 LLM 출력의 skeletons를 **confidence/tentative_notes와 동일한 안전수령**으로 검증·정제(슬롯 화이트리스트 밖 토큰·빈 template 제거, 배열 아니면 생략) 후 `patterns.skeletons`에 합친다.
- `ThumbnailStylePatterns`(및 title patterns) 타입에 `skeletons?: CopySkeletons` 추가(localCopyGen 타입 재사용).

### 3) 저장 경로 확인
- `styleRelearnSweepComponent`가 patterns를 그대로 jsonb로 저장하므로 코드 변경 없이 실릴 가능성 높음 — **저장 후 다시 읽었을 때 skeletons가 보존되는지** 단위/통합 레벨로 확인.

## 주의 (구체)
- **추가 LLM 호출 0**: 기존 재학습 콜의 출력만 확장. 이유: '재학습만 API' 원칙·비용.
- **옵셔널·안전수령**: skeletons 누락/무효 → patterns에 키 생략(undefined 명시대입 금지). 이유: 하위호환·기존 프로필/테스트 불변·`exactOptionalPropertyTypes`.
- **슬롯 화이트리스트 강제**: `{number}|{target}|{keyword}|{topic}` 외 슬롯 토큰은 제거/거부. 이유: step0 생성기가 못 채우는 슬롯 = 깨진 후보.
- **promptHash 영향 범위**: 이건 *학습* 프롬프트 변경 → 학습 픽스처는 record로 갱신됨(eval은 output 형태만 봄). **제안 생성(hook_maker/thumbnail_maker) 프롬프트는 안 건드린다** → forward 파이프라인 픽스처 불변. 이유: 오프라인 $0.
- 이 step은 **생성 배선·UI 미침범**(step2·3).

## 테스트 (기존/신규)
- 안전수령: LLM 출력에 유효 skeletons → patterns.skeletons에 정제되어 실림 / 무효(배열아님·슬롯 불량) → 생략, throw 안 함.
- 슬롯 화이트리스트: 허용 외 슬롯 포함 template 제거.
- 하위호환: skeletons 없는 출력 → 기존 patterns와 동일(키 없음).

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy 검수). 기존 `abStyleLearn`·학습 테스트 회귀 0(하위호환).
2. 체크: 추가 LLM콜 0·옵셔널 안전수령·슬롯 화이트리스트·patterns.skeletons 저장/재로딩 보존·forward 프롬프트 불변.
3. `phases/copy-local-gen/index.json` step 1 갱신.

## 금지사항
- 스켈레톤 생성을 위한 **별도 LLM 호출 추가 금지**. 이유: '재학습만 API' 원칙.
- skeletons를 required로 만들지 마라. 이유: 하위호환·빈배열 허용.
- 제안 생성(hook_maker/thumbnail_maker) prepare/프롬프트 수정 금지. 이유: forward 픽스처 보존(step2 범위).
- 허용 외 슬롯 토큰 통과 금지. 이유: 로컬 생성 시 깨진 후보.
- 기존 테스트를 깨뜨리지 마라.
