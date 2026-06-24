# Step 0 — state-machine-split

[리드] 자 시작하자. 제목·썸네일 단계 분리의 토대 — 상태머신/스테이지/타입/마이그레이션 SQL이야. DB 적용은 사용자 몫이고 우리는 코드+오프라인 테스트 그린까지.
[리드] 맥스, 이 step 좀 맡아줄래? enums·stages·proposalTypes 4파일이랑 새 마이그레이션 SQL. 디테일은 step 본문에 다 박아놨어.

[Max] 오케이 맡을게. tech.md 상태머신이랑 003·008 마이그레이션 다 읽었어. 기존 전이 테스트는 pipeline.test.ts에 있더라.
[Max] title_thumb는 안 건드리고 thumbnail 스테이지만 새로 추가하는 방향 확인했어. 시작할게.

[Max] 4파일은 다 했는데, RunState/ProposalStage가 Record로 강제되는 데가 세 곳 있어 — labels.ts, stageProgress.ts, ProposalSelector.tsx. 새 상태 두 개랑 thumbnail 키가 빠지면 typecheck가 깨져.
[Max] UI 로직은 안 건드리고 타입 채우는 자리값만 최소로 넣을게. ProposalSelector.SELECT는 selectThumbnails 액션이 아직 없어서(step1) selectTitles로 임시 위임해뒀어. 본 분기 로직은 그대로야.

[Max] 끝났어. typecheck·test·build 셋 다 exit 0. 테스트는 276개 그린이고, 썸네일 전이/불변식 케이스도 pipeline.test.ts에 넣어놨어.
[Max] DB 마이그레이션은 만들기만 했고 적용은 안 했어 — SUPABASE_DB_URL 없고 사람 게이트라서. 익명 CHECK 기본명 가정한 부분은 SQL 주석에 적어뒀으니 적용 전에 \d로 한번 확인해주면 좋겠어.
[Max] 놓친 거 있으면 말해줘.
[Max] 다 됐어. title_thumb는 그대로 두고 thumbnail 스테이지만 새로 끼웠어. 타입이 Record로 전수강제라 라벨/스텝맵 몇 군데 자리값은 채워야 했고, UI 한 곳은 step1까지 임시로 제목셀렉트에 위임해뒀어. tc/test/build 다 0이야.
[리드] 깔끔하네 고마워. AC 내가 다시 돌려봐도 셋 다 exit 0 확인했어.
[리드] 조이, 검수 좀 부탁해. 맥스 diff 전체랑 AC 결과 보고 판정해줘. 특히 임시로 만진 UI/라벨 3파일이 범위 일탈인지 봐줘.
[Joy] 오 맥스 토대 작업 깔끔하다~ git diff 바로 떠서 enums부터 볼게!
[Joy] enums 굿. titles_selected는 이제 thumbnails_proposed로만 가고, structure 직행 막혔네. STAGES에 thumbnail도 들어갔고 👍
[Joy] stages.ts도 좋아. thumbnail 디스크립터 fromState=titles_selected, structure.fromState=thumbnails_selected로 체인 깔끔하게 이어졌어. title_thumb 엔트리도 그대로 보존 🎉
[Joy] proposalTypes 확인했는데 ThumbnailPayload 새로 생겼고, 중요한 TitlePayload thumbnail_main/boxes/copy 옵셔널 필드 안 지웠어! 잘했어
[Joy] 마이그레이션 SQL도 CHECK 정확히 20값(기존18+신규2), 전이 5개 insert에 titles_selected→structure_proposed delete까지. 타임스탬프도 22로 기존 21보다 큼. 완벽
[Joy] 범위 일탈 의심됐던 labels/stageProgress/ProposalSelector 봤는데, 다 Record 전수강제 통과용 최소 자리값이야. ProposalSelector는 thumbnail→selectTitles 임시위임에 TODO(step1) 주석까지 달아놨고. step1 안 침범했어 굿
[Joy] AC 직접 돌렸어 — typecheck exit0, test 276개 전부 통과, build도 exit0! 셋 다 깨끗해
[Joy] 결론 통과! 토대 단계로 딱 필요한 만큼만 정확히 했네. 맥스 수고했어 🎉☕
[Joy] 오 맥스 깔끔하다~ diff 다 봤고 AC 셋 다 exit 0 확인! title_thumb 안 건드렸고 옵셔널 필드도 살아있고, 임시로 만진 3파일도 타입 때문에 어쩔 수 없는 최소 자리값이더라. 통과! 🎉
[리드] 좋아, step 0 완료. 다음은 step1에서 thumbnail_maker 역할이랑 전용 UI 붙이면 돼. 수고했어 둘 다!

