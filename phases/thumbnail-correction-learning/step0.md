# Step 0: corrections-store (교정쌍 데이터 모델 + 저장)

**교정쌍(생성 카피 ↔ 이상 카피)을 저장하는 테이블 + 저장 액션.** 차이 분석은 step1, 학습 합류는 step2, UI는 step3.

## 배경 (왜 이렇게)
- 교정 학습 = 김짠부가 입력한 '이상 카피'(winner)와 AI '생성 카피'(loser)를 묶어 기존 재학습 루프에 합성 A/B로 합류시키는 모듈(합류 설계).
- 이 step은 **그 교정쌍을 저장**만 한다. ab_variants/contents를 오염시키지 않도록 **전용 테이블** `thumbnail_corrections`를 둔다(copy-learn 영상목록·winningRefs에 안 섞임).
- payload는 ab_variants와 같은 모양({copy_main, copy_boxes} 썸네일 / {title} 제목)으로 저장 → step2가 AbResultVariant로 쉽게 합성.

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md` · `CLAUDE.md` — 계층·보안(requireOwner)·데이터.
- `supabase/migrations/20260625120023_stage_proposals_thumbnail.sql` 및 인접 마이그레이션 — **마이그레이션 작성 규약**(파일명 `YYYYMMDDHHMMSS_<name>.sql`·CHECK·default·코멘트 스타일). 다음 번호로 새 파일.
- `src/app/actions/copyLearnMap.ts` — ab_variants payload 모양({copy_main:string[], copy_boxes:string[]} / {title}) + 순수 매핑이 여기 사는 이유(테스트 import). 새 순수 매핑도 여기 또는 인접 모듈에.
- `src/app/actions/copyLearn.ts` — `requireOwner`→service-role→`auditLog` 패턴(미러).
- `src/lib/observability/auditLog.ts` — `AuditAction` union(새 액션 추가).
- `src/lib/supabase/database.types.ts` — 수동 타입 정의 방식(새 테이블 타입 추가 위치).

## 작업
### 1) 마이그레이션 — `thumbnail_corrections` 테이블 (신규 SQL 파일)
컬럼(개념):
- `id uuid pk default gen_random_uuid()`
- `component_type text not null check (component_type in ('thumbnail','title'))`
- `topic text` (라벨·선택제목 등 맥락)
- `gen_payload jsonb not null` (AI 생성 카피 — {copy_main,copy_boxes} 또는 {title})
- `ideal_payload jsonb not null` (김짠부 이상 카피 — 같은 모양)
- `diff jsonb` (step1 차이 분석 결과 — 누락 허용)
- `learned_at timestamptz` (step2 멱등 — 이 교정이 마지막으로 학습에 반영된 시각, null=미학습)
- `created_at timestamptz not null default now()`
- 인덱스: `(component_type)` (step2 로딩용).
- ⚠️ 이 테이블은 contents/ab_variants와 **FK 없음**(독립 — 캐스케이드 함정 회피). 코멘트로 명시.

### 2) `database.types.ts` — 테이블 타입 추가
- 기존 수동 타입 패턴대로 `ThumbnailCorrections` Row/Insert 타입 추가(`Tables`/`TablesInsert` 매핑에 등재).

### 3) 순수 매핑 + 저장 액션
- 순수: `buildCorrectionRow(input): TablesInsert<"thumbnail_corrections">` — 입력 정제(trim·빈문자 제거), gen/ideal payload 구성. `copyLearnMap.ts`(또는 인접 순수 모듈)에.
  ```ts
  export interface CorrectionInput {
    componentType: "thumbnail" | "title";
    topic?: string;
    genMain?: string[]; genBoxes?: string[];   // 썸네일
    idealMain?: string[]; idealBoxes?: string[];
    genTitle?: string; idealTitle?: string;     // 제목
  }
  ```
- 액션(`copyLearn.ts` 또는 신규 `corrections.ts`, "use server"):
  ```ts
  export async function saveCorrection(input: CorrectionInput): Promise<{ id: string }>;
  ```
  - `requireOwner`→service-role. gen/ideal이 비면 throw("생성·이상 카피를 모두 입력하세요"). insert→`auditLog`(action `"correction_saved"`).
- `AuditAction`에 `"correction_saved"` 추가 + `auditView.ts` 라벨("교정 저장").

## 주의 (구체)
- **전용 테이블·FK 없음**: contents/ab_variants에 안 섞는다. 이유: copy-learn 영상목록·winningRefs·회고 오염 + 캐스케이드 CHECK 함정 회피.
- **payload 모양은 ab_variants와 일치**({copy_main,copy_boxes}/{title}). 이유: step2가 그대로 AbResultVariant로 합성(드리프트 0).
- **순수 매핑 분리**(server-only 금지 모듈). 이유: vitest 직접 import.
- **requireOwner 게이트**. 이유: 보안.
- `learned_at`은 이 step에선 항상 null로 insert(스탬프는 step2 재학습이). 이유: 멱등 기준.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수.
- 마이그레이션은 **사람이 적용**(SQL 파일만 생성·`status: blocked` 아님). step 산출물엔 "사용자가 Supabase에 적용 필요" 명시.

## 테스트
- `buildCorrectionRow` 순수 테스트: 썸네일/제목 각각 payload 모양·trim·빈입력 가드.
- 기존 테스트 보존.

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```
(마이그레이션 SQL은 오프라인 AC 대상 아님 — 사람이 적용. 코드는 테이블 타입 기준 typecheck.)

## 검증 절차
1. AC 실행(Joy). 2. 체크: 전용 테이블·FK 없음·payload 모양 일치·순수 분리·requireOwner·audit. 3. index.json step0 갱신(summary에 "마이그레이션 사용자 적용 필요" 명시).

## 금지사항
- 교정쌍을 ab_variants/contents에 저장하지 마라. 이유: 오염·캐스케이드 함정.
- requireOwner 없이 쓰지 마라. 이유: 보안.
- diff 분석·재학습·UI를 건드리지 마라(step1/2/3). 이유: 범위.
- 기존 테스트를 깨뜨리지 마라.
