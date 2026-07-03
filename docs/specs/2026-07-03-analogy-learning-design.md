# 비유 학습 로직 (analogy-learning) — 설계

- 날짜: 2026-07-03
- 상태: 설계 확정(사용자 승인) → 구현 계획 대기
- 담당 크루: **유이**(analogist) 능력 고도화

## 1. 목적

스크립트의 핵심은 "어려운 개념을 처음 듣는 사람도 이해하게 쉽게 푸는 것"이고, 그 열쇠는 **비유**다.
비유를 특출나게 잘하는 레퍼런스 채널(인스타 릴스 등)의 영상을 분석해 **일반화된 비유 기법**을
학습하고, 리서치 단계의 비유 담당 **유이**(`analogist`)에 주입해 비유 능력을 고도화한다.

## 2. 핵심 결정 (재litigate 금지)

- **수집 = mp4 폴더 드롭.** 인스타 스크래핑(차단·유료·취약)을 통째 우회. owner가 릴스를
  `learning/analogy-reels/*.mp4`에 넣기만 하면 끝. 파일명 자유(공백·`#` 허용 → 코드에서 경로 처리).
- **STT = OpenAI Whisper.** 한국어 음성→텍스트. 기존 OpenAI 백엔드/키 재사용(`src/llm/backends/openai.ts`).
  릴스당 ~$0.006, **학습 시점에만**. 결과를 `learning/analogy-reels/<name>.txt`로 캐시 → 재실행 STT 재과금 0.
- **오디오만.** 참고 채널은 "말로도 충분"(사용자 확인). 화면 자막·그래픽 비전 분석은 **비목표**(§8).
- **학습 단위 = 일반화된 기법 프로필(A안).** "추상→물리적 사물 대입", "규모/시간 변화 강조" 같은
  재사용 규칙. 구체 예시 뱅크(B안)는 표절 위험·개념 불일치로 제외(필요 시 후속).
- **저장·활성화·주입 = 기존 `style_profiles` 학습 루프 재사용.** 새 서브시스템 0.
  단 `component_type`에 CHECK 제약(`'title','thumbnail_copy','description','structure'`)이 있어
  **마이그레이션 1개** 필요: CHECK에 `'analogy_style'` 추가 + **같은 커밋에서 `database.types.ts`
  해당 유니온도 함께 확대**(스키마-타입 드리프트 방지 규칙). 컬럼·인덱스 신설은 없음
  (`uniq_style_profiles_active`가 이미 active 1개를 보장).
- **주입은 비면 안 건드림 = fixture/promptHash 보존.** active 프로필 없으면 유이 prepare는 바이트 동일.
- **owner-local 도구.** 로컬 mp4 폴더를 읽으므로 owner 머신/dev에서만 동작(기존 `/copy-learn`도 owner 전용 admin).

## 3. 데이터 흐름

```
learning/analogy-reels/*.mp4          ← owner가 릴스 mp4 드롭
   │  [1] ffmpeg: mp4 → m4a(오디오만, 용량↓·안전)
   │  [2] Whisper STT (ko)            → learning/analogy-reels/<name>.txt (캐시)
   ▼
트랜스크립트 뭉치
   │  [3] analogy_extractor (claude -p, $0)
   ▼
비유 기법 프로필(jsonb) = style_profiles draft (component_type='analogy_style')
   │  [4] owner가 /copy-learn 에서 검토 → "활성화" (active 1개 유지)
   ▼
loadActiveAnalogyStyle() → 유이(analogist) prepare 시스템 프롬프트 주입
   ▼
다음 제작 런부터 비유 품질 반영
```

## 4. 컴포넌트

각 유닛은 하나의 명확한 책임 + 기존 패턴 미러.

### 4.1 STT 어댑터 — `src/lib/learning/transcribeReels.ts`
- 입력: `learning/analogy-reels/` 폴더 경로.
- 각 `*.mp4`에 대해: 캐시된 `.txt`가 있으면 skip(멱등·재과금 0). 없으면
  ffmpeg로 오디오 추출(`-vn -acodec ...`) → Whisper `transcriptions` 엔드포인트(raw fetch, language=ko) → `.txt` 기록.
- 출력: `{ name, transcript }[]` — 파일명 순 정렬(결정성).
- 실패 격리: 한 파일 STT 실패는 로그 후 skip(전체 sweep 안 죽임).

### 4.2 추출 에이전트 — `src/agents/analogist_extractor/{schema.ts,step.ts}`
- `style_extractor` 스키마 방식 미러. 입력=트랜스크립트 뭉치, 출력=`AnalogyStylePatterns`(jsonb).
- **빈 가능 string[] 필드는 required 금지**(과거 critic 사건 규칙) → step에서 `?? []`.
- 개발=`claude -p`($0), 운영=LLM 1회.

