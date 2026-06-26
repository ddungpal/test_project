
=== Step 0: edit-actions ===

## Step 0: edit-actions — 확정 후 제목·썸네일 손편집 (백엔드 액션)

[리드] 자, step0 시작하자. 확정된 제목/썸네일을 상태 안 되돌리고 손으로 고치는 백엔드 경로 두 개 만드는 거야. gate에 editSelectedTitle/editSelectedThumbnails 추가, topicRun에 서버액션 2개, 테스트까지. transitionRun 호출 금지가 핵심이야 — 자기전이는 트리거가 거부하니까.
[리드] 맥스, 이거 네가 맡아줘. 순수 백엔드라 에스더는 이번엔 안 부를게.
[Max] 응 맡을게. gate랑 confirmThumbnailSet 패턴 다 봤어. selectedState에서만 동작하고 transitionRun은 안 건드리는 게 핵심이지. 그대로 미러해서 짜볼게.
[Max] gate에 editSelectedTitle/editSelectedThumbnails 넣었어. 둘 다 selectedState 검증하고 transitionRun은 안 부른다. 제목은 기존 chosen_idx 보존하고, 썸네일은 3개 아니면 throw. 이제 서버액션 두 개 미러할게.
[Max] 서버액션 editTitle/editThumbnails도 넣고 테스트 11개 짰어. auditLog에 stage_edited action만 하나 추가했고. typecheck, test 520개, build 다 통과. transitionRun은 어디서도 안 부른다 — 그게 핵심이었으니까. 놓친 거 있으면 말해줘.
[Max] 다 됐어. gate에 editSelectedTitle/editSelectedThumbnails 넣고, topicRun에 액션 두 개, 테스트 11개 붙였어. transitionRun은 절대 안 건드렸고. typecheck/test/build 다 통과.
[리드] 깔끔하네. 내가 AC 직접 돌려봤는데 셋 다 exit 0이야. 조이, 독립 검수 부탁해 — diff랑 AC 재실행해서.
[Joy] 맥스~ edit-actions step 받았어! git status부터 봤는데 코드 변경은 gate.ts, topicRun.ts, auditLog.ts 3개네. 신규 테스트 editSelected.test.ts도 있고. 바로 diff 읽고 AC 돌려볼게 🎉
[Joy] 코드 다 읽었어! gate.ts 새 함수 두개 transitionRun 안 부르는거 눈으로 확인했고, getSelectedStagePayload는 손도 안 댔네(최신 selection edited_payload 우선 읽기 계약 그대로). 테스트 11케이스도 알차다 굿굿 👍 이제 AC 돌린다~
[Joy] 다 통과! typecheck exit 0, test 520개 전부 초록불(editSelected 9케이스 포함), build도 exit 0 🎉 transitionRun 미호출·새 마이그레이션 0·selectedState 가드·썸네일 3개 가드·chosen_idx 보존/센티넬·selected_by=editedBy 전부 명세대로야. 타입도 TitlePayload/ThumbnailPayload 재사용. 깔끔하다 맥스~ 통과! 굿굿 👍
[Joy] 오 깔끔하다~ AC 셋 다 exit 0이고, transitionRun 안 건드린 거 본문에서 직접 확인했어. selectedState 검증, 길이3 가드, chosen_idx 보존까지 다 들어가 있네. 통과! 🎉
[Joy] 한 가지 소소한 거: summary에 11케이스라 적혔는데 실제론 9개야. 블로커 아니라 그냥 메모만.
[리드] 좋아, 9로 고쳤어. step0 PASS로 마감. 수고했어 둘 다!

=== Step 1: post-confirm-edit-ui ===

[리드] step1 가자. 이번엔 UI야. step0에서 만든 editTitle/editThumbnails 액션을 화면에서 부르는 거. 확정된 제목 표시부에 수정 버튼+인라인 입력, 확정된 썸네일 A/B/C 3카드 각각에 수정 버튼(main 2칸·boxes 2칸). 한 카드만 고쳐도 나머지 2개는 현재값 그대로 배열에 담아 보내야 해.
[리드] 맥스가 기능 구현하고, 에스더가 TRUS 톤(검정/노랑/흰색 3색·그림자/그라데이션 금지) 마감 봐줘. 교정 학습 패널이랑은 절대 섞지 말고 — 독립 transition/state로.
[Max] step1 시작할게. page.tsx의 selected 분기 두 군데랑 ProposalSelector EditFields, ThumbnailStudio 패턴 다 봤어. 확정 후 손편집 client 컴포넌트 두 개 새로 만들 거야.
[Max] 컴포넌트 두 개 만들고 page.tsx selected 분기에 배선했어. 썸네일은 한 카드만 고쳐도 extractGenCopy로 나머지 둘 현재값 떠서 3개 배열로 보내. layout도 보존했고. 이제 typecheck/test/build 돌려본다.
[Max] 다 됐어. typecheck/test(520개)/build 전부 exit 0. 새 서버액션 안 만들고 step0의 editTitle/editThumbnails만 썼고, transition 동반하는 selectProposal/confirmThumbnails는 안 건드렸어. 교정 패널이랑도 안 섞었고. …읽기전용이던 카드가 갑자기 고쳐지니 좀 신기하네. 검수 부탁해.

