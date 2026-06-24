
=== Step 0: conformance-guard ===
[리드] 맥스, step0 좀 맡아줄래. A/B 학습한 banned·winning 패턴으로 훅이 출력 사후 검사하는 순수 함수 하나랑 toCandidates 주석 추가야. ref_similarity 옆에 똑같은 방식으로 붙이면 돼. promptHash는 절대 안 건드리게.
[Max] 응, 시작할게. ref_similarity 옆에 똑같이 붙이는 거지. 순수함수부터 테스트로 박아놓을게.
[Max] 순수함수랑 toCandidates 주석 다 박았어. 이제 typecheck/test/build 돌려본다.
[Max] typecheck 통과, 테스트 255개 다 그린. build는 처음에 audit 페이지 못 찾는다고 빨갰는데 stale .next 캐시였어. 지우고 다시 도니까 깨끗하게 통과.
[Max] 픽스처 안 건드렸고 promptHash도 그대로야. banned_hits는 따옴표 예시구 substring이라 완전 의미판정은 아니야 — winning_score가 더 믿을만하다고 주석 달아놨어. 놓친 거 있으면 말해줘.
[리드] 맥스 빠르네. AC 내가 직접 다 돌려봤어 — tc 0, 테스트 255개 통과, 빌드 0. 조이, 독립 검수 부탁해.
[Joy] 오 맥스 빠르다~ 나 git diff랑 신규파일 다 봤어. 범위 깔끔하네, UI는 안 건드렸고 딱 4파일이야. 이제 tc/test/build 직접 돌려본다!
[Joy] 다 돌려봤어! typecheck 0, 테스트 255개(styleConformance 10개 포함) 다 그린, build도 한방에 통과. 나는 .next 캐시 안 지웠는데도 깨끗하더라.
[Joy] 순수함수 진짜 방어적으로 잘 짰네. patterns 깨져도 중립 리턴하고 크래시 안 나, 자릿수표기랑 TOP 옵션토큰도 banned에 있을때만 hit이라 거짓양성 안 생기고. 휴리스틱 주석도 코드에 박아놨고 굿굿.
[Joy] style_conformance가 ref_similarity 바로 옆 toCandidates에 붙어서 promptHash 무관, 픽스처 0건 변경. prepare/schema도 안 건드렸어. 통과! 맥스 깔끔하다 🎉
[리드] 조이 검수 통과(PASS). AC 세 개 다 exit 0, 픽스처 무변경 확인. step0 completed로 마감한다. 수고했어 둘 다.
