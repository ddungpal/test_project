# Step 1: ab-ingest (A/B 성과 영속 기록)

**`ab-results.json` → `ab_variants` 테이블 적재.** A/B 성과의 **진실 출처**(ab_variants)를 채운다. step0의 스타일 학습은 ab-results.json을 직접 읽지만, 이 테이블은 추후 회고·검증·provenance 연결에 쓰인다(§13.2: ab_variants=진실, contents.ab_*=파생 캐시).

> ⚠️ 코드만 만들고 **실제 적재 실행은 돌리지 마라**(DB 변경). AC는 `typecheck`+`test`. 실제 `--commit` 적재는 사람이 검수 후.

## 읽어야 할 파일 (먼저 정독)
- `corpus/thumbnails/ab-results.json` — 입력. `videos[].variants[].{variant, watch_share_pct, is_winner, copy_*, visual}` + `youtube_video_id?`·`golden_edition`.
- `src/performance/ingest.ts` — **기존 ab_variants 멱등 upsert writer 재사용/미러**(이미 performance 적재에 ab_variants 다룸). 어떻게 upsert·content_id 해석하는지 그대로 따른다.
- `src/performance/abVerdict.ts` — `judgeComponent`로 rank·is_winner·margin 산출(ab-results.json의 is_winner를 코드로 재확인).
- `src/lib/supabase/database.types.ts` — `ab_variants`(content_id, component_type 'thumbnail', variant 'A'|'B'|'C', payload jsonb, ctr_pct, impressions, weight, rank, is_winner), `contents`(id, youtube_video_id).
- `scripts/ingest-performance.ts` — 기존 적재 CLI 패턴(--list/--cleanup) 참고.

## 작업

### 1. `scripts/ingest-ab.ts` (신규)
- `ab-results.json` 로드 → 영상별:
  - **content_id 해석**: `youtube_video_id` 있으면 `contents`에서 매칭. **없으면(비골든 영상)**: 가벼운 content 스텁 생성(source 적절·status 적절·title=topic·youtube_video_id가 있으면 채움) **또는** content_id 없이 건너뛰고 경고(둘 중 택1 — 스텁 생성을 권장하되, contents 척추 규칙[CLAUDE.md] 위반 안 되게 최소 필드만).
  - **ab_variants upsert**(멱등): component_type='thumbnail', variant A/B/C, **`ctr_pct` 슬롯에 watch_share_pct**(payload에 `metric:"watch_share_pct"` 명시 — CTR 아님을 기록), impressions=null(Studio 미노출), payload={copy_top,copy_main,copy_box,visual}, rank·is_winner·weight는 judgeComponent 결과로.
  - `contents.ab_*` 파생 캐시는 ingest.ts가 하는 방식 그대로(드리프트 차단·단일 출처).
- `--commit`(기본 dry-run) + `--cleanup`(역연산) — ingest-performance.ts 패턴.
- `invokedDirectly` 가드 + `main().catch(process.exit(1))`.

### 2. `tests/abIngest.test.ts` (신규)
- 순수 검증: ab-results.json → ab_variants 행 매핑(variant/ctr_pct/is_winner/payload)·judgeComponent rank 일치·멱등(같은 입력 2회 → 동일 행). DB 없이 변환 함수만.

## 주의 (구체)
- **거버넌스**: ab_variants payload엔 썸네일 카피·시각만(공개 정보). 댓글·PII 무관.
- 멱등 필수(unique 제약 활용 upsert). 2회 적재 동일.
- watch_share_pct를 CTR로 **오기재 말 것** — payload metric 명시.
- 비골든 영상 content 스텁: 최소 필드·중복 생성 금지(youtube_video_id/topic 매칭 먼저).
- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 준수.
- 범위: `ingest-ab.ts` + 테스트(+ 필요시 ingest.ts에서 공유 헬퍼 export). 파이프라인·에이전트 금지.

## Acceptance Criteria
```bash
npm run typecheck
npm test
```

## 검증 절차
1. AC 실행 exit 0.
2. `git status` 변경 범위 확인.
3. step 1 갱신: 성공 → `"status":"completed"`, `"summary":"ingest-ab.ts(ab-results.json→ab_variants 멱등·watch_share metric명시·content_id해석)+테스트. 적재 미실행. typecheck/test 그린"`. 실패(3회) → `"status":"error"`+`error_message`.
