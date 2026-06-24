
=== Step 0: candidate-thumbnail-text ===
[리드] 자, 이번 건 썸네일 캔버스를 라벨 텍스트로 바꾸는 표시 전용 작업이야. 백엔드·스키마는 손대지 말고 CandidateBody의 title_thumb 분기만 갈아끼우면 돼. 맥스, 에스더랑 같이 맡아줄래?

[Max] 시작할게. title_thumb 분기 그래픽 캔버스에서 라벨 텍스트 구조로 갈아끼우는 중이야. topic/structure는 안 건드려.

[Max] 다 했어. title_thumb 분기를 메인문구/박스문구1/박스문구2/제목 라벨 텍스트 세로스택으로 갈아끼웠어. 레거시 thumbnail_copy 폴백이랑 레이아웃 캡션, ref 경고 칩 다 살려뒀고. ThumbnailCanvas도 지웠어. 잔여 참조 0건.
[Max] typecheck·test(237개)·build 다 통과. build는 처음에 .next 캐시 꼬여서 한 번 헛돌았는데 클린빌드하니 그린이야. 코드 문제는 아니었어. 놓친 거 있으면 말해줘.

[리드] AC 직접 돌려봤어 — typecheck/test/grep 다 깨끗하고 클린빌드도 exit 0이야. 조이, 검수 좀 부탁해!
[Joy] 오 맥스 빠르다~ git diff 봤어. title_thumb만 깔끔하게 갈아끼웠네! 바로 typecheck랑 test 돌려볼게 🎉
[Joy] 결과 나왔어! typecheck exit 0, test 237개 다 그린, ThumbnailCanvas grep 0건이야. 레거시 thumbnail_copy 폴백이랑 레이아웃 캡션, ref 경고 칩 다 살아있고 백엔드/스키마/proposalTypes 변경 0건. 색도 검정노랑흰 3색만 쓰고 radius 0 잘 지켰네. 깔끔하다, 통과! 맥스 굿굿 👍

[리드] 좋아, 1라운드 PASS. step 0 완료 처리할게. 다들 수고했어 🎉
