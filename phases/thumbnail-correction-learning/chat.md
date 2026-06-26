
=== Step 0: corrections-store ===
[리드] 자, 교정 학습 첫 단추. 교정쌍(생성↔이상 카피) 저장만 하는 전용 테이블 thumbnail_corrections + 순수 매핑 buildCorrectionRow + saveCorrection 액션. 기존 copyLearn 패턴 그대로 미러하면 돼. 맥스, 맡아줄래?

[Max] 응 맡을게. 기존 copyLearn 패턴 다 읽었어. 먼저 buildCorrectionRow 테스트부터 쓰고 갈게.
[Max] 테이블이랑 매핑, 저장 액션까지 다 만들었어. FK는 일부러 안 걸었고 SQL에 이유 적어놨어. 이제 타입체크랑 테스트 돌려볼게.
[Max] 다 됐어. 타입체크, 테스트 474개, 빌드 전부 통과. diff랑 learned_at은 null로만 넣어놨고 step1/2에서 채우면 돼. 놓친 거 있으면 말해줘.
[Joy] 오 맥스 빠르다~ git status 봤어. 마이그레이션이랑 copyLearnMap 신규 잡혔네. diff 읽고 바로 AC 돌릴게!
[Joy] diff 다 봤어. FK 없는 독립 테이블 맞고 주석에 이유까지 적혀있네 굿굿. component_type CHECK·인덱스·learned_at·diff nullable 다 있다. 이제 AC 돌린다!
[Joy] AC 셋 다 초록불! typecheck exit0, test 474개 전부 통과, build exit0. payload 모양도 ab_variants랑 똑같이 맞췄네. 마지막으로 범위만 점검할게
[Joy] 검수 끝! UI/재학습 안 건드렸고 교정쌍을 엉뚱한 테이블에 넣지도 않았어. requireOwner→service-role 순서, 빈입력 throw, auditLog correction_saved까지 다 깔끔. 신규 fixtures 부산물도 없네. 통과야 맥스 굿굿 🎉
[리드] 깔끔하게 1라운드 PASS. step0 completed로 마감한다. 마이그레이션 20260626120024는 사용자가 Supabase에 직접 적용해야 런타임 동작하는 거 잊지 말고. 다음은 step1(차이 분석)이야.

=== Step 1: correction-diff ===
[리드] 자 step1. 교정쌍 1건의 생성↔이상 카피를 LLM이 비교해 구조화된 diff(요약·어투·후킹·길이·추가/삭제·교훈)를 만들고 thumbnail_corrections.diff에 저장하는 거야. 순수 백엔드라 에스더는 건너뛴다. 맥스, 맡아줄래? 핵심은 callLLM 규약 그대로($0 claude-p record), 빈배열 가능 필드는 schema required 제외, payload→텍스트는 순수함수로 분리, 학습(patterns)엔 절대 안 쓰기야.
[Max] 응 맡을게. callLLM 규약이랑 style_extractor 스키마 패턴 다 봤어. 스키마부터 짜고, 빈배열 3개는 required에서 뺄게. 순수 변환부터 테스트 쓰고 갈게.
[Max] 다 됐어. 스키마(빈배열 3개 required 제외), payload→텍스트 순수함수, analyzeCorrectionDiff 액션, correction_diff role(sonnet) 까지. diff는 thumbnail_corrections.diff에만 저장하고 patterns엔 안 건드렸어.
[Max] 테스트는 순수함수랑 스키마 형태만 — LLM 실호출이나 fixtures 쓰는 건 없어. typecheck 통과, test 487개(13개 추가), build는 .next 캐시 한번 비우니 초록불. /audit PageNotFoundError가 또 stale 캐시였네.
[Max] auditLog에 correction_analyzed 액션이랑 thumbnail_correction targetType 한 줄씩 추가했어. 놓친 거 있으면 말해줘.

[Joy] 오케이 맥스 step1 받았어! git diff부터 쭉 보는 중. 스키마랑 prepare.ts, copyLearn 액션 다 확인할게~
[Joy] 스키마 빈배열 규칙 굿 👍 required에 added/removed/actionable_rules 빠졌고 additionalProperties:false도 있네. style_extractor 미러 잘 따랐다!
[Joy] 액션도 깔끔. requireOwner 게이트 있고, diff는 thumbnail_corrections.diff에만 update하고 patterns엔 안 건드려. 학습 독립 지켜졌어. callLLM 패턴도 retrospectivist랑 똑같이 갔네.
[Joy] 이제 AC 돌려본다! typecheck → test → build 순서로 ☕

[Joy] typecheck exit 0, test 487개 다 통과(신규 correctionDiff 13개 포함), build도 exit 0! /audit 멀쩡하고 stale 캐시 이슈 없음 🎉
[Joy] fixtures/parity stray 부산물 없고, diff는 thumbnail_corrections.diff에만 쓰고 patterns/banned는 안 건드려. 학습 독립 깔끔.
[Joy] prepare.ts도 순수함수라 vitest가 DB 없이 잘 import하고, null/배열/더티값 다 안전처리. requireOwner 게이트도 있어. 완벽하다 맥스~ 통과! VERDICT PASS 🩷
[Joy] 검수 끝! 빈배열 3개 required 빠짐·additionalProperties false 굿, diff는 thumbnail_corrections.diff에만 쓰고 patterns엔 손 안 댔어. requireOwner도 첫줄에 있고. AC 셋 다 초록불, 487개 통과! fixtures stray도 없네. 통과야 맥스 🎉
[리드] 1라운드 PASS. step1 completed로 마감한다. 다음은 step2(correction-relearn-merge) — 교정쌍을 합성 A/B로 재학습 루프에 합류시키는 단계야.

