
=== Step 0: scope-state-machine ===

[리드] 자, 새 phase 첫 step이야. 리서치 앞에 선택 게이트(research_scoped)를 끼우는 상태머신 공사. 셀/UI는 안 건드리고 enums·마이그레이션·시드/테스트만. 맥스 불러올게.
[Max] 코드 정독부터 했어. enums, 마이그레이션 22·23, 파이프라인 테스트, standalone seed까지 다 봤고. research_scoped는 structure_selected랑 researching 사이에 끼우면 seed walk가 자동으로 따라와. seed.ts는 안 건드려도 될 것 같아.
[Max] 마이그레이션 27 만들고 enums에 research_scoped 끼워넣었어. 테스트는 structure_selected 직행 막힌 거랑 scope 경유 경로로 갱신했고. stage CHECK는 05/23에서 이미 research 허용돼서 안 건드렸어. AC 돌려볼게.
[Max] typecheck·test(651개)·build 다 통과했어. RunState 전수 맵이 두 개 있어서(labels, stageProgress) 거기 research_scoped 항목만 채웠어. 동작은 안 바꿨고 타입 채우기만. UI 게이트는 step1 몫이라 await_start로 둬놨어. 놓친 거 있으면 말해줘.

[Joy] 오 맥스 빠르다~ 나 git diff랑 마이그레이션 27 다 읽었어. 코드 깔끔하네 굿굿. 지금 typecheck·test·build 직접 돌려볼게!

[Joy] typecheck exit0, test 651개 다 통과 exit0, build도 exit0! 셋 다 깔끔하다 🎉
[Joy] 전이표도 직접 대조해봤어. enums랑 마이그레이션 27이 1:1로 딱 맞고, researching으로 들어오는 다른 길들(research_review·scripting·paused_soft_cap)도 그대로 살아있어. rework 재진입 테스트가 그거 지켜주고.
[Joy] stage CHECK 안 건드린 것도 정당해. 05에서 이미 research 있고 23은 thumbnail만 추가했고, stage_selections는 proposal_id로 참조라 stage 컬럼 자체가 없네. 맥스 꼼꼼하다 굿굿 👍
[Joy] 금지영역(pipeline/server/app/components) 워킹트리 변경 0건이고, labels·stageProgress는 키 한 줄씩만 추가. 테스트도 약화 없이 새 경로로 갱신됐어. 통과! 수고했어 맥스 🩷

[리드] 1라운드 PASS. AC 셋 다 exit 0 내가 직접 확인했고 조이 검증도 일치. research_scoped 상태·전이 공사 끝. 셀/UI 게이트 배선은 step1·2로 넘긴다. step 0 완료.

=== Step 1: scope-candidates ===

[리드] 맥스, step1이야. 셜록 scope를 '검증 실행'에서 '제안'으로 바꾸는 거. 핵심은 후보를 몰래 안 자르고(블라인드 slice 제거) 목차 섹션 고루 커버해서 전부 stage_proposals(stage=research)에 저장하고 structure_selected→research_scoped 전이만. fan-out 검증은 절대 안 돌려(step2 몫). budget은 상한 아니라 UI 기본체크 힌트일 뿐이야. 자세한 설계 메모 보낼게.

[Max] 설계 메모 잘 봤어. 관련 코드 다 읽었어. researchCell의 scope→slice→fan-out 흐름이랑 stageContract 저장 패턴 파악했고, 이제 scope-only 경로 분리부터 시작할게. fan-out은 안 건드린다.

[Max] scope-only 경로 만들었어. researchScope.ts에서 셜록 후보를 claims+concepts 전부 stage_proposals(research)에 박고 research_scoped로만 전이해. budget은 default_selected 마킹에만 쓰고 후보는 하나도 안 잘라. budget 헬퍼는 순수 함수로 빼서 테스트도 붙일 거야. 이제 Inngest에서 상태 보고 scope/cell 분기 배선할게.

[Max] step1 끝났어. Inngest는 run 상태 보고 structure_selected면 scope 제안, 아니면 기존 셀로 분기해. runResearchCell은 안 건드렸고 두 경로 공존해. AC 셋 다 직접 돌려서 exit 0 확인했어 — typecheck, test 660개, build 다 통과.
[Max] 한 가지 짚고 갈게. 셜록 SYSTEM이랑 스키마가 바뀌어서 sherlock_lead promptHash가 변했는데, 자동 테스트가 scope를 replay하는 게 없어서 npm test는 그린이야. 기존 fixture 6개 실제 재기록은 Supabase 붙은 dev 풀런이 있어야 돼서 내 환경에선 못 했어. 거기서 한 번 돌려줘야 할 것 같아. 놓친 거 있으면 말해줘.

[리드] 조이, step1 검수 부탁해. AC 셋 다 내가 직접 돌려서 exit 0 확인했어(test 660). 핵심 체크포인트: 블라인드 slice 진짜 제거됐는지(후보 전부 저장), budget이 상한 아니라 default_selected 마킹에만 쓰이는지, fan-out 검증(verifyClaimStep/numbersStep/criticStep/reconcileFacts) 호출 0인지, structure_selected→research_scoped 전이만 하는지야.
[Joy] 오 맥스 step1 빠르다~ 바로 git diff 펼쳐서 봤어. researchScope.ts에 .slice 한 개도 없네, claims/concepts 후보 전부 stage_proposals에 담는다 굿굿
[Joy] budget도 default_selected 상위 N개 마킹에만 쓰고 후보 절단엔 안 쓰더라. 의도대로야 진짜
[Joy] fan-out 검증(verifyClaim·numbers·analogy·critic·reconcile) 호출 0개 확인했고 researchCell이랑 researchReconcile은 손도 안 댔어. step2 몫 잘 지켰네
[Joy] 저장부도 runProposalStage insert 패턴 그대로 미러링했고, 전이는 structure_selected→research_scoped만. researchStage 분기도 state로 깔끔하게 갈렸어
[Joy] AC 셋 다 내 손으로 다시 돌렸어 — typecheck exit 0, test 660 passed exit 0, build exit 0. 그라운드트루스 확인 완료!
[Joy] researchBudget 테스트도 floor/ceiling/섹션0/음수/NaN 경계 다 잡혀있고 stray fixture도 안 섞였어. 통과! 수고했어 맥스 🎉

[Joy] AC 셋 다 내 손으로 다시 돌렸어 — typecheck·test(660)·build 전부 exit 0! 블라인드 slice 진짜 사라졌고 budget은 default_selected 마킹만, fan-out 검증 호출 0건 확인. 멱등 가드까지 챙겨놔서 깔끔해. 통과! 🎉
[리드] 1라운드 PASS. AC 셋 다 exit 0 직접 확인했고 조이 검증도 일치. step1 scope-candidates 완료 — 후보 몰래 안 잘리고 섹션 커버, research_scoped 전이까지. 선택→검증 배선은 step2로 넘긴다.