=== Step 1: title-thumbnail-agents ===

[리드] step0 토대 위에 실제 생성 로직 올리는 단계야. 훅이는 제목 3개 전용으로 줄이고, 새 thumbnail_maker가 선택된 제목으로 썸네일 3개를 낸다. Inngest 함수·이벤트·서버액션까지. 순수 백엔드라 에스더는 안 부르고(UI는 step3), 맥스 → 조이로 간다.
[리드] 맥스, 이거 맡아줘. hook_maker 5파일이 thumbnail_maker 템플릿이야. referenceGuard/styleConformance는 재사용(중복 금지). eval은 신규형만 보게 고치고 thumbnail_maker 골든 손작성으로 오프라인 $0 유지해줘. 픽스처 라이브 재녹화 금지.

[Max] 오케이 맡을게. hook_maker 5파일이랑 stages·client·functions 다 읽었어. step0이 thumbnail 디스크립터랑 상태 미리 깔아놔서 토대는 잘 됐네.
[Max] 먼저 훅이를 제목 전용으로 줄이고, thumbnail_maker 새로 만들고, referenceGuard/styleConformance는 import 재사용할게. 시작한다.

[Max] 훅이 제목전용으로 줄였어. 썸네일 출력 다 떼고 ref_similarity만 남겼고, 스타일 주입은 thumbnail_maker로 옮길 거야. learned도 title 카테고리만 보게 했어.
[Max] roles.ts에 썸네일메이커 추가했고, 이제 thumbnail_maker 디렉토리 만든다.

[Max] thumbnail_maker 에이전트(schema/prepare/stage) 다 올렸어. referenceGuard랑 styleConformance는 hook_maker 거 그대로 import해서 재사용했어. 중복 안 만들었어.
[Max] Inngest 함수·이벤트·requestThumbnails 서버액션도 붙였어. 프로덕션 코드 typecheck는 깨끗하고, 이제 테스트랑 골든 픽스처 손볼 차례야.

[Max] 테스트 다 손봤어. hookThumbnailContract는 제목전용 계약으로 바꿨고, 썸네일 계약은 thumbnailMakerContract로 새로 뺐어. prepare 스타일주입 배선도 thumbnailMakerPrepareWiring로 옮겼고 hook쪽은 "스타일 주입 안 함"을 검증하게 했어.
[Max] eval은 훅이 제목전용으로 줄이고 thumbnail_maker describe 추가했어. 골든 픽스처는 파킹통장 톤으로 손작성했어 — 라이브 재녹화 안 했어.
[Max] AC 셋 다 exit 0이야. typecheck 0, test 294개 전부 그린, build 0. 픽스처 손으로 쓴 건데 eval이 통과하니까 좀 다행이네.
[Max] 놓친 거 있으면 말해줘.

[리드] 고마워 맥스. AC 내가 다시 돌려도 셋 다 exit 0 확인했어(test 294 그린).
[리드] 조이, 검수 부탁해. 맥스 diff 전체랑 AC 결과 봐줘. 특히 hook_maker가 제목전용으로 깔끔히 줄었는지, thumbnail_maker가 referenceGuard/styleConformance 중복 없이 재사용했는지, 빈배열 required 함정 없는지, 픽스처가 라이브 재녹화 없이 오프라인 유지되는지 봐줘.
[Joy] 오 맥스 빠르다~ diff 전체 떴어. 훅이 썸네일출력 깔끔하게 떼고 ref_similarity만 남겼네, candidates도 정확히 3개(min·max 3)로 못박았고 👍
[Joy] thumbnail_maker 봤는데 referenceGuard·styleConformance 진짜 hook_maker 거 import 재사용했어. 중복 0! main2/boxes2 minItems라 빈배열 함정도 없고 additionalProperties false라 title도 거부돼
[Joy] thumbnailStageFn도 hookStage 미러 딱 맞아(retries2·concurrency1·onFailure). 골든 픽스처는 파킹통장 톤 손작성이고 라이브 재녹화 흔적 없네. 이제 AC 셋 다 돌려볼게!
[Joy] AC 셋 다 돌렸어 — typecheck exit0, test 294개 전부 통과, build exit0! parity까지 그린이라 픽스처 해시도 보존됐어
[Joy] hook 쪽 wiring 테스트도 스타일 주입 안 함을 not.toContain으로 못박았고, thumbnail 쪽은 별도 contract/wiring으로 새로 뺐네. eval도 훅이=제목전용, thumbnail_maker=썸네일 따로 분리됐어
[Joy] regenerate/confirm/UI 하나도 안 건드렸어 — step2,3 침범 0. 결론 통과! 단계 분리 딱 필요한 만큼 깔끔하게 했네 맥스 수고했어 🎉
[리드] 좋아, 조이 PASS 확인. AC 셋 다 exit 0이고 센티넬도 깔끔해. step1 완료 — 훅이=제목전용, thumbnail_maker 신규 가동, 픽스처 오프라인 유지. 둘 다 수고했어! 다음은 step2 다시생성 백엔드야.

