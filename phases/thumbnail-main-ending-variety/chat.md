
=== Step 0: main-ending-contrast-rule-and-observability ===

[리드] 자, 썸네일 메인문구 두 개가 둘 다 '요'로 끝나면 어색하다는 이슈야. 순수헬퍼 하나 + stage.ts 로깅 한 줄 + 프롬프트 규칙 한 줄. 맥스, 맡아줄래?

[Max] 응, 맡을게. 명세랑 topicMissing.ts 미러 위치 확인했어. 테스트부터 짜고 헬퍼 붙일게.

[Max] 헬퍼(bothMainEndWithYo)랑 테스트 다 짰어. stage 로깅 한 줄, 프롬프트 어미대비 규칙 한 줄도 붙였고. 이제 AC 돌려볼게.

[Max] AC 셋 다 통과했어. typecheck 0, 테스트 1249개 다 초록, build도 깔끔. 로깅은 관측만이고 후보를 거부하거나 재생성하진 않아 — payload는 그대로야.
[Max] 한 가지 짚어둘게. git status에 fixtures/search/tavily랑 fixtures/youtube 떠돌이가 이번 작업이랑 무관하게 섞여 있어. 커밋 때 그건 빼야 해. 놓친 거 있으면 말해줘.
[Joy] 오 맥스 빠르다~ 나 바로 git diff 보고 검수 들어갈게!
[Joy] 헬퍼 mainEndings.ts 봤는데 순수하고 방어 빡세다. length !== 2 먼저 컷하고 every로 판정. 배열아님·null·숫자원소 다 막았네 굿굿
[Joy] stage.ts는 로깅 한 줄만 딱 추가됐어. payload 반환은 안 건드리고 그냥 console.warn만. 명세대로 강제거부 없음 확인!
[Joy] schema는 기존 어투 항목들 그대로 두고 어미대비 규칙 한 줄만 append했네. 존댓말 종결 규칙이랑 안 부딪혀 좋아
[Joy] 근데 git status에 fixtures/youtube랑 tavily json 떠돌이가 보이네... 이건 이 step 산출물 아닌데 커밋에 안 섞이게 확인해봐야겠다
[Joy] AC 다 직접 돌렸어! typecheck exit 0, npm test exit 0 (신규 thumbnailMainEndings 11개 다 초록·전체 1249 pass), build exit 0. 깔끔 🎉
[Joy] 명세 필수 5케이스 다 있고 중간요/3개/null/숫자원소까지 방어 케이스 보너스로 넣었네. 테스트 삭제·약화 없음 확인!
[Joy] schema 어미대비 규칙도 ~요 전면금지 아니고 둘 다 요는 금지라 존댓말 종결 규칙이랑 안 부딪혀. payload/스키마도 그대로. 통과야 굿굿 👍
[Joy] 참고로 fixtures/youtube랑 tavily json 떠돌이는 아직 untracked라 커밋 전 selective로 빼면 돼. 이건 rules.md에 이미 있는 그 footgun이니 맥스 알고 있을 거야~

[리드] 좋아, 1라운드 PASS. step0 completed 확정, phase도 완료. 수고했어 둘 다.
