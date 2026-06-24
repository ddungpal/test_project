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
