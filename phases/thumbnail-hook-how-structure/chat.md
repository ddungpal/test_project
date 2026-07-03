
=== Step 0: hook-how-structure-and-strength-cap ===

[리드] 자 시작하자. 이번 건 코드 로직 안 건드리고 훅이 썸네일 시스템 프롬프트 문자열만 손보는 거야. R-C를 hook→how 골격으로 갈아끼우고, R-A 뒤에 강도 상한 한 줄 추가. 맥스, 맡아줄래?
[Max] 스펙이랑 schema.ts 봤어. R-C를 hook→how 골격으로 갈고, R-A 뒤에 강도 상한 한 줄 붙이고, 회귀 테스트 하나 만들면 되겠네. 코드 로직은 안 건드려.
[Max] R-C 교체, R-A 뒤에 강도 상한 추가, 테스트 파일 만들었어. 이제 typecheck/test/build 돌려본다.
[Max] 다 통과했어. typecheck 0, test 1252개 다 초록, build도 0. build가 처음에 /audit PageNotFoundError로 깨졌는데 그건 stale .next 캐시라 rm -rf .next 하고 다시 도니 멀쩡하더라. 코드 로직은 안 건드렸고 프롬프트 문자열 두 줄이랑 테스트 파일 하나가 전부야.
[Max] 참고로 fixtures/youtube랑 tavily json이 untracked로 떠돌이로 남아있어 — 내 작업물 아니고 예전 replay 부산물이니 커밋 땐 빼야 해. 놓친 거 있으면 말해줘.
[Joy] 오 맥스 빠르다~ 나 바로 git diff 봤는데 schema.ts 딱 2줄만 손댔네. R-C 한 줄 교체, 강도 상한 한 줄 추가. 깔끔한데 이제 하나씩 검증해볼게!
[Joy] 신규 테스트 봤는데 copyQuestionRegister랑 똑같은 스타일이고 단언 4개 다 있어. 코드 로직도 안 건드렸고 index.json도 completed로 잘 바꿨네. 이제 AC 돌린다!
[Joy] typecheck 0, test 1252개 전부 통과! 근데 build가 PageNotFoundError로 깨졌어. 근데 이거 rules.md에 나온 stale .next 캐시 증상이야. 코드는 프롬프트 문자열만 바꿨으니 무관할 듯. rm -rf .next 하고 다시 돌려볼게
[Joy] 오 stale 캐시 맞았어! rm -rf .next 하니까 build exit 0 깔끔하게 통과. 예시 줄도 그대로 있고 어미대비 규칙도 안 건드렸어. R-A 원문 보존, R-C는 hook→how로 제대로 교체됐고. 떠돌이 fixtures 두 개 보이는데 이번 커밋엔 안 딸려가게 조심하면 돼. 전부 통과, 완벽하다 맥스 🎉
[리드] 좋아, 1라운드 PASS로 마감. step0 completed, phase completed. 떠돌이 fixtures는 하네스 커밋 때 제외되게 그대로 둔다. 수고했어 둘 다.
