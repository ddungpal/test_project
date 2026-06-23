# 운영 전환 & go-live 체크리스트

> 개발($0·claude-p+fixtures) → 운영(Anthropic API·실비) 전환 가이드. 검증일 2026-06-22.

## 실측 편당 비용
- **풀 파이프라인(촉이→훅이→구다리→셜록셀→짠펜) = $0.39 / 편** (api·sonnet 중심·**scribe 측정 당시 sonnet**, 검색 mock).
  - 단계별: scribe $0.088 · structurer $0.063 · fact_verifier×4 $0.065 · topic $0.045 · numbers $0.034 · hook $0.034 · critic $0.029 · sherlock $0.026 · analogist(haiku) $0.007.
  - ⚠️ **2026-06-23 변경**: 골든 A/B 결과 짠펜(scribe) 운영 모델 = **Opus 4.8**(sonnet 대비 ~5×) → scribe ≈ $0.088→~$0.44, **편당 ≈ $0.74**로 상향 추정. 그래도 하드캡 $10의 ~7.4%·목표 $5-9 한참 아래.
  - 하드캡 $10의 **3.9%**(scribe=sonnet 기준), 소프트캡 $7의 5.6%. 여유 큼.
  - 검색은 Tavily 무료 1000/월 → LLM 비용에 불변. 회고는 편당 1회 추가(opus, ~$0.1~0.3).
- 추정(fixture 토큰)은 $0.09였으나 라이브 프롬프트가 더 무거워(실 검색결과·댓글집계) 실측은 ~4배. **그래도 목표 $5-9 한참 아래.**

## 운영 env (프로덕션)
```
LLM_BACKEND=api               # claude-p(개발 $0) → api(운영 실비)
LLM_FIXTURES=off              # 운영은 매번 실호출(편마다 프롬프트 고유 → fixture 무의미)
ANTHROPIC_API_KEY=sk-ant-...  # 운영 키(커밋 금지)
COST_SOFT_CAP_USD=7           # 일시정지 임계
COST_HARD_CAP_USD=10          # 중단 임계(예약 단계서 초과 시 호출 거부 → 과금 0, 검증됨)
SEARCH_BACKEND=tavily         # 실검색(개발 mock $0)
SEARCH_FIXTURES=record        # 검색 캐시 TTL(발굴 신선도)
PERFORMANCE_SOURCE=youtube    # 성과 자동 수집(OAuth 필요) · 개발 manual
DEV_OWNER_BYPASS              # ⚠️ 운영/스테이징 절대 미설정(NODE_ENV=production이면 어차피 무력)
```

## 검증된 안전장치
- **비용 하드캡**: 예약(reserve) 단계에서 추정비용이 하드캡 초과 시 `HardCapExceededError` → **API 호출 0·과금 $0**(라이브 검증).
- **스키마 강제**: api는 forced tool_use. 단 required 100% 보장 못 함 → 빈 배열 가능 필드는 required에서 제외·코드 기본값(critic 사례). 신규 에이전트도 동일 원칙.
- **인증**: 진짜 로그인(이메일/비번)·세션 미들웨어·requireOwner 게이트.

## go-live 전 사용자 액션 (남음)
- [ ] **owner 비밀번호** 본인 것으로 설정(현재 검증용 임시).
- [ ] **YouTube Analytics OAuth** 채널 인증(성과 자동 수집 실연결) — `YT_OAUTH_*`.
- [ ] **OpenAI 키 rotate**(노출분 폐기).
- [ ] **브라우저 최종 검증**(로그인→대시보드→로그아웃).
- [ ] Vercel 환경변수 세팅(위 운영 env, `DEV_OWNER_BYPASS` 제외) + Inngest 프로덕션 연결.

## 남은 운영 하드닝(후순위)
- 실시간 구독(수동 새로고침 → Supabase Realtime) · audit_log · eval 엄밀화 · 골든 A/B(모델 비교, 별도 트랙).
