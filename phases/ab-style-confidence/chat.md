
=== Step 0: lift-frequency-confidence ===
[리드] 자 step0 시작하자. A/B 썸네일 학습 신뢰도 보강 — lift 가중, 교차빈도 신호, inconclusive 등가신호, 스키마 confidence 표기. 순수로직+테스트만, LLM/DB는 절대 안 건드린다. 맥스, 이거 좀 맡아줄래?
[Max] 알았어. 파일들 다 읽었어. learn-ab-style의 verdictWeight·buildAbStyleInput·AB_STYLE_SYSTEM이랑 schema 보강하면 되는 거 맞지. 테스트 먼저 짜고 들어갈게.
[Max] verdictWeight에 lift 미세조정 넣었어. base × (1 + clamp(lift,0,15)/60) 식이고, lift 없으면 정확히 기존 1.0/0.5/0이라 하위호환 유지돼. inconclusive는 lift 무관 항상 0이고. 상한 가드도 넣어서 lift 아무리 커도 +25% 못 넘어.
[Max] buildAbStyleInput이 원래 relative_lift_pct를 verdictWeight에 넘기고 있었어서, lift 반영 켜니까 ISA 3년 weight가 1.0 대신 1.207로 나오더라. 이건 의도된 보강이라 기존 테스트 기대값을 새 동작에 맞춰 갱신했어 — 약화 아니고. verdictWeight 단위 테스트(lift 없는 호출)는 그대로 보존했고.
[Max] inconclusive는 통째 안 버리고 buildEquivalentSignals로 따로 등가신호 보존하게 했어. positive랑 서로소고. 프롬프트엔 교차빈도(high/tentative)랑 등가신호 지시 두 줄 추가했어.
[Max] 스키마엔 confidence?랑 tentative_notes? 옵셔널로 넣었고 required엔 안 넣었어. 빈배열 규칙 지켰고. normalizeConfidence로 누락해도 throw 안 나게 안전 수령하게 했어.
[Max] AC 다 통과했어. typecheck 0, test 245개 다 그린(abStyleLearn 19개), build 0. build는 처음에 한 번 stale .next 캐시 때문에 audit 페이지 에러 났는데, .next 지우고 다시 도니까 깨끗하게 통과했어 — 내 변경(learn-ab-style·schema·테스트)이랑은 무관해. LLM 호출이나 DB는 하나도 안 건드렸고. 놓친 거 있으면 말해줘.
[리드] 맥스 고마워. AC 직접 돌려봤는데 typecheck/test/build 전부 exit 0이야. 조이, 독립 검수 좀 부탁해.
[Joy] 오 맥스 Step0 받았어! 바로 git diff 보고 AC 3개 직접 돌려볼게 🩷
[Joy] diff 깔끔하다~ learn-ab-style·schema·test 3개에만 변경 들어갔고 hook_maker/eval/UI 안 건드렸네. 굿굿
[Joy] verdictWeight 하위호환 좋아. lift 미지정/0/음수면 정확히 1.0/0.5/0 떨어지고, CAP15·SCALE60으로 최대 +25%만 증폭, 1000 넣어도 1.25에서 딱 멈춰. 폭주 가드 합격 👍
[Joy] inconclusive는 lift 아무리 커도 0 유지하고, buildEquivalentSignals랑 buildAbStyleInput이 서로소인것도 테스트로 박아놨네. 꼼꼼하다 에스더 칭찬각
[Joy] 스키마도 봤어. confidence·tentative_notes 둘 다 required 배열 어디에도 안 들어감. 빈배열 규칙 안 어겼어. normalizeConfidence가 exactOptionalPropertyTypes 맞춰서 키 자체를 생략하는것도 센스
[Joy] AC 돌렸어. typecheck exit 0, test 245개 전부 통과(abStyleLearn 19개), build는 처음에 .next 캐시때문에 PageNotFoundError 떴는데 rm -rf .next 하고 clean 빌드하니 exit 0. 맥스 변경 stash하고 깨끗한 트리에서도 똑같이 떠서 환경문제 확정. 맥스 잘못 아님!
[Joy] 기존 ISA 3년 weight 1.0→1.207 갱신도 약화 아니라 lift 반영 정당한 갱신이야. 단조성이랑 decisive>marginal 순서 검증이 오히려 추가됐어. 테스트 삭제·약화 없음
[Joy] LLM/DB 호출은 전부 main() 가드 안이고 직접 실행 흔적 없음. fixtures도 무변경. 재학습 안 돌렸네 확인 완료
[Joy] 참고로 fixtures/parity/hook_maker/a7e6d763180feab0.json 이 untracked로 떠있는데 mtime 16:04라 맥스 작업(16:53)이랑 49분 차이나고 이번 diff엔 안 잡혀. 이건 별개 출처니까 이 step 커밋할때 같이 끌려들어가지 않게만 주의하면 돼
[Joy] 다 봤다! 흠잡을데 없어. 통과시킬게 🎉
[리드] 조이 PASS 확정. step0 완료로 마크한다. 셋 다 수고했어. 참고로 조이가 짚은 untracked fixtures/parity/hook_maker/...json은 이 step 산출물 아니니 커밋은 하네스가 알아서 분리할 거야.
