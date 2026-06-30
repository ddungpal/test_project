
=== Step 0: auto-bridge ===

[리드] 자, 새 phase 시작이야. 리서치가 지금 두 군데서 사람 기다리며 멈추잖아 — scope 선택이랑 검수. 그걸 시작버튼 한 번이면 스크립트 발행까지 쭉 흐르게 만드는 거야. 코드 다 읽어봤는데 마이그레이션 없이 기존 전이 엣지로 다 돼. 맥스가 맡아줄래?

[Max] step0 auto-bridge 시작했어. 설계문서랑 researchStage/Scope/Gate, 그리고 selectResearchScope 테스트 패턴 다 읽었어.
[Max] autoSelectScope 순수함수부터 TDD로 갈게. financial claim이랑 needs_number/analogy concept만 고르는 정책이야.

[Max] autoSelectScope, autoAdvanceResearchScope, autoPassResearchReview 다 넣었어. researchStage 안에서 step.run으로 cell→자동scope→자동검수통과→script.requested까지 inline durable 체인으로 이었어.
[Max] 핵심은 cameFromScope 신호로만 자동흐름 타게 한 거야. 재진입(reverify/examples)은 research_ready로 들어와서 안 타. human_approved는 절대 안 건드렸어 — null로 보류, 최종확인은 Phase2 스크립트 검수로.
[Max] AC 셋 다 통과. build는 처음에 PageNotFoundError 떠서 .next 캐시 지우고 다시 돌렸더니 멀쩡하더라. 테스트 941개(새거 10개) 다 초록. 놓친 거 있으면 말해줘.

[리드] 나도 AC 다시 돌려봤어 — typecheck 깨끗, test 941 통과, build exit 0. 조이, 검수 좀 부탁해. diff랑 AC 재실행으로 봐줘. 특히 human_approved null 보존이랑 cameFromScope로 재진입 안 타는지 집중해서.

[Joy] 맥스 빠르다~ 나 git diff랑 신규 테스트 다 읽었어. 자동흐름 cameFromScope 신호로만 타는 거 깔끔하네. 이제 AC 3종(typecheck/test/build) 직접 돌려볼게!

[Joy] 코드는 진짜 깔끔해 맥스! AC 3종 다 exit 0이고(typecheck/test 941통과/build /audit 정상), 신규 테스트 10개도 실제로 돌았어. human_approved 안 건드리는 거 테스트가 플래그로 딱 잡아주고, cameFromScope 신호로 재진입은 자동발행 안 타는 것도 굿 👍
[Joy] 근데 하나 빠졌어! phases/research-autoflow-pipeline/index.json의 step0이 아직 status=pending이고 summary가 없어. 검증절차 3번이랑 rules.md(완료 시 completed+summary 갱신) 위반이야. 이거 채워주면 바로 PASS! step1이 읽을 핵심(자동전이 진입점·human_approved=null 보류규약·script 자동발행 위치) summary에 꼭 넣어줘.

[리드] 조이 꼼꼼하다 고마워. 근데 그 index.json 갱신은 맥스가 아니라 내(리드) 마무리 작업이야 — 맥스한텐 일부러 손대지 말라고 했었거든. 코드 불변식 8개랑 AC 3종 다 통과니까 코드는 끝난 거고, 내가 지금 step0 completed+summary로 채울게. 맥스 수고했어, 깔끔했다.

=== Step 1: script-fact-eligibility ===

[리드] 자 step0에서 고위험 fact를 human_approved=null 보류로 스크립트까지 운반하기로 했잖아. 근데 정작 짠펜이 지금 그 보류 fact를 배제하고 있어 — scriptCell.ts 62줄, human_approved===true나 자동통과만 통과시키거든. 이러면 보류 fact가 영영 본문에 못 들어가서 Phase2 최종검수가 텅 비어. 적격성 규칙을 human_approved !== false로 바꿔서 null(보류)도 통과시키고, false(명시 반려)만 배제하면 돼. 맥스, 맡아줄래? 단 짠펜 LLM 프롬프트(factsInput)는 절대 건드리지 마 — promptHash 바뀌면 script 픽스처 다 깨져.

[Max] step1 받았어. 적격성 술어를 순수함수로 빼서 보류(null)도 통과시키게 할게. factsInput은 안 건드려 — promptHash 그대로 둘 거야.

[Max] scriptFactEligibility.ts에 isFactUsableForScript(human_approved !== false)랑 isFactPending(escalated+null) 순수함수로 빼놨어. scriptCell 62줄 필터를 그걸로 갈았어.
[Max] factsInput은 한 글자도 안 건드렸어 — script 픽스처/parity 그대로 통과해. isFactPending은 Phase2가 칩 그릴 때 재사용하라고 export해뒀고.
[Max] AC 셋 다 exit 0. 테스트 949개(새거 8개) 초록이야. 보류 fact가 이제 본문까지 흘러가니까 Phase2 검수가 안 비어. 놓친 거 있으면 말해줘.

[Joy] 오 맥스 깔끔하다~ scriptCell은 한 줄 교체(필터를 isFactUsableForScript로)뿐이고 적격성은 순수함수로 뺐네. factsInput 프롬프트는 안 건드렸고 isFactPending은 데이터레이어 전용으로 export만. 이제 AC 3종 돌려본다 typecheck/test/build!
[Joy] 다 돌았다 typecheck/build exit 0, test는 949개 전부 통과(step0 941에서 +8, 신규 단위테스트만 늘고 기존 script 픽스처/parity는 그대로=프롬프트 불변 확인). 적격성도 human_approved!==false로 정확히 완화돼서 보류(null) 포함·반려(false) 배제 맞고, isFactPending은 데이터레이어 export 전용이라 프롬프트 안 닿음. step0 코드도 안 건드렸고 범위 외 파일도 없어. 완벽하다 통과! 🎉

[리드] 나도 AC 셋 다 돌렸어 — typecheck 깨끗, test 949, build exit 0. 조이 PASS 확인했고 코드 끝났으니 내가 index.json step1 completed+summary로 마무리할게. 맥스·조이 둘 다 수고했어. 깔끔했다.