`AnalogyStylePatterns`(초안 형태 — 구현 시 확정):
```ts
interface AnalogyStylePatterns {
  techniques: string[];        // 재사용 비유 기법 규칙(예: "추상 수치→눈에 보이는 물리량 대입")
  target_domains: string[];    // 비유에 잘 쓰이는 친숙 영역(예: 음식·일상 사물·몸)
  do: string[];                // 잘 꽂히게 하는 장치(예: "규모/시간 변화를 동작으로 보여줌")
  banned: string[];            // 오히려 헷갈리게 하는 안티패턴(예: "또 다른 전문용어로 비유")
  distortion_guard: string;    // 비유가 사실을 왜곡 안 하게 하는 지침(유이의 distortion_note 강화)
  confidence?: "high" | "tentative";
  tentative_notes?: string[];  // 저표본 경고(빈 배열 가능 → required 제외)
}
```

### 4.3 저장 — `style_profiles`, `component_type='analogy_style'`
- draft 삽입 → owner 활성화 시 기존 active를 retired로 내리고 1개만 active(기존 activate 로직 재사용, component_type 스코프).
- **마이그레이션 1개**: `style_profiles_component_type_check` drop/재생성으로 `'analogy_style'` 추가
  (기존 `20260627120025_style_profiles_structure.sql`가 'structure'를 더한 패턴 그대로). 같은 커밋에서
  `src/lib/supabase/database.types.ts`의 component_type 유니온도 확대.
- `profile_training_sources`에도 동일 CHECK가 있으면 함께 확대(마이그 파일 확인 후).

### 4.4 주입 — `src/agents/shared/analogyStyle.ts`
- `loadActiveAnalogyStyle(supa)` — `loadActiveThumbnailStyle` 미러(active 1행, 없으면 null).
- `appendAnalogyStyle(system, profile)` — 유이 `ANALOGIST_SYSTEM`에 지시 섹션 append. **비면 원본 그대로(해시 불변).**
- 배선 위치: `analogist` prepare 경로(리서치 셀에서 유이 호출 직전). 다른 에이전트 무영향.

### 4.5 트리거 — `requestAnalogyRelearn()` (server action) + `/copy-learn` 버튼
- `requestCopyRelearn` 미러: `requireOwner` 후 sweep를 **동기 await**.
  sweep = STT(§4.1) → 추출(§4.2) → draft 삽입(§4.3). draft까지만(활성화는 사람 게이트).
- `/copy-learn`에 "비유 레퍼런스 재학습" 버튼 + draft 검토/활성화 UI(기존 스타일 draft UI 미러).
- 비용/시간: STT는 캐시 미스 파일만. 첫 실행은 파일 수만큼 수 분(로컬 dev 타임아웃 여유). 이후 재실행은 추출만.

## 5. 결정성 / fixture

- active 비유 프로필이 **없는 동안** 유이 prepare는 바이트 동일 → 기존 fixture/promptHash 불변.
- 프로필을 **활성화하면** 유이 promptHash가 의도적으로 바뀜(=학습 반영). 이는 다른 style_profiles와 동일한 정상 동작.
- STT `.txt` 캐시로 sweep 결정성 확보(같은 mp4 → 같은 트랜스크립트 → 같은 draft 입력).

## 6. 보안 / 비용

- `learning/analogy-reels/*.mp4`·`*.m4a`·`*.txt` **gitignore**(민감·대용량 원본, 커밋 금지). mp4는 이미 반영됨.
- STT 비용은 owner 학습 트리거 시에만. 제작 파이프라인 런엔 0(주입은 프롬프트 텍스트일 뿐).
- OpenAI 키는 기존 것 사용. (⚠️ 별개 과제: 노출 키 rotate 필요 — 본 기능 범위 밖.)

## 7. 테스트

- `transcribeReels`: 캐시 히트 시 STT 미호출(멱등) — impl 함수 스텁 + 호출 카운터(vitest `vi.fn` 지양 규칙).
- `appendAnalogyStyle`: 빈 프로필 → 원본 문자열 그대로(해시 보존) / 있으면 섹션 포함. 순수 함수 단위테스트.
- `analogist_extractor` 스키마: 빈 배열 필드가 required에 없는지(critic 사건 회귀).
- 유이 배선: active 프로필 있으면 system에 섹션 포함, 없으면 미포함(prepare 단위테스트).

## 8. 비목표 (YAGNI)

- 화면 자막·그래픽 **비전 분석**(오디오로 충분). 필요 시 후속.
- **구체 비유 예시 뱅크**(B안). 기법 프로필로 시작.
- URL/인스타 **자동 수집**. mp4 드롭으로 충분.
- 운영(클라우드) 자동 학습. 본 도구는 owner-local.

## 9. 열린 항목

- `AnalogyStylePatterns` 필드 최종 확정은 구현 중 첫 추출 결과 보고 미세조정(스키마 골격은 §4.2 고정).
- Whisper 모델(`whisper-1`)·언어 파라미터는 구현 시 확정.
