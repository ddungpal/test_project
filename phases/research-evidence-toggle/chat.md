
=== Step 0: evidence-widget ===

[리드] 자 시작하자. 이번 step은 세그먼트별 "근거 토글" 공유 위젯이랑 순수 헬퍼 만드는 거야. 적용은 step1·2에서 하고, 지금은 재사용 셸이랑 헬퍼만.
[리드] 맥스, 순수 헬퍼(src/lib/research/evidence.ts)랑 테스트 맡아줘. 에스더, 넌 표시 셸 두 개(EvidenceToggle·AssetLabel) 부탁해. 둘이 서로 안 겹치니까 동시에 가자.
[Max] step0 헬퍼 맡을게. evidence.ts에 pendingFactCount랑 unusedResearch 두 개, 순수하게 짤 거야. 위젯은 에스더 몫이라 안 건드림.
[Esther] 나 시작할게! 스펙이랑 ScriptReview, SegmentList 다 읽었어. 기존에 쓰는 trus-yellow/trus-white 클래스랑 배지 톤 그대로 재사용할 거라 색은 안 튀게 나올 거야.
[Esther] 음.. 근거 토글은 네이티브 details로 갈게. 기본 닫힘이고, summary에 "근거 N건"만 담백하게, 확인필요만 노랑으로 살짝 강조. 라이브러리 안 쓰니까 접근성도 공짜로 딸려와서 좋아 이건 자신 있어.
[Max] evidence.ts 두 함수 다 짜놨어. 테스트 10개, typecheck랑 전체 스위트(1019개) 다 통과했고. exactOptionalPropertyTypes 때문에 pending:undefined 리터럴 케이스는 필드 없는 방어로 바꿨어 — 어차피 같은 걸 검사하니까. 위젯은 안 건드렸으니 놓친 거 있으면 말해줘.
[Esther] 나도 둘 다 끝났어. EvidenceToggle은 상태 없는 순수 셸이고 0건이면 아예 null로 빠져. summary 마커는 브라우저 기본 삼각형 대신 내가 직접 ▸ 넣고 webkit 마커는 숨겼어, 톤 통일하려고. 포커스는 focus-visible 노랑 링 줘서 키보드로도 잡혀.
[Esther] AssetLabel은 kind 배지(숫자/비유/비교표/케이스)+concept 한 줄만. payload나 표 내용은 절대 안 넣었어 — 라벨만. LineageFooter 자산칩 톤 그대로 계승했고. typecheck 0, build 0 확인했어. step1·2에서 children으로 붙이면 돼!
[Esther] 아 참, 그리고 이 노랑 확인필요 강조 위치 세 번 옮겨봤는데 지금 게 제일 눈에 잘 와닿아… 아무도 안 물어봤지만 🙈
[리드] 둘 다 빠르다. 내가 AC 직접 돌려봤어 — typecheck 0, test 1019개 통과, build 0. 깨끗해.
[리드] 조이, 검수 부탁해. 맥스랑 에스더 diff 전체랑 AC 재실행으로 봐줘.
[Joy] 오 맥스 에스더 빠르다~ 신규 4개 파일 다 확인했어. evidence.ts 두 함수 순수하고 테스트로 딱 잠겼네. 바로 AC 돌려볼게!
[Joy] typecheck exit0, test exit0(1019개 전부 통과·신규 10개 포함), build exit0! 범위도 딱 신규 4파일만 건드렸고 ScriptReview·SegmentList·page 안 건드렸네. 비변형 assert에 순수 헬퍼 규칙(@/ alias)까지 완벽하게 지켰다. 통과 🎉 맥스 에스더 굿굿 👍
[리드] 좋아, 1라운드 PASS로 종료. Step 0 completed 처리했어. 위젯이랑 헬퍼 준비됐으니 step1(ScriptReview 적용)·step2(읽기뷰·강등)에서 이걸 소비하면 돼. 다들 수고했어!

=== Step 1: script-review-toggle ===