[Esther] 나 왔어~ step1 시각 마감 보러 들어왔어. 맥스가 만든 손편집 두 컴포넌트랑 page 배선 본다. TRUS 3색이랑 기존 ProposalSelector·ThumbnailStudio랑 톤 맞는지 꼼꼼히 볼게.

[Esther] 색이랑 그림자는 깨끗해. 검정노랑흰색만 쓰고 shadow gradient 하나도 없어. 위계도 좋아 주액션은 노란채움 보조는 테두리.
[Esther] 근데 포커스 링이 좀 아쉬워. 썸네일 스튜디오는 버튼 인풋 다 focus-visible 노란 아웃라인 줘있는데 이 두 신규는 그게 빠졌더라. 키보드로 탭 돌릴때 지금 어디 있는지 안 보여. 이건 접근성이라 꼭 맞춰줄게.
[Esther] 그리고 썸네일 편집 인풋들 라벨이 없어서 스크린리더가 뭔지 못 읽어. 교정패널처럼 sr-only 라벨 붙여줄게. 이건 내가 자신 있어.

[Esther] 다 고쳤어. 제목편집 썸네일편집 두 컴포넌트 버튼이랑 인풋 전부 썸네일 스튜디오랑 똑같은 노란 focus-visible 아웃라인으로 맞췄고, 썸네일 인풋엔 A안 메인문구 1 이런식 sr-only 라벨 다 붙였어. 인풋 클래스도 corrInputCls랑 동형으로 통일했고.
[Esther] 기능 로직은 손 하나도 안 댔어 className이랑 라벨 마크업만. typecheck build 둘 다 exit 0이야. 색 그림자 위계는 원래 깨끗했고 이제 키보드 스크린리더까지 일관돼. 끝!
[Esther] 아 그리고 이거 밤샌건 아닌데 focus 아웃라인 색 맞추느라 스튜디오 코드 다섯번 봤어... 아무도 안 물어봤지만 🙈
[리드] 둘 다 고마워. 내가 AC 셋 다 직접 돌렸어 — typecheck/test(520)/build 전부 exit 0. 조이, 독립 검수 부탁해. diff랑 AC 재실행으로.

[Joy] 맥스 에스더 둘 다 수고했어 step1 받았어! git status 보니 신규 컴포넌트 두개랑 page.tsx 배선이네. 바로 diff랑 신규파일 다 읽었고 이제 step0 액션 계약이랑 extractGenCopy 보존되는지 확인하러 간다

[Joy] 다 봤어! editTitle editThumbnails만 부르고 selectProposal selectTitles confirmThumbnails 같은 전이 동반 액션은 손도 안 댔어. un-confirm 버튼 없고 다운스트림 재생성 트리거도 없고 새 서버액션도 안 만들었어 굿굿
[Joy] 핵심 봤어 썸네일 한 카드만 고쳐도 submit에서 items.map으로 나머지 둘은 toThumbnailPayload(현재값)로 떠서 정확히 3개 배열 보내. extractGenCopy는 교정패널 순수함수를 import만 한거라 state transition 공유 아니고 독립 경로 맞아
[Joy] TRUS도 깨끗 검정노랑흰색만 쓰고 shadow gradient 임의hex 하나도 없어. 에스더가 focus-visible 노란 아웃라인이랑 sr-only 라벨 다 붙여서 접근성도 일관돼 좋다
[Joy] AC 셋 다 내가 직접 돌렸어 typecheck exit 0 test 520개 전부 초록불(테스트 삭제 약화 0, 47파일 그대로) build exit 0. 완벽하다 둘 다 통과! 🎉
[리드] 좋아, step1 PASS로 마감. 확정 후 제목·썸네일 손편집 UI 끝났다. 맥스·에스더·조이 다들 수고했어 — phase 완료다!
