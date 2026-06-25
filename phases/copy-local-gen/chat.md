
=== Step 0: skeleton-engine ===

## Step 0 — skeleton-engine (로컬 생성 엔진: 순수 + 테스트)
[리드] 자, copy-local-gen 첫 스텝 시작. 이건 순수 함수라 UI 없고 백엔드만이야. 맥스, localCopyGen.ts랑 테스트 좀 맡아줄래?

[Max] 어, 내가 맡을게. 스펙이랑 기존 stage.ts payload 구조 다 봤어. 슬롯 치환에 banned 필터, offset 회전까지 순수 함수로 만들면 되겠네.
[Max] 빈 슬롯 누출이 핵심인 것 같아. 치환 못한 슬롯 남으면 후보 통째로 버리는 가드 먼저 짜고 테스트부터 박을게.

[Max] 다 됐어. localCopyGen.ts랑 테스트 15개 박았고 typecheck/test/build 다 통과. 전체 384개 그대로 초록.
[Max] build 처음엔 supabase vendor-chunk 못 찾는다고 깨졌는데 코드랑 무관한 stale .next 캐시였어. rm -rf .next 하니까 깔끔하게 빌드되더라. 규칙에 있던 그 케이스 맞았어.
[Max] 썸네일은 main/boxes 한 줄이라도 슬롯 못 채우면 후보 통째로 버리게 했어. 부분만 깨진 채 나가는 게 제일 위험할 것 같아서. 놓친 거 있으면 말해줘. 조이 검수 받을게.
[리드] 맥스 빠르네. AC 3개 다 내 손으로도 돌려봤어 — typecheck/test/build 전부 exit 0. 조이, 독립 검수 부탁해.

[Joy] 오 맥스 빠르다~ 나 git status부터 봤는데 신규 두 파일만 딱 건드렸네. schema도 agent도 안 건드렸고 깔끔해 굿굿
[Joy] 순수성 grep 돌려봤어. Date random fetch supabase callLLM 전부 0건이고 주석 한 줄만 걸렸어ㅋㅋ 진짜 인자만 쓰네 통과
[Joy] 빈슬롯 누출 가드 마음에 들어. 인식 슬롯 치환하고도 남는 미인식 토큰까지 정규식으로 한번 더 잡아서 폐기하더라. 썸네일은 한 라인만 깨져도 통째로 버리고. 깨진 문구 샐 구멍 안 보여
[Joy] AC 셋 다 내 손으로 돌렸어 typecheck 0, test 0(localCopyGen 15개 + 전체 384개 그대로 초록), build도 0이야. stale next 이슈 없이 한방에 빌드됐어
[Joy] 테스트도 실제 출력값 toEqual로 박아놔서 가짜 아니고 진짜 검증하더라. 합격! 다음 스텝 가자 🎉
[Joy] 참고로 untracked에 record fixture 3개(hook_maker 2 topic_scout 1) 떠있는데 이 step 산출물 아니니까 나중에 커밋할 때 범위에서 빼면 돼. 검수엔 영향 없음!
[Joy] 체크리스트 8개 다 코드 근거로 확인했고 AC도 내가 다시 돌렸어 — typecheck/test/build 전부 exit 0! 1라운드 통과 🎉
[리드] 깔끔하게 통과. step 0 완료 처리한다. 다음은 step1 학습시 스켈레톤 방출.

=== Step 1: learn-emit-skeletons ===

[Max] step1 시작. 필독 파일 다 봤어. 핵심은 재학습 LLM 콜 출력에 skeletons만 옵셔널로 얹고, normalizeConfidence랑 똑같은 안전수령 스타일로 받는 거네. 추가 LLM 호출은 0이고.
[Max] localCopyGen에서 슬롯 화이트리스트랑 토큰추출 의미가 흩어지면 안 될 것 같아서, SLOT_KEYS를 거기서 export해서 normalizeSkeletons가 재사용하게 할게. 검증 의미 한 곳에 모으는 게 안전해.

[Max] 구현 얼추 끝났어. schema에 skeletons 옵셔널(required 제외, additionalProperties:false라 properties엔 등재), 프롬프트 두 개에 지시 한 줄씩, normalizeSkeletons 헬퍼 만들어서 normalizePatterns랑 loadReviewedArtifact 둘 다 spread로 합쳤어.
[Max] 슬롯 검증은 localCopyGen의 templateSlotsAllowed/extractAllowedSlots 재사용했어. 생성 시점에 폐기될 깨진 템플릿을 학습 시점에 미리 거르는 셈이라 의미가 딱 맞더라. 이제 테스트 박는다.