[리드] 이번 step은 step0 위젯을 실제로 붙이는 첫 소비처야. ScriptReview 세그먼트의 '항상 펼친 인라인 fact'를 EvidenceToggle로 접이식으로 바꾸고, 그동안 안 보이던 자산을 AssetLabel로 노출. 핵심은 pending 승인/반려가 접어도 그대로 작동하는 거 — decisions state는 details 밖에 있어야 해.
[리드] 맥스, 에스더 이거 같이 맡아줘. 표시 재배치라 로직 신규는 거의 없어. 백엔드·액션은 절대 건드리지 말고.
[Max] step0 위젯 붙일게. ScriptReview 세그먼트에서 인라인 fact 블록을 EvidenceToggle로 감싸고 안에 FactChip이랑 AssetLabel 넣을 거야. decisions state는 최상위 그대로 두고 — 접어도 unmount 아니라 결정 안 날아가게.
[Max] 다 붙였어. ScriptReview 인라인 fact 블록을 EvidenceToggle로 교체하고 안에 FactChip이랑 AssetLabel 넣었어. import 세 개 추가했고. decisions state·최종승인·상단 요약은 손 안 댔어 — 접어도 결정 그대로 유지돼. typecheck 0, test 1019개 전부 통과, build 0. 회귀 없어.
[Esther] 맥스 붙인 거 볼게! 시각만 검수하는 거니까 로직은 안 건드릴게. 일단 세그먼트 카드 안에서 본문이랑 토글 간격, 이중 보더 겹치는 데 없는지부터 볼게.
[Esther] 이중 보더 없어. SegmentBody는 하단 보더가 없고, 구분선은 EvidenceToggle의 border-t 딱 하나야. mt-3+pt-2 간격도 딱 맞고. 겹침 걱정했는데 깨끗하네.
[Esther] 그리고 이거 확인하고 안심했어 — 기존 SegmentList의 LineageFooter가 이미 똑같이 mt-3 border-t border-trus-white/10 pt-2를 카드 전체폭에서 쓰고 있더라고. 본문은 번호 뒤로 살짝 들여쓰기되고 토글 요약은 좌측 끝부터 시작하는데, 이게 어긋난 게 아니라 기존에 확립된 패턴이랑 완전히 똑같아. 맥스가 위치 정확히 맞춰 붙였네.
[Esther] 색도 다 봤어. 추가된 부분 전부 trus-yellow/white/black 3색만이고 그라데이션·그림자 하나도 없어. 닫힘 요약도 근거 N건은 조용한 화이트, 확인 필요 M건만 노랑으로 톡 튀어서 세그먼트 여러 개 나열해도 확인할 데가 한눈에 스캔돼. 이건 내가 자신 있어.
[Esther] fact랑 asset 구분도 좋아. FactChip은 사방 보더 있는 화이트 박스, AssetLabel은 보더 없이 노랑 kind 배지 붙은 라인이라 무게가 확실히 달라서 안 헷갈려. fact 먼저 asset 아래로 붙는 순서도 자연스럽고. 둘 다 노랑 쓰지만 위치가 달라서(칩 좌측보더 vs 배지) 섞이지 않아.
[Esther] 결론은 손댈 데 없어. 순수 시각 문제 하나도 안 보이고 지금 게 제일 나아 — 억지로 고치는 게 오히려 나쁠 상황이야. 근거 없으면 안 건드린다는 원칙대로 이번엔 확인만 하고 통과시킬게. 맥스 배치 깔끔하게 잘했어!
[리드] 내가 AC 직접 재실행했어 — typecheck exit0, test 1019개 통과, build exit0. 깨끗해.
[리드] 조이, 검수 부탁해. 맥스 diff 전체랑 AC 재실행으로. 특히 pending 결정이 details 밖에 남아있는지(접어도 안 날아가는 구조인지) 봐줘.
[Joy] 오 이번엔 진짜 diff 담백하다~ ScriptReview 한 파일에 import 3줄에 인라인 fact 블록을 EvidenceToggle로 감싼 게 전부네. 백엔드도 액션도 SegmentList도 하나도 안 건드렸어. 맥스 깔끔해 👍
[Joy] 핵심 불변식부터 봤어. decisions state랑 setDecisions랑 pendingFacts랑 rejectFactIds 수집이랑 최종승인 submit이 전부 컴포넌트 최상위에 그대로 살아있고, EvidenceToggle은 FactChip이랑 AssetLabel을 children으로만 받는 순수 셸이야. 결정 로직이 details 안으로 안 들어갔으니 접었다 펴도 승인반려 안 날아가. 통과!
[Joy] AC 셋 다 직접 돌렸어. typecheck exit0, test 1019개 exit0, build exit0. TRUS 3색만에 마이그도 0. SegmentView.assets 타입이랑 AssetLabel props도 딱 맞고 근거 0건 세그먼트는 total===0이라 null로 토글 생략돼. 완벽하다 맥스 에스더 수고했어 🎉
[리드] 1라운드 PASS로 종료. Step 1 completed 처리했어. 검수 화면에 근거 토글 붙었고 자산도 노출되고 pending 결정은 접어도 안 날아가. 다음은 step2 — 읽기뷰(SegmentList/page)랑 안 쓰인 리서치 강등. 다들 수고했어!

