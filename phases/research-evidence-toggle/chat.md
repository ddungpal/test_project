
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