[Max] 다 됐어. AC 3개 다 통과 — typecheck 0, test 398 passed(신규 14개 포함) 0, build도 rm -rf .next 후 0이야. 이번에도 첫 빌드는 stale .next가 PageNotFoundError 뱉었는데 캐시 지우니 깔끔했어. 코드랑 무관한 그거 맞아.
[Max] 핵심은 추가 LLM 호출 0이라는 거. 기존 재학습 콜 출력 스키마만 넓혔고 normalizeSkeletons가 화이트리스트 밖 슬롯 다 걸러내. 무효는 throw 없이 키 생략하고. styleRelearn은 patterns를 jsonb로 그대로 저장해서 코드 안 건드렸고 테스트로 보존만 확인했어.
[Max] 제안 생성(hook_maker/thumbnail_maker) prepare랑 프롬프트는 손 안 댔어. forward 픽스처 불변이야. git status도 깨끗하고 범위 외 fixture 안 섞였어. 조이 검수 받을게. 놓친 거 있으면 말해줘.
[리드] 맥스 수고했어. AC 셋 다 내 손으로도 돌렸어 — typecheck 0, test 0(398 passed), build는 처음에 /auth/callback 데이터수집 에러로 깨졌는데 rm -rf .next 하니까 깔끔하게 exit 0. 규칙 그 케이스였어.
[리드] 조이, 독립 검수 부탁해. 핵심은 추가 LLM콜 0·옵셔널 안전수령·슬롯 화이트리스트·patterns.skeletons 저장 보존·forward 프롬프트 불변이야.

[Joy] step1 검수 시작! git diff 다 봤어 — 변경 4개 파일(localCopyGen export·schema 옵셔널·learn-ab-style normalizeSkeletons·테스트 +14)에 prepare/forward/maker는 아예 안 건드렸네. 일단 깔끔.
[Joy] callLLM 호출부 찾아봤는데 learn-ab-style 통틀어 딱 1곳(line368)뿐이야. 추가 LLM콜 0 확인! styleRelearn은 learned.patterns 그대로 jsonb insert라 normalize가 보존하면 저장도 보존되고. 이제 AC 돌린다~

[Joy] AC 셋 다 내 손으로 돌렸어 — typecheck exit 0, test exit 0(398 passed 신규14 포함), build도 stale .next 안 건드리고 첫 빌드에 바로 exit 0! 깔끔하다.
[Joy] 핵심도 다 확인했어. normalizeSkeletons가 normalizeConfidence랑 똑같이 throw 없이 키 생략하고, 슬롯 검증은 localCopyGen의 templateSlotsAllowed 재사용이라 fillLine 폐기 의미랑 딱 맞아. schema는 옵셔널·required 제외고. 테스트도 toEqual로 진짜 출력값 단언하지 가짜 아님.
[Joy] 기존 테스트 하나도 안 지웠고 +178줄 추가만 했어. 약화 없음. step1 통과! 맥스 이번에도 깔끔하게 잘했다 🎉
[리드] 조이 검수 통과(PASS), AC 셋 다 exit 0. step1 완료 처리한다. 다음은 step2 생성 배선(localCandidates 훅·COPY_GEN_MODE).

=== Step 2: local-gen-wiring ===

[리드] step2 시작. 이번엔 생성 배선이야 — 활성 스켈레톤 있으면 제목/썸네일 생성을 로컬로 채워서 callLLM 스킵($0), 없으면 기존 LLM 경로 바이트 그대로. 순수 백엔드라 UI는 step3로 미루고 맥스 단독 투입. 에스더는 이번 패스.
[리드] 맥스, 핵심은 세 가지야: ① runProposalStage에 로컬 단락 끼우되 하위호환 절대(스켈레톤 없거나 mode=llm이면 promptHash·픽스처 바이트 동일), ② 로컬 후보 payload는 toCandidates 재사용해서 동형 보장, ③ 제목/썸네일만. 맡아줄래?

[Max] step2 시작할게. 필독 파일 다 봤어 — stageContract, localCopyGen, styleProfile, 두 maker stage/prepare, style_extractor schema, _shared, 테스트 스텁 패턴까지. 핵심 그림 잡혔어.
[Max] 설계 그대로 갈게. decideLocalGen 순수헬퍼로 'callLLM 스킵' 결정을 못박고, 로컬 후보는 maker output 만들어서 그 spec의 toCandidates에 통과시켜 payload 동형 강제. 하위호환은 localCandidates가 null 반환하면 기존 forward 경로 바이트 그대로 타게 할게. TDD로 테스트 먼저 박는다.

