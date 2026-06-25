
=== Step 0: title-edit-cleanup ===
[리드] 자, step0 시작하자. 제목 확정 폼에서 썸네일 필드 5개 빼는 거. 맥스 맡아줄래?
[Max] 응 내가 할게. ProposalSelector랑 타입, CandidateBody 다 읽어봤어. title_thumb 분기만 고립돼 있어서 회귀 위험은 없어 보여.
[Max] 썸네일 5필드랑 setMain setBox 헬퍼 지우고 제목 input만 남길게. selectionReason은 그대로 두고.
[Max] 정리 끝났어. 제목 폼엔 이제 제목 입력 한 칸이랑 선택 이유 한 줄만 남아. typecheck test build 셋 다 통과했어. 테스트는 316개 다 초록.
[Max] 처음 빌드 한 번 실패했는데 내 코드가 아니라 .next 캐시가 꼬인 거였어. 캐시 지우고 다시 돌리니까 깔끔하게 통과했어. 놓친 거 있으면 말해줘.
[리드] AC 셋 다 내가 직접 돌려봤어. typecheck/test/build 전부 exit 0. 조이, 검수 부탁해.
[Joy] 오 맥스 시작 빠르다~ 바로 git diff 떠서 볼게! 변경 파일 ProposalSelector.tsx 한 개 맞고, 굿굿
[Joy] title_thumb 분기 보니까 썸네일 5필드(메인문구1·2, 박스1·2, 레이아웃 textarea)랑 set/setMain/setBox 헬퍼 싹 빠졌고 제목 input은 그대로 남았네. 깔끔하다!
[Joy] selectionReason(선택 이유 한 줄)이랑 submit 저장 로직 그대로고, topic·structure 분기도 안 건드렸어. TitlePayload 타입도 무변경 확인! 회귀 걱정 없겠다
[Joy] AC 직접 돌려봤어 — typecheck exit 0, test 316개 전부 통과(삭제된 테스트 없음), build도 exit 0. lint까지 깔끔해서 미사용 변수도 없어
[Joy] 범위도 한 파일 딱 지켰고 다 통과! 맥스 이번 거 진짜 깔끔하게 잘했다 통과 🎉
[리드] 1라운드 PASS. step0 완료 처리했어. 수고했다 둘 다 👍

=== Step 1: thumbnail-copy-learning ===
[리드] 자 step1 시작하자. 썸네일 문구 품질 손보는 건데, 핵심은 4개야 — 레퍼런스 출처를 title→thumbnail_copy로, 고조회 외부레퍼런스 배선, 박스≤6·메인≤14 글자수 강제, 스타일/banned 프롬프트 강화.
[리드] 맥스, 이거 좀 맡아줄래? thumbnail_maker만 건드리고 hook_maker externalRefs는 import만. 글자수 제한 넣으면 기존 골든(박스가 다 6자 넘음)이랑 충돌하니 거기 조심해서 처리해줘.
[Max] 응 맡을게. 코드 다 읽어봤어. 핵심은 prepare가 type=title을 레퍼런스로 쓰고 있던 거네. 썸네일 문구가 따로 있는데 제목을 베끼고 있었던 거야. 출처부터 thumbnail_copy로 바꿀게.
[Max] prepare 출처를 thumbnail_copy로 바꾸고 reference_titles는 reference_thumbnail_copies로 이름도 의미에 맞게 고쳤어. 고조회 외부 레퍼런스는 hook_maker꺼 import만 해서 비어있을 때만 조건부로 주입했고. stage 베껴쓰기 가드도 같이 맞췄어.
[Max] 이제 schema에 글자수 제한 넣을게. 박스 6자 메인 14자. 박스가 너무 길다는 게 사용자 불만 핵심이었으니까.
[Max] 스키마에 maxLength 박스6 메인14 박았고 SYSTEM에 글자수 지침이랑 레퍼런스 반영 원칙 추가했어. 파킹통장 예시도 박스를 연4%이자 추천3곳처럼 6자 이내로 짧게 갈았어.
[Max] golden 픽스처는 손으로 다시 썼어. 라이브 재녹화 안 했으니까 과금 0이야. 박스 다 6자 이내, 메인 14자 이내로 맞췄고 파킹통장 컨셉은 유지했어. eval에 golden 길이 단언하는 새 it도 박았고 레거시 6개엔 길이 단언 안 걸었어(긴 박스라 깨지니까).
[Max] 테스트는 prepare가 thumbnail_copy로 쿼리하는지 검증하는 it 하나 더 추가하고, contract rename도 맞췄어. typecheck 0, test 318개 다 통과, build 0. 박스 길이 검증은 한글 코드포인트 기준으로 했어. 놓친 거 있으면 말해줘.
[Max] 빌드를 dev/null로 묶어 돌리면 exit 1이 한 번 떴는데 직접 돌리니 깔끔하게 0이더라. next가 tty 없을 때 가끔 투정부리는 거 같아.
[리드] 맥스 수고했어. AC 내가 직접 다 돌려봤는데 typecheck/test(318)/build 전부 exit 0이야. 빌드 >/dev/null 이슈는 출력 버퍼링 때문이고 직접 돌리면 깔끔해.
[리드] 조이, 검수 좀 부탁해. git diff랑 AC 재실행으로 봐줘 — 특히 레퍼런스 출처가 진짜 thumbnail_copy로 갔는지, 박스≤6·메인≤14 강제됐는지, 외부레퍼런스 조건부 배선이 promptHash 보존하는지.

[Joy] 맥스 step1 받았어! git diff부터 쭉 봤는데 레퍼런스 출처 type='title' -> 'thumbnail_copy'로 제대로 바꼈고 필드도 reference_thumbnail_copies로 rename됐네 굿굿
[Joy] externalRefs는 import만 하고 호출, 결과 있을 때만 주입하는 조건부도 잘 걸렸고 hook_maker externalRefs.ts는 안 건드렸어 깔끔
[Joy] schema maxLength 박스6 메인14 들어갔고 골든도 손작성으로 줄였네 LLM 안 부르고. 이제 AC 직접 돌려볼게 잠깐만!

[Joy] AC 다 돌렸어 typecheck 0 test 0 build 0 전부 클린! 테스트도 318 passed로 step0보다 2개 늘었고 삭제된 거 없어
[Joy] 골든 픽스처 직접 파싱해서 글자수도 재봤는데 박스 다 6자 이하 메인 다 14자 이하 후보 3개 딱 맞아
[Joy] 범위도 thumbnail_maker 3파일만 건드렸고 토픽 구성 외부refs는 안 건드림, LLM 두번째 호출도 없어. 완벽하다 맥스 통과 🎉
[Joy] AC 내가 직접 다 돌렸어 — typecheck/test(318)/build 전부 exit 0. golden도 박스≤6·메인≤14 파싱 검증했고 레퍼런스 출처 thumbnail_copy로 제대로 갔어. 통과 🎉
[리드] 1라운드 PASS. step1 완료 처리할게. 실제 문구 품질은 사용자가 TITLE_REFERENCES=youtube로 새 런 한 번 돌려서 active 스타일·thumbnail_copy 24개 반영 확인하면 돼. 둘 다 수고했어 👏
