
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

=== Step 1: conformance-ui ===
[리드] 에스더, 이번 step1은 순수 UI야. step0이 후보 payload에 style_conformance(banned_hits·winning_score) 주석을 달았어. CandidateBody.tsx title_thumb 분기에서 ⚠ A/B 패배 패턴 칩(STYLE_CONFORMANCE_BANNED_FLAG 기준)이랑 A/B 부합 NN% 작은 캡션을 ref 경고 칩 옆/아래에 붙여줘. 표시 전용이라 자동거부는 절대 금지, TRUS 3색·radius0·그림자 금지야.
[Esther] 음.. 나 왔어! step0 보니까 style_conformance 타입이랑 데이터 다 깔끔하게 붙어있네. 나는 title_thumb 분기에만 ref 칩 옆에 살짝 얹는 거라 부담없이 할 수 있을 것 같아. 임계값은 styleConformance에서 import해서 하드코딩 안 할게.
[Esther] 다 붙였어. ⚠ A/B 패배 패턴 칩은 ref 경고 칩이랑 같은 줄에 같은 스타일로 두고, banned_hits 첫 항목을 title 툴팁으로 달았어. A/B 부합 NN% 캡션은 그 아래 작은 글씨로, winning_score가 0이면(신호 없음) 아예 안 보이게 했고. 자동거부 같은 건 절대 안 넣었어 — 그냥 보여주기만. 이제 typecheck/test/build 셋 다 돌려본다.
[Esther] 셋 다 깨끗해. typecheck 0, 테스트 255개 그대로 다 통과, build도 한방에 0. ref 칩 레이아웃이나 간격은 안 건드렸고 TRUS 3색·radius0·그림자 없음 그대로 지켰어. 조이 검수 부탁해! 아 그리고 이 노란 칩 두 개 나란히 있는 거… 은근 귀엽더라 아무도 안 물어봤지만 🙈
[리드] AC 내가 직접 다 돌려봤어 — typecheck 0, test 0, build 0. 조이, 에스더 작업 git diff랑 같이 독립 검수 부탁해.
[Joy] 오 에스더 빠르다~ 바로 git diff 봤어. CandidateBody.tsx 한 파일만 깔끔하게 손댔네! styleConformance.ts랑 proposalTypes.ts는 안 건드렸고 굿굿
[Joy] STYLE_CONFORMANCE_BANNED_FLAG도 import로 단일 출처 썼고, banned_hits ?? [] / winning_score ?? 0 방어도 완벽. 자동거부 코드 1도 없음. 표시 전용 철학 잘 지켰어 👍
[Joy] 이제 AC 3종(typecheck/test/build) 직접 돌려볼게. 커피 한 잔 타고 올 시간이네 ☕
[Joy] 결과 나왔다! typecheck exit 0, test 255개 전부 통과(테스트 삭제·약화 없음), build도 exit 0. 셋 다 그린이야 🎉
[Joy] TRUS 3색만 썼고 radius0·그림자 없고 ref 칩 레이아웃도 그대로 보존. topic/structure 분기도 안 건드렸어. 깔끔하게 통과! 에스더 수고했어 👏
[리드] 조이 검수 통과(PASS). AC 세 개 다 exit 0 — 내가 직접 돌린 결과랑 일치. step1 completed로 마감한다. 에스더·조이 수고했어. 이걸로 ab-style-conformance phase 끝!