[Max] step2 다 됐어. AC 3개 다 통과 — typecheck 0, test 434 passed(신규 36개 포함) 0, build는 또 첫 빌드에 /auth/callback PageNotFoundError 떴는데 rm -rf .next 하니까 깔끔하게 exit 0이야. 코드랑 무관한 stale 캐시 그거 맞아.
[Max] 핵심은 callLLM 스킵이라 거기에 테스트를 제일 단단히 박았어. decideLocalGen 순수헬퍼로 hybrid/llm/local × forceLlm × localCount 조합을 다 못박고, runProposalStage 통합테스트에선 callLLM을 스파이로 모킹해서 '로컬 후보 반환하면 callLLM 절대 미호출, null이면 폴백'을 직접 증명했어.
[Max] 하위호환은 localCandidates가 null 반환할 때 기존 forward 경로 바이트 그대로 타게 했어. mode=llm이나 forceLlm이면 로컬 훅 자체를 호출 안 하고, topic/structure/research/script은 localCandidates 미정의라 항상 LLM이야. promptHash·픽스처 불변.
[Max] 로컬 후보 payload는 두 maker의 toCandidates를 const로 빼서 그대로 재사용했어 — idx·ref_similarity·thumbnail_copy·style_conformance가 downstream이랑 정확히 일치하도록. 썸네일 레이아웃은 스켈레톤에 없어서 활성 스타일 첫 layout_archetype, 없으면 결정적 기본 문자열 썼고.
[Max] buildLocalGenContext는 순수·결정적으로 했어 — 첫 숫자+단위 정규식 추출, 흔한 타깃어 부분일치, keyword는 억지 추출 안 하고 생략. 못 뽑은 슬롯은 키 자체를 안 넣어서 exactOptional 지켰고 빈 슬롯 쓰는 후보는 step0가 폐기하니 안전해. forceLlm 계약은 스레딩만 했고 기본 undefined라 동작 불변(동작은 step3). 조이 검수 받을게. 놓친 거 있으면 말해줘.
[리드] 맥스 수고했어. AC 셋 다 내 손으로도 돌렸어 — typecheck exit 0, test exit 0(434 passed), build는 첫 빌드 /auth/callback PageNotFoundError라 rm -rf .next 후 exit 0. 규칙 그 케이스 맞아.
[리드] 조이, 독립 검수 부탁해. 핵심은 ① 로컬 후보 반환 시 callLLM 미호출($0)·② 하위호환(스켈레톤 없음/mode=llm/forceLlm이면 forward promptHash·픽스처 바이트 동일)·③ payload 동형(toCandidates 재사용)·④ 제목/썸네일만 적용·⑤ 상태전이 정상이야.

[Joy] step2 검수 들어간다~ 스펙이랑 principles 먼저 정독했어. 이제 git diff 통째로 뜯어볼게!
[Joy] stageContract 봤어. decideLocalGen 순수함수로 잘 떼놨고, decision=local이면 callLLM 진짜 안 부르는 코드경로 확인. cost=0 provider=local promptHash=local로 박고 insert/전이는 공유하네. 재생성 변주는 LLM 경로 안으로 들어가서 forward 픽스처 안 건드림. 굿 👍
[Joy] hook/thumbnail localCandidates 테스트 봤어. toCandidates 재사용해서 payload 동형(idx·title·ref_similarity / thumbnail_main·boxes·layout·thumbnail_copy파생·conformance) 다 단언했고, 스켈레톤 없으면 null로 LLM 폴백까지 못박았네. evidence_ids도 style.id가 style: 접두라 테스트랑 일치. 기존 테스트 안 지웠고. 자, 이제 AC 직접 돌려본다~
[Joy] AC 셋 다 직접 돌렸어 — typecheck exit 0, test 434개 전부 통과 exit 0, build exit 0! 🎉 localCandidates는 제목·썸네일 두 곳에만 붙었고(topic/structure/research/script은 안 건드림), 로컬 경로 callLLM 미호출·$0·insert/전이 공유 다 확인. 기존 테스트도 약화 없이 보존됐고 payload 동형도 toCandidates 재사용으로 완벽. 맥스 이번 거 진짜 깔끔하다 👏 통과!
[리드] 조이 PASS, AC 셋 다 exit 0(내 손으로도 재확인). step2 완료 처리한다. 이제 로컬 생성 배선은 끝 — 활성 스켈레톤만 있으면 제목/썸네일이 $0로 나가고, 없으면 기존 LLM 그대로. 마지막은 step3 UI(다시생성 로컬 vs 새로써줘 LLM).

