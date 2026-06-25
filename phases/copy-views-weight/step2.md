# Step 2: views-input-ui (UI — 24h 조회수 입력칸 + reach 맥락 표시)

**`/copy-learn` 폼에 영상별 24h 조회수 입력칸을 추가하고, 입력된 reach를 화면에 노출한다.** step1이 만든 `CopyAbInput.views24h`·`CopyLearnVideo.views24h`에 UI를 연결한다. (UI step — Esther 투입)

## 배경 (왜 이렇게)
- step0·1로 24h 조회수가 신뢰도 가중(vconf)으로 학습에 반영되는 배선이 끝났다(`CopyAbInput.views24h` 저장·`CopyLearnVideo.views24h` 프리필).
- 남은 것: 김짠부가 **영상별 24h 조회수를 입력**할 칸과, 입력된 조회수를 **보여주는 맥락**(예: CTR 옆에 "24h 조회수 N"). 절대 cap이 아니라 코퍼스 상대라, 숫자 자체를 보여주는 정도면 충분(별도 신뢰도 게이지는 과함 — ponytail).

## 읽어야 할 파일 (먼저 정독)
- `ARCHITECTURE.md`, `CLAUDE.md`, `DESIGN.md` — TRUS Create 3색(Black `#121212`/Yellow `#F8F082`/White)·직각·무그림자·강렬직설. 그라데이션·그림자 금지.
- `design/design-system/trus-create/trus-create-design-system.md` — 원본 디자인 시스템.
- `src/components/CopyLearningForm.tsx` — **주 수정 대상.** `VideoFormState`(17)·`toInput`(86)·`onSave`(158)·`ctr24h` 입력칸 렌더 지점. ctr24h와 똑같은 패턴으로 views24h를 추가.
- `src/lib/dashboard/copyLearnView.ts` — step1이 추가한 `CopyLearnVideo.views24h`(폼 프리필 소스).
- `src/app/copy-learn/page.tsx` — 페이지가 `getCopyLearnVideos` → 폼에 전달하는 지점.
- `src/app/actions/copyLearn.ts`·`copyLearnMap.ts` — `CopyAbInput.views24h`(step1) — 폼이 채워 보낼 계약.

## 작업
### 1) `CopyLearningForm.tsx` — views24h 입력칸
- `VideoFormState`에 `views24h: string` 추가(`ctr24h: string` 옆, 문자열 입력→파싱).
- 초기화: `CopyLearnVideo.views24h`로 프리필(`ctr24h` 프리필과 동일 패턴).
- 렌더: ctr24h 입력칸 바로 옆/아래에 "24h 조회수" 숫자 입력칸(정수). 라벨 한국어.
- `toInput`: `views24h: parseNum(views24h)`(빈칸/비숫자 → null). CTR과 동일한 파싱 헬퍼 재사용.
- `onSave` → `saveCopyAbResults`가 views24h를 받아 저장(step1 계약).

### 2) reach 맥락 표시
- 각 영상 카드(또는 저장된 값 요약)에 입력된 24h 조회수를 노출. 예: "CTR(24h) 8.1% · 24h 조회수 52,000". 천단위 구분(`toLocaleString`).
- **새 신뢰도 게이지/바는 만들지 마라**(상대 기준이라 단일 영상 절대표시는 오해 소지 + 과설계). 숫자 노출로 충분.

## 주의 (구체)
- **TRUS Create 3색만**: Black/Yellow/White. 그라데이션·그림자·둥근 과한 모서리 금지. 기존 폼(ctr24h 입력칸)의 스타일 클래스를 그대로 따라가라. 이유: 디자인 일관성.
- **step0·1 시그니처 불변**: `CopyAbInput.views24h`·`CopyLearnVideo.views24h`는 step1이 확정한 계약. 폼은 채우기만. 이유: 범위.
- **빈칸=null**: 조회수 미입력은 정상(vconf=1.0=기존 동작). 0과 빈칸을 구분(빈칸→null, "0"→0). 이유: 하위호환.
- 숫자 입력 검증: 음수·비숫자는 null 처리(throw 금지). 이유: 입력 견고성.
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수.

## 테스트
- 순수 매핑/파싱이 분리돼 있으면 단위테스트(빈칸→null·"52000"→52000·음수→null). 컴포넌트 자체는 build/typecheck로 검증(헤드리스 클릭검증은 server-only 장벽으로 생략 — 기존 copy-learning-admin step2 관례).

## Acceptance Criteria
```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차
1. AC 실행(Joy 검수). `/copy-learn`이 build에 포함되고 typecheck 통과하는지.
2. 체크: views24h 입력칸·프리필·toInput 파싱·reach 표시·TRUS 3색·step0/1 계약 불변.
3. (Esther) 디자인 체크: 3색·직각·무그림자·기존 폼과 시각 일관.
4. `phases/copy-views-weight/index.json` step 2 갱신.

## 금지사항
- 새 신뢰도 게이지/프로그레스바 추가 금지. 이유: 상대 기준이라 단일 영상 절대표시는 오해·과설계.
- 그라데이션·그림자·TRUS 외 색 금지. 이유: 디자인 시스템.
- step0·1 계약(CopyAbInput/CopyLearnVideo/ctrWeightedScore) 수정 금지. 이유: 범위.
- 백엔드 저장/학습 로직 수정 금지(step1). 이유: 범위.
- 기존 테스트를 깨뜨리지 마라.
