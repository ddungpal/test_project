
=== Step 0: skeleton-engine ===

## Step 0 — skeleton-engine (로컬 생성 엔진: 순수 + 테스트)
[리드] 자, copy-local-gen 첫 스텝 시작. 이건 순수 함수라 UI 없고 백엔드만이야. 맥스, localCopyGen.ts랑 테스트 좀 맡아줄래?

[Max] 어, 내가 맡을게. 스펙이랑 기존 stage.ts payload 구조 다 봤어. 슬롯 치환에 banned 필터, offset 회전까지 순수 함수로 만들면 되겠네.
[Max] 빈 슬롯 누출이 핵심인 것 같아. 치환 못한 슬롯 남으면 후보 통째로 버리는 가드 먼저 짜고 테스트부터 박을게.

[Max] 다 됐어. localCopyGen.ts랑 테스트 15개 박았고 typecheck/test/build 다 통과. 전체 384개 그대로 초록.
[Max] build 처음엔 supabase vendor-chunk 못 찾는다고 깨졌는데 코드랑 무관한 stale .next 캐시였어. rm -rf .next 하니까 깔끔하게 빌드되더라. 규칙에 있던 그 케이스 맞았어.
[Max] 썸네일은 main/boxes 한 줄이라도 슬롯 못 채우면 후보 통째로 버리게 했어. 부분만 깨진 채 나가는 게 제일 위험할 것 같아서. 놓친 거 있으면 말해줘. 조이 검수 받을게.
[리드] 맥스 빠르네. AC 3개 다 내 손으로도 돌려봤어 — typecheck/test/build 전부 exit 0. 조이, 독립 검수 부탁해.

[Joy] 오 맥스 빠르다~ 나 git status부터 봤는데 신규 두 파일만 딱 건드렸네. schema도 agent도 안 건드렸고 깔끔해 굿굿
[Joy] 순수성 grep 돌려봤어. Date random fetch supabase callLLM 전부 0건이고 주석 한 줄만 걸렸어ㅋㅋ 진짜 인자만 쓰네 통과
[Joy] 빈슬롯 누출 가드 마음에 들어. 인식 슬롯 치환하고도 남는 미인식 토큰까지 정규식으로 한번 더 잡아서 폐기하더라. 썸네일은 한 라인만 깨져도 통째로 버리고. 깨진 문구 샐 구멍 안 보여
[Joy] AC 셋 다 내 손으로 돌렸어 typecheck 0, test 0(localCopyGen 15개 + 전체 384개 그대로 초록), build도 0이야. stale next 이슈 없이 한방에 빌드됐어
[Joy] 테스트도 실제 출력값 toEqual로 박아놔서 가짜 아니고 진짜 검증하더라. 합격! 다음 스텝 가자 🎉
[Joy] 참고로 untracked에 record fixture 3개(hook_maker 2 topic_scout 1) 떠있는데 이 step 산출물 아니니까 나중에 커밋할 때 범위에서 빼면 돼. 검수엔 영향 없음!
[Joy] 체크리스트 8개 다 코드 근거로 확인했고 AC도 내가 다시 돌렸어 — typecheck/test/build 전부 exit 0! 1라운드 통과 🎉
[리드] 깔끔하게 통과. step 0 완료 처리한다. 다음은 step1 학습시 스켈레톤 방출.
