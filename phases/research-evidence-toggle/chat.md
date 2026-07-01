
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