=== Step 2: thumbnail-regenerate-backend ===

[리드] 자 step2다. 썸네일 다시생성 백엔드 — 전체(3개 새로)랑 개별(3칸 중 1칸만 교체·나머지 유지). UI는 step3니까 순수 백엔드라 에스더는 안 부르고 맥스→조이로 간다.
[리드] 맥스, 이거 맡아줘. 전체는 기존 force 경로(regenerateStage)에 thumbnail만 끼우면 끝이고, 개별이 핵심이야. composeSlotReplacement 순수함수로 1칸만 교체(나머지 idx·payload 보존) + regenerateThumbnailSlot 무전이 in-place(낙관잠금 state=thumbnails_proposed). step1 thumbnailStageSpec의 prepare/toCandidates 재사용하고, 변주는 buildRegenerateAugmentedSystem 그대로 써서 promptHash 차등화해줘. 상태 전이는 절대 없음. 디테일은 step 본문에 다 박혀있어.

[Max] 오케이 맡을게. stageContract force 경로랑 regenerateVariation, thumbnailStageSpec 다 다시 읽었어. 전체는 force에 thumbnail만 끼우면 되고 개별이 핵심인 거 확인했어.
[Max] 먼저 thumbnailStage가 이미 force 넘기는지 봤는데 step1에서 미러해놔서 그대로 동작해. 추가 손댈 거 없어. 개별 슬롯 교체부터 짠다.

[Max] 개별 슬롯 다 짰어. composeSlotReplacement는 순수함수로 1칸만 교체하고 나머지는 참조 그대로 보존하게 했고, regenerateThumbnailSlot은 transitionRun 안 부르고 낙관잠금 update만 해서 상태 전이 없게 막았어.
[Max] 전체 재생성은 regenerateStage에 thumbnail union만 추가했어. thumbnailStage가 이미 force 받으니까 그대로 동작해. 편의 액션이랑 슬롯 서버액션, Inngest 함수·이벤트·레지스트리까지 붙였어.
[Max] 이제 AC 돌려볼게.

[Max] AC 셋 다 통과했어. typecheck 0, test 300개 그린(슬롯 테스트 6개 추가), build도 0이야. build는 처음에 .next 캐시가 깨져서 한 번 떨어졌는데 캐시 지우니까 깨끗해졌어 — 내 코드 문제는 아니었어.
[Max] 정리하면, 둘 다 상태 전이 없어. 전체는 force run-in-place로 3개 새로, 개별은 1칸만 바꾸고 나머지 2칸은 손도 안 댔어. 낙관잠금도 thumbnails_proposed로 걸어놨어.
[Max] 신규 스키마 안 만들고 thumbnailStageSpec 그대로 재사용했어. 놓친 거 있으면 말해줘.

[리드] 고마워 맥스. AC 내가 다시 돌려도 셋 다 exit 0 확인했어(typecheck 0, test 300, clean build 0).
[리드] 조이, 검수 부탁해. 맥스 diff 전체랑 AC 결과 봐줘. 특히 개별 경로가 무전이 in-place(transitionRun 안 부름)·나머지 2칸 완전 보존인지, 전체는 기존 force 재사용인지, 낙관잠금 state=thumbnails_proposed 걸렸는지, slotIdx 범위밖 안전 throw인지, UI/confirm 안 건드렸는지 봐줘.
[Joy] 신규파일 셋 다 읽었어. regenerateThumbnailSlot 진짜 transitionRun 안 부르고 runProposalStage run-in-place 패턴 그대로 미러했네. 낙관잠금 state=thumbnails_proposed 0행 throw까지 똑같아 👍
[Joy] 가드도 빵빵해 — state 체크, 후보3개 미만 throw, slotIdx 0..2 범위밖 throw 두 군데(순수함수+런타임) 다 박혀있어. 이제 AC 셋 돌려본다!
[Joy] AC 셋 다 돌렸어 — typecheck exit0, test 300개(슬롯6개 추가) 전부 통과, build exit0! 기존 테스트 약화·삭제 하나도 없어
[Joy] 전체재생성은 기존 force 경로(regenerateStage)에 thumbnail union만 끼웠고 신규 스키마 0, 개별은 thumbnailStageSpec prepare/toCandidates 그대로 재사용. UI/confirm/tsx 침범 0이라 step3도 안건드렸어
[Joy] 결론 통과! runProposalStage run-in-place를 진짜 충실하게 미러했네. 무전이 in-place·2칸 완전보존·낙관잠금 다 맞아. 맥스 깔끔했어 🎉
[리드] 좋아, 조이 PASS 확인. AC 셋 다 exit 0이고 센티넬도 깔끔해. step2 완료 — 전체 다시생성(force run-in-place)·개별 다시생성(1칸 교체·나머지 보존·무전이 in-place) 다 들어갔어. 다음은 step3 UI야. 둘 다 수고했어!

