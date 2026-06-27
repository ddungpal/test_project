
=== Step 0: structure-view-data ===
[리드] 맥스, copyLearnView에 structure 프로필(active+최신 draft) 로드 추가하는 거 맡아줄래. 썸네일/제목 로드 패턴 그대로 미러하고 기존 타입 안 깨지게. UI는 step1이니까 손대지 마.
[Max] copyLearnView 썸네일/제목 로더랑 corrections 폴백 패턴 다 봤어. structure 로더는 component_type='structure'만 따로 조회해서 active 1개 + 최신 draft 1개 싣는 식으로 붙일게. union엔 안 건드리고 독립 타입으로 둘게.
[Max] getStructureProfiles 붙였어. style_profiles에서 structure만 version desc로 받아서 active 1개 + draft 1개 채우는 식이야. 조회 실패하면 그냥 null로 떨궈서 페이지는 안 막히게 해놨어.
[Max] typecheck/test/build 다 통과했어. union은 안 건드렸고 page.tsx도 안 만졌어. step1이 export만 가져다 쓰면 돼. 놓친 거 있으면 말해줘.
[리드] AC 셋 다 내가 다시 돌려봤고 전부 exit 0. 조이, git diff랑 AC로 독립 검수 좀 부탁해.
[Joy] 오 맥스 빠르다 step0 바로 봤어 git diff 깔끔하게 추가만 됐네 함수 손댄 거 하나도 없고 굿굿
[Joy] component_type structure 단독으로 eq 조회하고 썸네일 제목 in 쿼리랑 완전 분리해놨네 핵심 잘 잡았어
[Joy] CopyStyleComponentType union 안 건드리고 StructureProfile 독립 타입으로 뺀 것도 좋아 폼 Record 안 깨짐
[Joy] 조회 실패하면 active null latestDraft null 폴백 getCorrections 패턴 그대로 미러했네 페이지 안 막힘
[Joy] typecheck 0 test 586개 전부 통과 build 6/6 다 떴어 테스트 건드린 것도 없고 깔끔하다 통과 축하해
[리드] PASS 확인. step0 completed로 마킹했어. 수고했어 둘 다 — step1에서 이 로더 가져다 UI 붙이면 돼.