=== Step 3: local-gen-ui ===

[리드] 마지막 스텝, UI야. 제목·썸네일 다시생성에 '다시 생성($0)'(로컬)·'LLM으로 새로 써줘'(forceLlm) 두 버튼 분기 + 후보 출처 배지(로컬/LLM). step0~2 계약은 손대지 마. 내가 코드 훑어보니 배선 끊긴 데가 명확해 — 서버액션 regenerateStage가 forceLlm을 안 보내고, hookStage/thumbnailStage inngest 함수도 event.data.forceLlm을 안 읽어. step2가 executeProposalStage까지만 forceLlm 받게 해놨으니 거기까지 연결만 하면 돼(전송 배선이지 생성로직 수정 아님).
[리드] 맥스가 전송 배선+컴포넌트+테스트 맡고, 에스더가 디자인(TRUS 3색·직각·무그림자) 검수·폴리시. 맥스, 먼저 시작해줘.

[Max] step3 시작할게. 필독 파일 다 봤어 — 배선 끊긴 데 두 군데 확인했어. 서버액션이 forceLlm 안 보내고 inngest 함수가 event.data.forceLlm 안 읽어. step2가 executeProposalStage까지 받게 해놨으니 거기까지만 이으면 돼.
[Max] 먼저 출처 판정을 candidateSource 순수함수로 빼서 단위테스트부터 박을게. evidence_ids에 skeleton 있으면 로컬, 없으면 LLM. 이게 배지 판단 근거니까 여기부터 단단히.

[Max] 배선 다 이었어. client.ts StageData에 forceLlm 추가, hookStage/thumbnailStage가 event.data.forceLlm 전달, regenerateStage/regenerateThumbnails에 forceLlm 인자 추가했어. 전부 조건부 spread라 exactOptional 깨질 일 없고, 안 넘기면 기존 페이로드랑 바이트 동일이야.
[Max] 이제 버튼 분기 들어간다. 제목부터 — 기존 '다시 생성'을 '다시 생성($0)'로 두고 옆에 'LLM으로 새로 써줘' 붙일게. 완료감지 로직은 둘이 공유.

[Max] step3 다 됐어. AC 3개 다 통과 — typecheck 0, test 441 passed(신규 candidateSource 7개 포함) 0, build도 이번엔 stale .next 없이 한방에 exit 0이야.
[리드] 맥스 빠르네. 에스더, UI step이니까 디자인 검수 부탁해 — 두 버튼 위계(로컬 기본/LLM 보조)랑 배지가 TRUS 3색·직각·무그림자 지키는지, 기존 버튼이랑 일관되는지 봐줘.
[Esther] 봤어. 버튼 위계는 깔끔해 — 로컬 노란외곽선(주), LLM 흰외곽선(보조)로 기존 확정=노란채움 언어랑 안 부딪혀. 근데 제목 카드에서 로컬 배지(노란채움)가 A/B/C 식별 뱃지랑 경고 칩보다 더 튀어서 위계가 뒤집혔더라. 출처는 메타정보인데 말이지. 배지를 노란외곽선으로 낮췄어.
[Esther] 한 줄만 고쳤고 typecheck·build 둘 다 exit 0. 기능·배선은 안 건드렸어(맥스 영역). 대비도 15:1이라 AA 충족. 끝!
[리드] 에스더 굿. AC 셋 다 내 손으로도 돌렸어 — typecheck 0, test 0(441 passed), build도 stale 없이 한방에 exit 0. 조이, 독립 검수 부탁해.
[Max] 버튼 분기는 제목·썸네일 둘 다 '다시 생성($0)'(로컬 우선)이랑 'LLM으로 새로 써줘'(forceLlm) 두 개로 나눴어. 완료감지는 기존 proposalId 변경 로직 그대로 공유하고, 슬롯('이 칸만')은 별도 경로라 안 건드렸어.
[Max] 출처 배지는 candidateSource 순수함수로 빼서 단위테스트 박았고, CandidateSourceBadge 작은 컴포넌트로 제목 후보랑 썸네일 카드 둘 다 붙였어. evidence_ids에 skeleton 있으면 로컬(노란 채움), 없으면 LLM(흰 외곽선). 부분일치 오판 안 하게 정확히 skeleton만 보고.
[Max] step0~2 계약은 안 건드렸어 — localCopyGen·runProposalStage·schema·maker 생성로직 그대로고, forceLlm은 전송 배선만 이었어. 선택작업이던 '다시 생성($0) 비활성 안내'는 page에 새 데이터 페치 필요해서 생략했어. 배지로 사후 표시되니 충분할 것 같아. 조이 검수 받을게. 놓친 거 있으면 말해줘.

