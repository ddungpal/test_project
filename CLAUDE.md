# CLAUDE.md — produce script (콘텐츠 제작 동료 AI 시스템)

## ‼️ 세션 재개 규칙 (최우선)
**사용자가 단독으로 `1` 을 입력하면**, 즉시 `PROJECT_STATE.md`를 읽고 다음을 정리해 보여준다:
1. **▶ 다음에 바로 진행할 작업 (NEXT)**
2. **📋 남은 작업 (BACKLOG)** 체크리스트 + 현재 진행 단계
3. (간단히) 직전까지 확정된 핵심 결정 요약

그 외 부연설명은 최소화하고, 사용자가 어느 작업부터 할지 고를 수 있게 제시한다.

## 프로젝트 개요
유튜브 크리에이터 **김짠부**(@zzanboo)의 콘텐츠 제작 5단계(주제→썸네일/제목→구성→리서치→스크립트)를 AI 크루가 보조·대행하고, 학습으로 고도화되어 김짠부의 사고를 확장하는 "제작 동료 AI 시스템".
**핵심 원칙: 김짠부는 매 단계 '선택'만, 이유는 AI가 현재 방식에 근거해 설명한다.**

## 크루 (하이브리드 에이전트)
**반장**(총괄 PD/오케스트레이터) · **촉이**(주제) · **훅이**(썸네일·제목) · **구다리**(구성) · **셜록**(리서치) · **짠펜**(스크립트)

## 문서 체계 (충돌 시 우선순위)
`docs/principles.md > docs/tech.md > docs/plan.md` · 본 `CLAUDE.md`(규칙·라우팅) · `DESIGN.md`(TRUS Create 적용) · `PROJECT_STATE.md`(진행상태) · `ARCHITECTURE.md`(FE/BE/DB 계층 지도 — **구조 변경 시 갱신**)
전체 설계 플랜: `/Users/dongwonchoi/.claude/plans/inherited-mixing-honey.md`

## 핵심 결정 (요약)
- **모델**: RAG 시작 → 단계별 AX 전환(정성적 트리거). AX 우선순위 **말투내재화 > 선제제안 > 자율성**.
- **비용**: 개발=`claude -p`(구독·정액·공짜 반복) / 운영=Anthropic API(편당 ~$20). `src/llm/callLLM()` 어댑터로 스위치. 개발은 `fixtures/` 리플레이로 과금 0.
- **스택**: Next.js + TS + Supabase(전용 DB) + Tailwind v4 + shadcn/ui + Vercel + **Inngest**(durable 파이프라인).
- **디자인**: TRUS Create — Black `#121212` / Yellow `#F8F082` / White 3색만, 산돌 격동고딕2, 강렬·직설(사색·여백 톤 금지), 그라데이션·그림자 금지. 원본: `design/design-system/trus-create/trus-create-design-system.md`.
- **데이터**: 3층 구조(L1 raw / L2 structured / L3 knowledge). 패턴: 제안 N개+이유 → 선택+수정 → 회고 성과연결 → 인사이트 승격.
- **팩트체크**: 출처명시 + 교차검증 + 사람 최종확인 (100% 보장 불가 인정).

## 보안 / 민감정보 (반드시 준수)
- `.env*`, API 키(YouTube/Claude/OpenAI/Supabase), service role key, 스크립트·댓글 원본, DB 덤프, 팀원 개인정보는 **절대 커밋 금지**.
- `.gitignore`: `.env*`, `*.pem`, `*.key`, `credentials/`, `fixtures/` 내 민감응답.
- 커밋 전 `git diff --staged`로 민감정보 확인.