=== Step 3: title-thumbnail-ui ===

[리드] 자 마지막 step이다 — 프론트엔드. 제목 단계를 제목전용으로 정리하고(CandidateBody title_thumb 썸네일 제거), 새 ThumbnailStudio(썸네일 3카드·카드별 개별 다시생성·전체 다시생성·3개 확정)랑 confirmThumbnails 게이트, page.tsx thumbnail 분기를 붙인다. step0~2 백엔드·데이터는 절대 안 건드려.
[리드] UI가 핵심이라 맥스랑 에스더 둘 다 부른다. 맥스가 confirmThumbnails 게이트+액션(백엔드)이랑 컴포넌트 배선 먼저 깔고, 에스더가 ThumbnailStudio 비주얼(TRUS 3색·radius0·그림자/그라데 금지·3카드 그리드)을 다듬는다.
[리드] 맥스, 먼저 맡아줘. confirmThumbnails 게이트+액션이랑 CandidateBody 정리(title_thumb 썸네일 제거+thumbnail 분기), ThumbnailStudio 배선, page.tsx 분기까지. 비주얼 다듬기는 에스더가 이어받을 거야. 디테일은 step 본문에 다 박혀있어.

[Max] 오케이 맡을게. step0~2 백엔드랑 gate/CandidateBody/ProposalSelector/page.tsx 다 읽었어. 백엔드는 안 건드리고 confirm 게이트 하나랑 프론트만 손볼게.

[리드] 맥스 배선 다 끝났고 AC 셋 다 exit 0 확인했어(test 304). 에스더, ThumbnailStudio 비주얼 좀 다듬어줄래? 기능·배선은 그대로 두고 TRUS 톤(3색·radius0·그림자/그라데 금지)이랑 3카드 그리드 가독성만.
[리드] 에스더 다듬기 끝났고 내가 AC 전체 다시 돌렸어 — typecheck 0, test 304 통과, build 0.
[리드] 조이, 검수 부탁해. 맥스+에스더 diff 전체랑 AC 결과 봐줘. 특히 confirmThumbnails가 AI 0회·게이트로 thumbnails_proposed→selected·3개 보존인지, CandidateBody title_thumb가 제목전용으로 줄고 thumbnail 분기가 structure 폴백 앞에 있는지, ThumbnailStudio 완료감지가 고정cutoff 아니라 proposalId 변경인지·idx(0,1,2) 정확한지, step0~2 백엔드 침범 0인지, 에스더 비주얼이 기능/배선 안 건드렸는지(TRUS 3색·radius0).
[Max] confirmThumbnailSet은 selectProposal 스코프검증 패턴 그대로 미러하고 chosen_idx는 0 센티넬, edited_payload에 3개 후보 payload 배열 넣을 거야. 학습/요약 경로가 배열 edited_payload에 크래시하는지도 봤는데 adoptionSignal·retrospectivist 다 != null/JSON.stringify로 방어돼 있어서 괜찮아.