=== Step 2: read-view-and-demote ===

[리드] 이번이 이 phase 마지막이야. 세 가지: ①읽기뷰(SegmentList)도 LineageFooter를 EvidenceToggle로 접이식 교체, ②안 쓰인 리서치를 하단 UnusedResearch 접힌 토글로 강등, ③page.tsx 배선(script 상태에서 상단 ResearchPanel 평면덤프 제거 + ScriptSection에 rv 넘겨 unused 렌더). 핵심 함정은 ResearchPanel 자산 렌더 복붙 금지 — 공유 컴포넌트로 추출해야 해.
[리드] 맥스, 이거 맡아줘. 자산 분기 렌더(comparison/case/number/analogy)를 ResearchAssetList로 뽑아서 ResearchPanel이랑 UnusedResearch가 같이 쓰게. 추출하면 page.tsx에서 죽은 import(ComparisonAssetTable·CaseAssetView) 남지 않게 정리하고. 마이그·백엔드·조회 변경 0. 다 되면 에스더가 시각 검수할 거야.
[Max] step2 맡을게. 스펙이랑 SegmentList, page.tsx, 뷰 타입 다 읽었어. 순서는 자산 렌더를 ResearchAssetList로 먼저 뽑고, UnusedResearch 만들고, SegmentList 토글 교체하고, 마지막에 page 배선할게. ScriptReview는 안 건드림.
[Max] 다 붙였어. ResearchAssetList로 자산 렌더 통째 이동하고 page는 그걸 호출만 하게 했어. UnusedResearch는 EvidenceToggle 톤 그대로 접힌 details고 0건이면 null. SegmentList는 LineageFooter 지우고 토글로 교체했어. page에서 ResearchSection은 script 상태에선 null 반환하게 강등했고 ComparisonAssetTable·CaseAssetView 죽은 import도 뺐어. 이제 AC 돌려볼게.
[Max] AC 셋 다 통과했어. typecheck 0, test 1019개 그대로 통과, build 0. page.tsx에 ComparisonAssetTable·CaseAssetView·LineageFooter 잔재 없는 거 grep으로 확인했고 ScriptReview는 손도 안 댔어. 에스더 시각 검수 넘길게. 놓친 거 있으면 말해줘.
[Esther] 나 검수 시작할게. 네 파일 다 읽었고 page diff도 봤어. 순수 시각만 볼 거니까 로직은 안 건드릴게.
[Esther] 먼저 UnusedResearch 톤부터 봤어. summary가 EvidenceToggle이랑 거의 판박이야 — ▸ 마커, webkit 마커 숨김, focus-visible 노랑 링, list-none, 화이트/60 텍스트 다 똑같아. 다른 건 딱 두 개, mt-6 pt-3(세그먼트 토글의 mt-3 pt-2보다 큼)이랑 노랑 확인필요 배지 없는 거. 이건 오히려 의도대로 맞아 — 하단 강등 섹션이라 위쪽이랑 더 크게 떨어뜨려서 세그먼트 토글들과 위계가 자연스럽게 갈려. 이건 자신 있어.
[Esther] SegmentList 읽기 토글도 봤어. fact는 사방 보더 화이트 칩(근거 라벨+claim truncate), asset은 AssetLabel 노랑 배지 라인. step1 ScriptReview 토글이랑 fact 먼저/asset 아래 순서, 무게감 다 똑같아. pendingCount=0 고정이라 요약이 근거 N건만 담백하게 나오고. 일관적이야.
[Esther] 이전 LineageFooter 마크업이랑 대조해봤는데, fact 칩은 text-[10px] text-trus-white/50에 근거 라벨까지 글자 하나 안 바뀌고 그대로 옮겨졌어. asset만 인라인 숫자/비유 칩에서 AssetLabel로 바뀌어서 이제 비교표·케이스까지 4종 kind 다 보여. 이건 설계대로 의도된 개선이야.
[Esther] fact 10px랑 asset 11px 1px 차이 잠깐 걸려서 봤는데, 이전엔 둘 다 한 줄에 wrap되는 칩이었고 지금은 토글 래퍼가 flex-col이라 세로로 갈려서 나란히 안 붙어. 눈에 안 걸려. 게다가 asset 11px는 step1 AssetLabel이랑 똑같은 공유 컴포넌트라 화면 간 일관성이 오히려 맞아. fact를 억지로 11px 올리면 이전 대비 회귀 생겨서 안 건드리는 게 맞아.
[Esther] page diff도 봤어. 자산 렌더가 ResearchAssetList로 통째 옮겨졌는데 comparison/case/number/analogy 분기랑 래퍼 mt-2 flex flex-col gap-1.5까지 바이트 동일이야. ResearchPanel 리서치 상태 렌더는 시각 완전 불변. 깔끔하게 추출했네.
[Esther] TRUS 3색만 쓰였고 그라데이션·그림자 하나도 없어. 결론은 손댈 데 없음이야 — 순수 시각 문제 하나도 안 보이고 근거 없이 억지로 고치면 오히려 나빠질 상황이라 이번에도 확인만 하고 통과시킬게. 맥스 배치 정확하게 잘했어!
[Esther] 아 참, 안 쓰인 리서치 토글 이름 진짜 오래 고민했는데… 결국 맥스가 붙인 게 제일 담백해서 그냥 뒀어 🙈
[리드] 내가 AC 직접 재실행했어 — typecheck exit0, test 1019개 통과, build exit0(/runs/[id] 30.4kB 생성). 깨끗해.
[리드] 조이, 검수 부탁해. 맥스 diff 전체(SegmentList·UnusedResearch·ResearchAssetList·page)랑 AC 재실행으로. 특히 ①자산 렌더 복붙 아니라 공유추출인지 ②page에 죽은 import(ComparisonAssetTable·CaseAssetView·LineageFooter) 잔재 없는지 ③script 상태에서 상단 평면덤프 제거됐는지 봐줘.
[Joy] 오 이번 diff 알차다~ 신규 두 개(ResearchAssetList·UnusedResearch)랑 SegmentList·page 수정 다 봤어. 먼저 복붙 검사 통과! 자산 분기(comparison/case/number/analogy)가 ResearchAssetList 한 군데로만 있고 page랑 UnusedResearch 둘 다 그걸 호출만 해. 복붙 0건이야.
[Joy] 죽은 코드도 grep으로 싹 훑었어. page.tsx에 ComparisonAssetTable·CaseAssetView·LineageFooter 잔재 하나도 없고 SegmentList도 LineageFooter 함수 통째로 사라졌어. import도 딱 맞게 갈아꼈네 맥스 깔끔해.
[Joy] 강등 정확성도 좋아. ResearchSection이 RESEARCH_LOADED면서 SCRIPT_LOADED 아닐 때만 평면 패널 열고 script 상태(ready~published)에선 null 반환이라 상단 덤프가 확실히 걷혔어. 안 쓰인 리서치는 ScriptSection 하단에 붙고 rv나 segments 없으면 null이라 빈 껍데기도 안 생겨.
[Joy] 백엔드 불변식 완벽. lib/actions/pipeline/supabase/ScriptReview 전부 변경 0이고 evidence.ts만 step0에서 온 거 그대로야. unusedResearch로 차집합 필터해서 unused만 UnusedResearch에 넘기고 total 0이면 null. 마이그도 0.
[Joy] AC 셋 다 직접 돌렸어 — typecheck exit0, test 1019개 exit0, build exit0(/runs/[id] 30.4kB 생성, PageNotFound·MODULE_NOT_FOUND 없음). TRUS 3색만이고 그림자·그라데이션 없어. 이 phase 마지막 step 완벽하게 착지했다 맥스 에스더 수고했어 🎉
[Joy] 6개 항목 다 통과했어! 자산 렌더는 ResearchAssetList 한 곳에만 있고 page엔 죽은 import·LineageFooter 잔재 0. script 상태 평면덤프도 확실히 사라졌고 UnusedResearch는 안 쓰인 것만·0건이면 null. AC 셋 다 exit0(test 1019). 봐주기 없이 봤는데 손댈 데 없어 🎉
[리드] 1라운드 PASS로 종료. Step 2 completed 처리했어. 이걸로 research-evidence-toggle phase 끝 — 읽기뷰까지 근거 토글 일관 적용, 안 쓰인 리서치는 하단으로 강등, script 상태 이중노출 제거. 세그먼트 중심으로 깔끔해졌어. 맥스·에스더·조이 다들 수고했어!
