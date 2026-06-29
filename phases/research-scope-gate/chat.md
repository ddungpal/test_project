
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
