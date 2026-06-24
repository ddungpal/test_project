
=== Step 0: hook-main-copy-semantics ===

[리드] 자, 이번 건 백엔드만이야. 훅이 프롬프트에서 썸네일 메인문구 2개가 '둘이 이어져야 말이 되는 반쪽'으로 나오는 걸 '각 줄 따로 봐도 완성형 메시지'가 되게 고치는 거. schema는 안 건드리고 HOOK_MAKER_SYSTEM 지시·예시 + 골든픽스처 main 배열만. UI는 step1이니까 손대지 마.
[리드] 맥스, 이 step 맡아줄래?
[Max] step0 hook-main-copy-semantics 시작. 스펙이랑 schema.ts, 골든픽스처 다 읽었어. 메인문구 2개가 반쪽으로 이어지는 거 막는 작업이지.
[Max] schema.ts에 완성형 규칙 한 줄 넣고 예시도 완성형으로 바꿨어. 픽스처는 후보0이랑 후보1 메인문구를 각 줄 따로 봐도 말 되게 손봤고. 후보2는 원래 괜찮아서 그대로 뒀어. 이제 typecheck/test/build 돌려볼게.
[Max] typecheck 0, test 237개 다 통과, build도 0. build가 처음엔 _not-found 모듈 못 찾는다고 빨갰는데 .next 캐시 꼬임이었어. 캐시 지우니 깔끔하게 통과. 스키마랑 형태는 안 건드렸고 메인문구 의미만 손봤어. 놓친 거 있으면 말해줘.
[리드] 나도 AC 직접 돌려봤어 — tc/test/build 전부 exit 0. 조이, 검수 부탁해.
[Joy] 오 맥스 빠르다 바로 git diff 떠봤어. schema.ts는 메인문구 완성형 규칙 한 줄 추가하고 예시 한 줄 교체한 게 전부네 깔끔하다
[Joy] 픽스처 후보0 통장에 돈 묵히면 손해 파킹통장이 정답입니다 둘 다 따로 봐도 말 되는 완성형이야 굿굿
[Joy] 스펙엔 후보0만 시켰는데 후보1 잠자는 비상금도 명사 반쪽이라 비상금 잠재우지 마세요로 손봤네 이건 타당한 보완 칭찬해
[Joy] rawJson JSON.parse 다시 해봤는데 이중인코딩 안 깨지고 candidates 3개 main 다 2개씩 그대로야
[Joy] typecheck exit 0 test 237개 전부 통과 eval parity 다 그린이야
[Joy] build 처음엔 auth/callback 모듈 못 찾는다고 깨졌는데 이거 .next 캐시 꼬임이라 캐시 지우고 다시 돌리니 exit 0 떴어 우리 변경이랑 무관
[Joy] 스키마 인터페이스 박스 색 톤 anti-dup 다 그대로고 테스트도 안 건드렸어 통과 처리할게 수고했어 맥스
[리드] 조이 PASS 확인. step0 completed로 마킹할게. 다들 수고했어 — 메인문구가 이제 한 줄만 봐도 후킹 성립한다.

=== Step 1: candidate-display-trim ===

[리드] 이번 건 프론트 표시만이야. title_thumb 후보 카드를 정리하는 거 — ① CandidateBody에서 '레이아웃:' 캡션 빼고 박스문구↔제목 사이 간격 띄워 구분 ② ProposalSelector에서 왜·근거칩·SourceLinks를 title_thumb일 때만 숨겨(topic·structure는 그대로 둬). thumbnail_layout 데이터/스키마는 절대 건드리지 말고 표시만 지워. TRUS 3색·radius 0·그림자 금지.
[리드] 에스더, UI 작업이니 네가 맡아줘. 작업하면서 chat.md에 한 줄씩 남겨줘.

[Esther] 음.. 시작 전에 파일 다 읽었어. title_thumb 카드만 손대는 거 확실히 챙길게. topic이랑 structure는 절대 안 건드려.
[Esther] 둘 다 고쳤어. 카드에서 레이아웃 캡션 빼고, 제목은 박스문구랑 한눈에 구분되게 위에 얇은 hairline 선 하나 넣고 mt-3로 띄웠어. 색은 white/10이라 은은하게 떨어져. title_thumb에선 왜/근거 칩/소스링크 다 숨겼고 topic이랑 structure는 그대로 다 보여. 이제 검증 돌려볼게.
[Esther] 다 통과했어. typecheck 0, test 237개 다 초록불, build도 깔끔하게 끝났어. 이건 자신 있어. 썸네일 카드가 이제 한결 깔끔하게 정리됐을 거야. Joy 검수 받을 준비 됐어!
[리드] 나도 AC 직접 돌렸어 — typecheck/test/build 전부 exit 0. 조이, 검수 부탁해.

[Joy] 오 에스더 작업 받았다~ 바로 git diff 떠서 두 파일 다 봤어. CandidateBody랑 ProposalSelector만 건드렸네 깔끔해 굿굿
[Joy] 레이아웃 캡션 블록 삭제됐고 layout 변수도 같이 정리됐어. 근데 중요한 거! thumbnail_layout 스키마랑 EditFields의 레이아웃 textarea는 그대로 살아있어. 표시만 뺀 거 맞네 완벽
[Joy] 박스문구랑 제목 사이에 mt-3 border-t 들어가서 한눈에 구분되고, ref 경고칩이랑 레거시 폴백도 그대로야. topic structure 카드는 왜 근거 출처 다 보이고 title_thumb만 숨겼어. 의도대로!
[Joy] 이제 typecheck test build 직접 돌려볼게 잠깐만~
[Joy] 다 돌았어! typecheck exit 0, 테스트 237개 전부 통과, build도 exit 0 깔끔하게 떴어. 테스트 삭제된 것도 없고 범위 밖 파일 안 건드렸어
[Joy] 에스더 이번 거 진짜 정확하게 했다~ 표시만 빼고 데이터는 다 보존, 딱 시킨 대로. 통과! 고생했어 🎉
[리드] 조이 PASS 확인. step1 completed로 마킹할게. title_thumb 카드 깔끔해졌다 — 다들 수고했어.
