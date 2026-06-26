
=== Step 0: run-thumbnail-correction ===

[리드] 자, step0 시작하자. 런 화면 ThumbnailStudio 후보 카드마다 '교정 학습' 패널을 붙이는 거야. 생성된 카피가 gen, 사용자가 입력한 게 ideal. 백엔드(saveCorrection·analyzeCorrectionDiff)는 그대로 재사용 — 손대지 마.
[리드] 맥스, 이 step 좀 맡아줄래? page.tsx에 topic 배선부터, 그다음 ThumbnailStudio에 교정 패널. 기존 재생성/확정 transition이랑 절대 섞지 말고 별도로 가자.

[Max] 알겠어. 관련 파일들 다 읽었어. page.tsx topic 배선, ThumbnailStudio 교정 패널, gen 추출 헬퍼 순서로 갈게.
[Max] gen 추출 헬퍼는 순수 파일로 따로 뺄게. 테스트 환경이 node라 use client 컴포넌트를 직접 import하면 위험해서. copyViewsParse 패턴 그대로.

[Max] page.tsx 배선 끝났어. StageSection → ThumbnailStageSection → ThumbnailStudio로 topic 내려보냈고, 폴백은 빈 문자열로 했어.
[Max] gen 추출 헬퍼랑 단위 테스트도 만들어놨어. 정상/배열아님/더티값/키누락 케이스 다 넣었어.
[Max] 이제 ThumbnailStudio에 교정 패널 붙일게. 기존 재생성 transition이랑 절대 안 섞고, 교정 전용 useTransition·busy·error를 카드 idx로 키잉해서 따로 둘 거야.

[Max] 다 됐어. ThumbnailStudio 카드마다 교정 패널 붙였고, 이상 메인2칸+박스2칸 입력받아서 saveCorrection→analyzeCorrectionDiff 돌리고 diff를 카드 안에 인라인으로 보여줘.
[Max] 교정 상태는 카드 idx로 키잉한 Record로 따로 관리해. 재생성/확정 transition이랑 안 섞었고 disabledAll에도 안 묶었어. 재생성 중에도 교정은 독립으로 돌아가.
[Max] 이상 입력 전부 빈칸이면 버튼 비활성이고, diff의 added/removed/actionable_rules는 빈배열이면 안 보이게 했어.
[Max] typecheck·test(509개)·build 다 통과. build는 처음에 PageNotFoundError 떴는데 stale .next 캐시였어. rm -rf .next 하니 깨끗하게 됐어. …캐시는 늘 한 박자 늦네.

[리드] AC 직접 돌려봤어. typecheck exit 0, test 509개 exit 0, build는 stale .next라 rm -rf .next 후 exit 0. 조이, 검수 좀 부탁해.
[Joy] 오 맥스 이번 것도 깔끔하다~ diff 다 읽었는데 시그니처 다 실제대로 맞췄네. 이제 typecheck/test/build 돌려볼게!
[Joy] 다 통과! typecheck 0, test 509개 다 초록불(신규 헬퍼 6케이스 포함), build는 처음에 PageNotFoundError 떴는데 rules대로 .next 캐시라 의심해서 지우고 다시 돌리니 깔끔하게 0 떴어. 교정 패널 transition도 재생성/확정이랑 잘 분리됐고 백엔드도 안 건드렸네. 시그니처도 다 실제대로 맞췄고. 굿굿 통과야 맥스 수고했어!

[리드] PASS 확정. step0 completed로 마크했어. 수고했어 둘 다 — 다음은 step1(/copy-learn 교정 입력 폼 제거→읽기전용)이야.
