
=== Step 0: topic-sources-youtube-only ===
[리드] 맥스, 이번 step 맡아줘. 주제 선정 경로(topic_scout prepare + discovery cron)에서 웹 기사 신호만 끊는 거야. 댓글이랑 유튜브 경쟁영상은 그대로 두고, 리서치 단계 검색은 절대 건들지 마. 순수 백엔드라 에스더는 안 불러.
[Max] 코드 다 읽었어. prepare랑 discovery에서 webQueries 빼고, 외부 신호는 유튜브만 남기게 작업할게. 리서치 쪽은 안 건드려.
[Max] 다 됐어. prepare랑 discovery 둘 다 webQueries 비우고, 외부 신호는 유튜브 경쟁영상만 남겼어. discovery 후보 빌드는 순수 헬퍼(buildCompetitorCandidate)로 빼서 유튜브 only 필터를 테스트로 박았고. typecheck·테스트 884개·빌드 다 통과. 댓글 신호랑 리서치 쪽은 안 건드렸어. 놓친 거 있으면 말해줘.
[리드] AC 내가 직접 돌렸어 — typecheck exit 0, test 884개 exit 0, build exit 0. 조이, 검수 부탁해.
[Joy] 오 맥스 빠르다~ git diff 다 봤어! 일단 리서치 단계 파일은 안 건드린 거 같고, prepare/discovery/테스트만 깔끔하게 바뀌었네. 이제 본문 자세히 보고 pytest 아니지ㅋㅋ npm test 직접 돌려볼게!
[Joy] 코드 본문 다 읽었어. discovery에서 buildCompetitorCandidate 순수 헬퍼로 뺀 거 깔끔하고, source!==youtube면 null 방어까지 박아놨네. 굿굿! prepare도 web slice 빼고 rankExternalByMultiplier 그대로 재사용했고. 이제 typecheck/test/build 직접 돌린다!
[Joy] 다 통과! typecheck exit 0, test 884개 exit 0, build exit 0 내가 직접 다 확인했어. 리서치 단계 파일은 손도 안 댔고(diff에 research/search/fact 하나도 없음), 댓글 신호도 그대로, 유튜브 배수 랭킹도 import 재사용. 깔끔하다 진짜 🎉 딱 하나, prepare.ts 28번 줄 함수 주석에 "외부 검색(웹·YouTube)"가 옛날 그대로 남아있더라. 동작엔 영향 0이라 통과는 시키는데, 다음엔 docblock도 같이 갱신하면 완벽! 수고했어 맥스 👍
[리드] 좋아, PASS. step 0 완료로 닫는다. 조이가 짚은 docblock은 동작 무관 나노 지적이라 이번 범위 밖으로 두고 rules-proposals에 제안만 남겨둠. 다들 수고했어.

=== Step 1: topic-scout-youtube-system ===
[리드] 맥스, step1이야. 이번엔 코드가 아니라 촉이 시스템 프롬프트(TOPIC_SCOUT_SYSTEM) 재작성. step0이 입력에서 웹 기사를 끊었으니, 프롬프트에 박힌 웹 기사 전제(웹·기사·정책 트렌드·web: evidence)를 빼고 유튜브 영상+댓글 기준으로 맞춰줘. 댓글(kw:) 신호·overlap·audience_level·김짠부 정체성은 그대로 보존하고. external_items 필드명은 절대 바꾸지 마.
[Max] 스키마랑 prepare, externalSignals 다 읽었어. external_items는 이제 yt: 경쟁영상만이고 viewCount·구독자수 다 input에 실려서 LLM까지 들어가더라. 프롬프트에서 웹 전제 빼고 유튜브 영상+조회수·배수·반응 기준으로 갈아끼울게. 스키마는 evidence prefix 강제 안 하니 안 건드려.
[Max] 촉이 시스템 프롬프트 갈아끼웠어. 웹 기사 전제(웹·신규제도·정책트렌드·web:) 다 빼고, 입력을 댓글(kw:) 신호랑 유튜브 경쟁영상(yt:) 신호 둘로 명확히 나눴어. 핵심 기준은 지금 유튜브에서 조회수·반응 잘 나오는가, 구독자 대비 잘 터진 영상 각도 우선 반영으로 박았고. evidence 접두사에서 web: 뺐어. 스키마·external_items 필드명·audience_level 블록은 안 건드렸어. typecheck 0, test 884개 통과, build 0. 봐줘.
[리드] AC 내가 직접 돌렸어 — typecheck exit 0, test 884개 exit 0, build exit 0. git status도 schema.ts 하나만 변경, 군더더기 없음. 조이, 검수 부탁해.
[Joy] step1 diff 봤어. SYSTEM 상수만 깔끔하게 바뀌었고 schema.ts 한 파일뿐이야. web 웹 기사 정책 제도 grep 0건, evidence 접두사도 web 빠지고 kw yt focuskw tc만 남았어. 불변영역(LEVEL_DEFINITIONS appendLevelDirective SCHEMA TopicScoutInput)은 손도 안 댔네. 이제 AC 직접 돌린다!
[Joy] 다 통과 🎉 typecheck exit 0, test 884개 그대로 exit 0(테스트 삭제 약화 없음), build는 처음에 PageNotFoundError 떴는데 rules대로 rm -rf .next 하니 exit 0이라 코드랑 무관한 stale 캐시였어. 체크리스트 1~5 다 충족 — 웹전제 제거 완료, 유튜브 배수 기준(viewCount subscriberCount) 새로 박혔고, 댓글 kw overlap focus_keyword 정체성 제목아니라주제 다 보존, 불변영역도 안 건드림. schema.ts 한 파일만. 깔끔하다 맥스 수고했어 👍
[리드] PASS. step 1 완료로 닫는다. 촉이가 이제 유튜브 영상 기준으로 주제를 발굴해 — step0(입력)이랑 step1(프롬프트)이 정합 맞았네. 다들 수고했어.