=== Step 2: correction-relearn-merge ===
[리드] 자 step2 핵심이야. 교정쌍을 합성 A/B(이상=winner, 생성=loser)로 바꿔서 기존 재학습 루프(styleRelearnSweep)에 합류시키는 거. CTR 없고 사람판정이라 decisive 고정 가중(=single 경로 미러). 맥스, 맡아줄래? 네 가지: ①AbResultVideo.learn_mode에 "correction" 추가 ②buildAbStyleInput에 correction 경로(single 블록 미러·verdictWeight("decisive")=1.0·judgeComponent 안 탐) ③loadCorrectionResults 신규(payloadToVariantFields 재사용) ④styleRelearnSweep 합류+적격(미학습 교정 OR ab증가)+learned_at 스탬프. 멱등은 learned_at으로만 — provenance/pts CHECK 절대 손대지 마(과거 캐스케이드 함정). 순수 백엔드라 에스더 건너뛴다.

[Max] 응 맡을게. single 블록이랑 abLearnSource 로더 다 봤어. correction은 CTR 안 타니까 verdictWeight("decisive") 고정으로 single보다 더 단순하네. buildAbStyleInput 분기부터 테스트 쓰고 갈게.
[Max] learn_mode에 correction 추가하고, buildAbStyleInput에 correction 분기 넣었어. winner=이상·loser=생성, 가중은 1.0 고정. payloadToVariantFields는 abLearnSource에 export 한 줄만 풀어서 재사용했고, correctionLearnSource 새로 만들었어. 이제 styleRelearn 합류랑 learned_at 스탬프 갈게.
[Max] styleRelearn 다 붙였어. videos에 교정 합류, 적격은 ab증가 OR 미학습교정>0, draft·provenance 성공한 뒤 learned_at 스탬프. provenance/pts CHECK는 안 건드렸고 교정은 learned_at으로만 멱등이야.
[Max] 테스트는 두 파일로 나눴어. correction 순수경로/loadCorrectionResults는 fake supa로, sweep 적격·스탬프는 learnAbStylePatterns vi.mock으로 LLM 없이 돌렸어. typecheck 통과, 503개 다 통과. build만 돌리면 끝이야.
[Max] build가 처음엔 ./589.js MODULE_NOT_FOUND로 깨졌는데 또 stale 캐시였어. .next 비우고 다시 돌리니 초록불. AC 셋 다 통과야. provenance랑 pts CHECK는 손 안 댔고 멱등은 learned_at으로만. 교정 0건이면 sweep 완전 그대로라 회귀는 없을 거야. 놓친 거 있으면 말해줘.
[Max] …참고로 교정 winner가 winningRefs로 새는지 봤는데, 거긴 ab_variants is_winner만 보더라. 안 건드려도 알아서 분리되네.
[Joy] 오 맥스 또 빨라ㅋㅋ step2 검수 들어간다~ diff부터 직접 봤는데 correction 블록이 single 블록이랑 진짜 깔끔하게 동형이네. verdictWeight("decisive")=1.0 고정이고 CTR 안 타는 것도 코드로 확인했어 굿굿
[Joy] payloadToVariantFields export 한 줄만 풀어서 재사용한 거 좋다. 재구현 0이라 드리프트 걱정 없네. provenance도 ab_variants is_winner 기준이라 교정이 안 새는 거 맞고. 이제 AC 3개 직접 돌려볼게!
[Joy] AC 셋 다 초록불이다! typecheck exit 0, test 503개 전부 통과(기존 styleRelearn 7개도 그대로 살아있음), build도 첫판부터 exit 0이라 캐시 이슈도 없었어 🎉
[Joy] 체크리스트 다 봤는데 흠잡을 데가 없네. correction은 CTR 안 타고 decisive 1.0 고정, winner 없으면 warn+continue, 멱등은 learned_at으로만, provenance/pts CHECK는 손도 안 댔고. 교정 0건이면 sweep 완전 그대로라 회귀도 0. step0/1/3 영역도 사용만 하고 미수정, fixtures stray도 없어. 깔끔하다 맥스, 통과! 👍
[Joy] 검수 끝! correction 경로 decisive 1.0 고정·CTR 안 탐, 합류·적격확장·learned_at 스탬프 다 맞고 provenance/pts CHECK는 손 안 댔어. 교정 0건이면 sweep 완전 그대로라 회귀 0. AC 셋 다 초록불, 503개 통과! 통과야 맥스 🎉
[리드] 1라운드 PASS. step2 completed로 마감한다. 교정쌍이 이제 합성 A/B로 재학습 루프에 합류 — 루프 닫혔다. 다음은 step3(correction-ui)야.
