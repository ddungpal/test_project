
=== Step 0: recap-single-question-pager ===

[리드] 자, 완료화면 "내 풀이 다시 보기"를 한 문항씩 이전/다음으로 넘기게 바꾸는 작업이야. 맥스, 이거 좀 맡아줄래? 순수 헬퍼 clampRecapIndex 하나 추가하고 done 분기 UI만 손보면 돼.
[Max] spec이랑 recap.ts, 컴포넌트 done 분기 다 읽었어. clampRecapIndex부터 순수헬퍼로 넣을게.
[Max] 헬퍼랑 테스트 넣었어. 이제 컴포넌트 done 분기 나열을 단일 문항 페이저로 바꿀게.
[Max] 다 됐어. 나열이던 복습을 한 문항씩 넘기게 바꿨고, 이전/다음 버튼은 clampRecapIndex로 범위 밖 눌려도 안전해. typecheck·테스트(1238)·빌드 다 통과. 빌드는 처음에 copy-learn 못 찾는다고 깨졌는데 stale .next 캐시였어, 지우고 다시 도니까 초록. 놓친 거 있으면 말해줘.
[리드] 나도 AC 직접 돌려봤어 — typecheck 0, 테스트 1238 초록, 빌드는 stale .next 한번 지우니까 exit 0. 조이, 검수 좀 부탁해. UI는 기존 마크업 그대로 재사용한 페이저라 새 디자인 요소는 없어.
[Joy] 오 맥스 빠르다~ diff 봤어. clampRecapIndex는 recap.ts에 잘 들어갔고 컴포넌트는 재사용만 했네. 바로 AC 돌려볼게
[Joy] typecheck 0, test 1238개 전부 초록, build도 exit 0(캐시 문제 없이 6/6 페이지 생성). 단일 문항만 뜨고 이전/다음 경계 disabled에 aria까지 딱 맞아. 정오 표식이랑 3색도 그대로. 떠돌이 파일도 없고 깔끔하다, 통과 🎉
[리드] 좋아, 1라운드 PASS. step0 completed로 마감할게. 다들 수고했어 👏
