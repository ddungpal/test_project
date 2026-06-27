
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

=== Step 1: structure-view-ui ===
[리드] 맥스, step0에서 만든 getStructureProfiles 가져다가 /copy-learn에 '구성 학습 (구다리)' 섹션 붙여줘. 핵심은 기존 PatternNode 재귀 렌더러 재사용(새로 만들지 마), reference_outlines는 JSON 덤프 말고 '[주제] → 1. 섹션 — note' 가독 목록으로. 프로필 없으면 빈 상태 안내. 읽기 전용이라 버튼 일절 없음. TRUS 3색 지켜.
[Max] 알겠어. step0 로더(getStructureProfiles) 가져다 쓰고, PatternNode 그대로 재귀 렌더 재사용할게. reference_outlines만 따로 빼서 주제→섹션 목록으로 읽기 좋게 뽑고, 빈 값들은 다 방어할게. 읽기 전용이라 버튼은 안 만들어.
[Max] 구성 학습 섹션 붙였어. StylePanel 다음, 교정 학습 위에 뒀고 읽기 전용이라 버튼은 없어. patterns는 기존 PatternNode 그대로 재귀로 펼치고, reference_outlines만 빼서 [주제] 1. 섹션 — note 식 목록으로 따로 뽑았어. 주제 없음·빈 목차·note 없음 다 막아놨어.
[Max] PATTERN_KEY_LABEL에 section_archetypes/flow_principles/hook_placement/anxiety_relief/misconception_handling/ordering_notes/reference_outlines 한글 라벨 추가했어. 기존 키는 안 건드림. 빈 상태는 점선 border로 extract-structure-style.ts → activate 안내 띄워.
[Max] typecheck 0, test 586개 전부 통과, build 6/6 다 떴어. exactOptionalPropertyTypes 때문에 note undefined일 때 키 자체를 안 넣게 한 줄 고친 거 빼곤 깔끔해. 기존 패널은 손 안 댔어. 봐줄래.
[리드] AC 셋 다 내가 다시 돌렸고 전부 exit 0. 에스더, 새 구성 학습 섹션 TRUS 3색·안티슬롭·가독성만 한번 봐줘. 읽기 전용이라 기능은 안 건드려도 돼.
[Esther] 음 나 왔어. 맥스가 붙인 구성 학습 섹션 지금 보는 중이야. 일단 StructurePanel 통째로 읽었어.
[Esther] 좋은 점 먼저. PatternNode 그대로 재사용했고 reference_outlines만 빼서 [주제] 1. 섹션 — note 위계로 뽑은 거 깔끔해. JSON 덤프 느낌 전혀 안 나. 이건 잘했어.
[Esther] TRUS 3색도 다 지켰어. 노랑 라벨 검정 배경 흰 텍스트뿐이고 그라데이션 그림자 보라색 그런 거 하나도 없어. StylePanel CorrectionPanel이랑 톤도 똑같아. 안티슬롭 통과.
[Esther] 근데 조심스럽지만 하나 걸리는 게 있어. active 프로필 카드 보면 왼쪽에 라벨 활성이 흰색으로 있고 바로 옆 상태뱃지에도 활성이 노랑으로 또 떠. 활성 v3 활성 이렇게 같은 단어가 두 번 나와. 이건 중복 위계라 안티슬롭이야.
[Esther] 라벨은 이 카드가 무슨 슬롯인지를 알려주는 거라서 적용 상태랑 의미가 살짝 다르거든. 그래서 라벨을 현재 적용으로 바꾸면 현재 적용 v3 활성 이렇게 돼서 겹침이 사라져. 최신 초안 라벨은 그대로 두고. 이건 내가 자신 있어.
[Esther] 그리고 빈 상태 문구에 extract-structure-style.ts activate 이렇게 개발 파일 경로가 사용자 화면에 그대로 노출돼 있어. owner는 그 스크립트 이름 몰라. 다른 빈 상태들처럼 어디서 생기는지 사람말로 바꿀게. 이 두 개만 손댈게 나머진 멀쩡해.
[Esther] 다 고쳤어. active 카드 라벨 현재 적용으로 바꿔서 활성이 두 번 뜨던 거 없앴고, 빈 상태 문구도 사람말로 바꿨어. 나머진 진짜 멀쩡해서 안 건드렸어 게으른 게 미덕이라며.
[Esther] typecheck 0 test 586개 통과 build 도 다 떴어 셋 다 exit 0. 맥스 작업 깔끔했어 미세 조정만 했어. 수고했어!
[리드] 조이, 맥스+에스더 작업 전부(git diff) 독립 검수 부탁해. 체크리스트: PatternNode 재사용(중복 구현 없음)·reference_outlines 가독 목록(JSON 덤프 아님)·빈 상태 안내·TRUS 3색·읽기 전용. AC도 직접 재실행해줘.

[Joy] 자 나 검수 들어간다~ git diff 먼저 쫙 봤어. page.tsx에 getStructureProfiles 한 줄 붙이고 prop 넘기고, Form에 StructurePanel 추가한 거 깔끔하네
[Joy] 오 좋다 PatternNode 그대로 재사용했고 새 patterns 렌더러 안 만들었어. STATUS_LABEL도 기존 거 공유. 중복 구현 없음 굿굿
[Joy] reference_outlines는 따로 빼서 [주제] → 1. 섹션 — note 목록으로 뽑았네. normalizeOutlines가 주제없음/목차없음/note없음 다 방어해놨다 꼼꼼해
[Joy] typecheck exit 0, 테스트 586개 전부 통과(tests 폴더 손 안 댐), build도 exit 0. 셋 다 깨끗해
[Joy] TRUS 색도 검정/노랑/흰만 썼고 그림자·그라데이션 없음. 버튼도 안 달려서 읽기전용 맞아. 통과! 맥스 에스더 수고했어 🎉
[리드] PASS 확인(AC 셋 다 exit 0 근거). step1 completed로 마킹했어. /copy-learn에 구다리 구성 학습 섹션까지 붙어서 이 phase 끝. 셋 다 수고 많았어.