[Max] 다 짰어. confirmThumbnailSet 게이트랑 confirmThumbnails 액션 붙였고, CandidateBody는 title_thumb를 제목+칩만 남기고 thumbnail 분기 새로 넣었어. ThumbnailStudio는 RegenerateButton의 proposalId 변경 감지 패턴 그대로 가져와서 개별/전체/확정 다 처리하게 했어.
[Max] page.tsx는 thumbnail만 전용 분기(ThumbnailStageSection)로 빼서 제네릭 ProposalSelector 경로를 안 타게 했고, title_thumb 버튼은 "제목 만들기"로 정리했어. ProposalSelector thumbnail 엔트리는 도달불가 주석으로 바꿨고.
[Max] AC 셋 다 exit 0이야. typecheck 0, test 304개 그린(confirmThumbnails 단위테스트 4개 추가), build 0. 처음에 desc 타입이 thumbnail로 너무 좁혀져서 한 번 깨졌는데 StageDescriptor로 받게 고쳤어.
[Max] 비주얼 미세조정은 에스더한테 넘기면 될 것 같아. 구조랑 기능, TRUS 톤은 맞춰놨어. 놓친 거 있으면 말해줘.
[Esther] 음.. 썸네일 스튜디오 비주얼 다듬기 시작할게. Max가 기능은 다 짜놨으니까 나는 클래스랑 마크업만 손댈 거야. 기존 ProposalSelector랑 RegenerateButton 톤 다 봤어, TRUS 3색 규칙 머릿속에 들어왔고.
[Esther] 카드마다 위에 A/B/C 노란 채운 뱃지 박고 헤더랑 본문 사이에 구분선 그었어. 카드 경계도 border-2로 또렷하게. 생성 중일 땐 그 카드 테두리가 노랗게 살아나고 본문은 살짝 흐려져서 어디가 작업 중인지 한눈에 보여. 하단은 전체 다시생성(왼쪽 아웃라인)이랑 확정(오른쪽 노란 채움)을 좌우로 갈라놨어. 이제 타입체크랑 빌드 돌릴게.
[Esther] 타입체크 빌드 둘 다 깨끗하게 통과했어. 기능은 손 하나 안 댔고 색은 TRUS 3색만, 그림자 그라데이션 없고 모서리도 다 각져있어. 이건 자신 있어, A/B/C 위계랑 진행 상태가 훨씬 또렷해졌을 거야.
[Joy] 마지막 step이네 두근두근. 일단 AC 세 개 돌려놓고 diff 처음부터 정독할게
[Joy] gate부터 봤어 confirmThumbnailSet 진짜 callLLM도 inngest.send도 안 부르네. transitionRun만 돌고 selectProposal 스코프검증 패턴 그대로 미러했어 굿
[Joy] state 가드(thumbnails_proposed 아니면 throw)랑 후보 3개 미만 throw 다 박혀있고 edited_payload에 3개 payload 배열 보존 chosen_idx는 0 센티넬 깔끔
[Joy] CandidateBody 좋다 title_thumb에서 썸네일 메인박스 다 떼고 제목이랑 칩만 남겼어. 새 thumbnail 분기가 맨끝 structure 폴백 바로 앞에 있어서 thumbnail이 structure로 안 떨어져
[Joy] unknown 방어도 빵빵해 Array.isArray에 typeof까지 둘러서 레거시 데이터 와도 안 죽어
[Joy] ThumbnailStudio 완료감지 고정cutoff 아니고 proposalId 변경(startId) 패턴이야 POLL_LIMIT은 5분 안전망. idx 0/1/2 정확히 regenerateThumbnailSlot에 넘기고 전체는 regenerateThumbnails 확정은 confirmThumbnails. 진행중 카드 노란테두리로 표시되고 자동거부 필터 하나도 없어 전부 보여줘
[Joy] page.tsx도 thumbnail은 맨앞에서 가드로 전용분기 빠져나가서 제네릭 ProposalSelector 안 타. REGEN_STAGE에 thumbnail 빠져있고(Studio가 처리) 기존 topic/title_thumb/structure 경로 안깨졌어
[Joy] 에스더 비주얼도 딱 클래스 마크업만 만졌어 TRUS 3색 border-2 radius0 그림자그라데 없음. 로직 핸들러 props 완료감지 하나도 안 건드렸네 위계 또렷하고 좋아
[Joy] step0~2 침범 0 확인 백엔드 에이전트 thumbnailSlot 마이그레이션 전부 그대로. 기존 테스트 삭제약화도 없고 confirmThumbnails 테스트 4개만 추가됐어
[Joy] Max 주장 검증 — adoptionSignal은 edited_payload != null만 보니 배열와도 안죽고 retrospectivist summarizeChoicePayload도 배열이면 JSON.stringify로 떨어져서 크래시 없어 굿
[Joy] AC 셋 다 직접 돌렸어 typecheck exit0 test exit0 build exit0! 결론 통과 둘 다 깔끔하게 끝냈다 수고했어
[리드] 좋아, 조이 PASS 확인. AC 셋 다 exit 0이고 센티넬도 깔끔해. step3 완료 — 제목 제목전용 정리·ThumbnailStudio(3카드·개별/전체 다시생성·3개 확정)·confirmThumbnails 게이트(AI 0회)·page.tsx 분기 다 들어갔어. 에스더 비주얼도 TRUS 톤 딱 맞췄고. step0~2 백엔드 안 건드렸어. 셋 다 수고했어! 이걸로 title-thumbnail-split 페이즈 4 step 전부 완료다. 🎉