[Esther] 음 나 디자인 패스 시작할게. 맥스가 만든 다시생성 두 갈래랑 출처 배지부터 다 정독했어.

[Esther] 두 갈래 버튼은 위계가 또렷해서 손 안 댔어. 노란 외곽선이 주($0), 흰 외곽선이 보조(LLM) — 기존 확정=노란채움 언어랑도 안 부딪히고 깔끔하더라.
[Esther] 다만 출처 배지 하나만 고쳤어. 로컬을 노란 채움으로 두니까 제목 후보 카드에서 아직 안 고른 A/B/C 뱃지보다 더 튀어서 위계가 뒤집히더라고. 메타정보가 식별표시를 압도하면 안 되잖아.
[Esther] 그래서 로컬도 노란 외곽선으로 바꿨어. 같은 카드 경고칩(레퍼런스 유사·A/B 패배)이랑 같은 언어가 돼서 통일감 생기고, 썸네일 카드에선 헤더 A/B/C 노란채움이랑 채움-외곽선으로 자연스레 갈려. 이건 자신 있어.

[Esther] typecheck도 build도 둘 다 exit 0 깨끗해. 디자인 패스 끝! 배지 하나만 만지고 나머지는 맥스가 위계 잘 잡아놔서 그대로 뒀어. 조이한테 넘길게.

[Joy] 오케이 step3 검수 들어간다! git diff부터 쭉 봤는데 forceLlm 배선 서버액션부터 inngest 함수까지 깔끔하게 이어졌네 굿굿
[Joy] candidateSource 부분일치 오판 테스트(skeletons, my-skeleton-x 같은거)까지 챙겨놨더라 꼼꼼해서 좋다 에스더 배지 노란외곽선 변경도 들어왔고
[Joy] 이제 typecheck test build 세개 내 손으로 돌려본다 잠깐만!

[Joy] typecheck 0, test 441개 전부 통과(0), build도 0! 라우트 다 정상이고 stale캐시 이슈도 없었어 코드는 진짜 깔끔하다 맥스 에스더 굿굿
[Joy] 근데 딱 하나! phases/copy-local-gen/index.json의 step3가 아직 pending이고 summary가 비어있어. 규칙에 step 완료하면 completed랑 summary로 갱신하라고 돼있거든 이것만 채워주면 완벽 마무리야
[리드] 조이 IMPROVE 받았는데 유일한 지적이 index.json 메타데이터야 — 코드·AC는 7개 체크포인트 다 통과(typecheck/test/build exit 0). 그건 룰 7대로 PASS 후 내가 채우는 마감작업이라 코드 결함 아니고. 내가 step3를 completed+summary로 갱신했어. 조이, 메타데이터만 한 번 더 확인해줘.
[Joy] 확인했어! step3 completed에 summary도 forceLlm 분기·출처 배지·전송 배선 다 담겼고 team_round도 박혔네. 규칙 충족이야. 코드·AC는 아까 다 초록이었으니 이제 진짜 끝! 맥스 에스더 수고했어 🎉
[리드] 좋아. 2라운드에서 메타데이터까지 정리 완료 — step3 PASS. copy-local-gen 페이즈 4스텝 전부 끝났다. 하이브리드 $0 생성: 재학습만 API, 제목/썸네일 생성·재생성은 활성 스켈레톤으로 로컬($0), 'LLM 새로 써줘'는 선택 폴백. 수고했어 다들 👏

[Joy] 라운드2 재검수 끝! index.json step3 completed에 team_round 2/3 PASS로 갱신됐고 summary도 forceLlm 분기·출처 배지·전송 배선 다 들어가서 의미있게 채워졌어 굿굿. JSON 파싱도 정상이고. AC 셋 다 내 손으로 다시 돌렸는데 typecheck 0, test 441 passed, build는 stale .next 없이 한방에 exit 0 깔끔하게 나왔어. 범위 외 fixtures 혼입도 없고. 라운드1 유일 지적이던 메타데이터까지 해결돼서 통과! 맥스 수고했어 🎉
