
=== Step 0: onboarder-multi-ref ===
[리드] 자 시작하자. 이번엔 쏙이 레퍼런스를 1개에서 3개로 늘리는 백엔드 작업이야. 순수 수집·입력·프롬프트만 손대고 저장이랑 UI는 다음 step. 맥스가 맡아줘.
[Max] 알겠어. spec이랑 prepare/schema/기존 테스트 다 읽었어. gatherExternalSignals랑 rankExternalByMultiplier 시그니처도 확인했고. step.ts는 input 통째로 넘기기만 해서 shape 바뀌어도 typecheck 안 깨질 것 같아.
[Max] TDD로 갈게. 테스트부터 고치고 prepare 다중화, schema 타입이랑 SYSTEM 복수 문구 순으로.
[Max] schema 타입 references[] 로 바꿨고 SYSTEM은 복수 문구로만 손봤어. money-safety랑 듀얼훅 규칙은 그대로 뒀어.
[Max] prepare는 pickTopReferences(상위3)로 바꾸고 점진완화 넣었어. a는 FLOOR_SUBS 제거, b는 viewCount 필터 제거까진 재검색 없이 재랭킹만, c만 검색어 완화해서 재검색. quota 아끼려고. topic 있는데 0개면 throw로 막았고.
[Max] 이제 기존 onboardingTranscript 테스트를 새 shape로 마이그레이션할게. referenceTitle 단일 → references[0] 로.
[Max] 신규 테스트 onboarderMultiRef 만들었어. 상위3 순서, viewCount null 후순위, 2개뿐이면 2개, 완화 c 재검색, 0개 throw까지 커버했어.
[Max] typecheck 돌리다 references[0] undefined 가능이라 non-null 단언 넣었고. 테스트에서 하나 잡혔는데, 완화 c에서 원검색이랑 재검색 결과 합칠 때 같은 url이 중복으로 들어가더라. dedup 넣어서 고쳤어. 실제로도 같은 영상이 양쪽 검색에 잡힐 수 있으니 맞는 픽스 같아.
[Max] AC 3개 다 통과. typecheck 0, test 1115개 전부 통과(1114→1115), build도 성공. 저장이랑 UI는 안 건드렸고 step.ts도 그대로 통과해. 놓친 거 있으면 말해줘.
[리드] 나도 AC 직접 돌려봤어. typecheck 0, test 1115 pass, build 0. 조이, 검수 좀 부탁해. 특히 0개면 throw(폴백 금지)랑 재사용 지켰는지 봐줘.
[Joy] 오 맥스 왔다 갔다 빠르네~ 나 git diff부터 정독하고 AC 직접 다 돌렸어. 결과부터 말하면 typecheck 0, test 1115 전부 통과, build 0! 깔끔하다 🎉
[Joy] 핵심인 0개면 throw 확실히 지켜졌어. topic 있는데 최종 refs 0개면 온보딩 불가로 throw하고, topic-only로 몰래 진행하는 폴백 경로 아예 없더라. videoId 하나도 못 뽑아서 references 비어도 거기서 또 throw로 이중방어까지 해놨네 굿굿 👍
[Joy] 점진 완화도 예쁘게 됐어. a는 FLOOR_SUBS 하한만 풀어서 재랭킹, b는 viewCount 필터 풀어서 재랭킹, 둘 다 재검색 없이 quota 아끼고 c만 relaxQuery로 재검색. 각 단계 3개 채우면 바로 return해서 중단하는 것도 확인. rankExternalByMultiplier 재사용하고 재구현 안 한 것도 좋아.
[Joy] 빈 topic이면 gather 시도 0회로 바로 references:[] 반환하는 것도 그대로 살아있고, 자막이랑 개별 수집 실패는 try/catch로 잘 삼키고 최종 0개 판정만 throw로 올려. best-effort 원칙 딱 맞아.
[Joy] SYSTEM은 단일→복수 문구만 바뀌고 money-safety(unverifiedNumbers)·듀얼훅·클리프행어·난이도 규칙 다 그대로야. 마이그 0, 의존성 0, onboarding.ts·page.tsx·step.ts 전부 무변경. 불변식 완벽해.
[Joy] 테스트도 알맹이 있어. 상위3 순서·null 후순위·2개면2개·완화 c 재검색어 검증·0개 throw까지 실체로 커버했고, 통과만 하는 껍데기 아냐. step.ts input.references랑 topicRun의 SeedRunInput.references는 우연히 이름만 같은 딴 거라 shape 충돌도 없어. 통과! 수고했어 맥스 🩷
[리드] 좋아, PASS. step0 완료로 기록하고 index.json 갱신했어. 저장(payload)이랑 필수시청 UI는 step1/step2에서 이어가자. 다들 수고했어.
