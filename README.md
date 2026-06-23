# produce script — Phase 0 부트스트랩

김짠부 콘텐츠 제작 동료 AI 시스템. 설계는 `docs/`(principles > tech > governance), 진행상태는 `PROJECT_STATE.md`.

## Phase 0 범위 (구현됨)

- **`callLLM()` 어댑터** (`src/llm/`) — dev=`claude -p`(정액·공짜) / prod=Anthropic API를 호출부 코드 동일하게 스위치(tech.md §2).
- **비용 가드** (`src/llm/costGuard.ts`) — 2단 캡(SOFT $7 사람확인 / HARD $10 중단) + **병렬 fan-out 누수 차단용 preflight 원자 예약**(§17 P1).
- **fixtures 리플레이** (`src/llm/fixtures.ts`) — promptHash 기반 녹화·재생. 개발 $0 보장.
- **스키마 강제** (`src/llm/schema.ts`) — 모든 LLM 출력은 JSON Schema 통과 필수(§10).
- **도메인 enum + 전이 가드** (`src/domain/enums.ts`) — 상태머신(+`paused_soft_cap`·`aborted`), verified 합격 규칙(§5·§17).
- **role_id 레지스트리** (`src/agents/roles.ts`) — 안정 식별자 + tool 화이트리스트(§10).
- **댓글 HMAC** (`src/lib/commentHash.ts`) — external_id 해시, 작성자 미보관(governance §2).
- **TRUS 디자인 토큰** (`src/app/globals.css`) — Black/Yellow/White 3색.

## 개발

```bash
pnpm install
pnpm typecheck          # tsc --noEmit
pnpm test               # vitest — parity 스파이크($0)
pnpm dev                # Next.js 대시보드 셸
```

### parity 스파이크 (§17 첫 검증)

- `pnpm parity:replay` — fixtures로 어댑터·비용가드·parity 하니스를 **$0** 검증.
- `pnpm parity:live` — `ANTHROPIC_API_KEY` 있을 때 claude-p vs api **실호출** 동형성 확인(운영 모델 확정 전 1회).

## 환경 변수

`.env.example` 참고. 비밀(API 키·`COMMENT_HASH_SECRET`·service role)은 서버 전용, `NEXT_PUBLIC_` 금지, 커밋 금지(`.gitignore`).

## 다음 (Phase 1)

DB 마이그레이션(§17: FK 순서/DEFERRABLE·RLS 정책·verified CHECK·hot FK 인덱스) · ingest(토큰 암호화·PII) · 콜드스타트 시드.
