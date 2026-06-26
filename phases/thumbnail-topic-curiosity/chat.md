
=== Step 0: topic-curiosity-system ===

[리드] 자, 시작하자. 김짠부 피드백을 썸네일 SYSTEM에 박는 작업이야. 메인문구에 영상 주제 키워드 그대로 넣기 + 호기심 갭 두 규칙. 맥스가 맡아줘.
[Max] schema.ts 봤어. THUMBNAIL_MAKER_SYSTEM 원칙 블록에 주제 키워드랑 호기심 갭 규칙 두 개 넣을게. 스키마는 안 건드려.
[Max] 원칙 블록에 ★주제 키워드 필수랑 ★호기심 갭 두 줄 넣었어. 스키마는 안 건드렸고. typecheck, test, build 셋 다 통과했어. 범위 외 fixture 새로 생긴 것도 없고. 놓친 거 있으면 말해줘.
[Joy] 오 맥스 빠르다 나 바로 git diff 보고 AC 돌려볼게
[Joy] diff 깔끔하네 schema.ts에 SYSTEM 원칙 두 줄만 추가했고 스키마 객체랑 prepare는 손도 안 댔어 굿굿
[Joy] 주제 키워드 필수 규칙이랑 호기심 갭 규칙 둘 다 명세 그대로 들어갔어 레버리지 ETF 예시까지 박혀있고 낚시 스포일러 금지도 챙겼네
[Joy] 어투도 존댓말 명령 유지하고 TRUS 3색 제약이랑 안 부딪혀 좋아
[Joy] typecheck exit 0 테스트 520개 전부 통과 빌드도 exit 0 테스트 하나도 안 지웠고 깔끔하다 통과 축하해 맥스
[리드] 굿 VERDICT PASS 확인했어. AC 나도 직접 돌려봤고 exit 0 일치. step 0 completed로 마킹한다. 둘 다 수고했어
