
=== Step 0: outline-format-field ===

[리드] P2 시작. 구다리 outline에 섹션별 형식(format) 신호 하나 추가하는 거야. 백엔드 한 레이어라 가볍게 가자.
[리드] 맥스, 이거 맡아줘. schema.ts에 optional format 넣고 SYSTEM에 지침 붙이고 structureFormat 테스트까지. 하위호환(required에 format 금지)이 핵심이야.
[Max] 시작할게. schema.ts랑 기존 테스트들 다 읽었어. structureExtractor 테스트가 스키마 형태를 어떻게 검증하는지 패턴 참고했고.
[Max] OutlineSection에 optional format 넣고, SCHEMA properties에 enum 추가, required엔 안 넣을게. 하위호환 핵심이니까.
[Max] 스키마·SYSTEM 다 손봤고 structureFormat 테스트 짰어. parseAndValidate로 통과/거부 검증, 하위호환(format 없는 케이스) 포함. 이제 AC 돌려볼게.
[Max] AC 다 통과했어. typecheck 0, 테스트 729개(기존 725 + 신규 4) 전부 그린, 빌드도 0. wiring·eval 회귀 없어.
[Max] prepare랑 scribe·UI는 안 건드렸고 fixture도 그대로 뒀어. 다음 라이브 런이 promptHash 바뀐 거 알아서 재기록할 거야.
[Max] index.json step0 completed로 갱신해놨어. 떠돌이 파일도 없는 거 확인했고. 놓친 거 있으면 말해줘.
[리드] 나도 AC 직접 돌려봤어. typecheck 0, test 729 통과 exit 0, build 0. 깨끗해.
[리드] 조이, 검수 부탁해. 특히 하위호환(required에 format 안 들어갔는지)이랑 wiring·eval 회귀 없는지 봐줘.
[Joy] 오 맥스 빠르다 나도 git diff 보고 AC 직접 다 돌려봤어
[Joy] required에 format 안 들어갔고 additionalProperties false도 그대로네 하위호환 핵심 굿굿
[Joy] enum table case explain 타입이랑 스키마 딱 맞고 SYSTEM에 억지 금지 확신없으면 explain 생략은 explain 다 들어가 있어
[Joy] structureFormat 4케이스 chart 거부도 ajv가 진짜로 막는거 확인했어 빈 테스트 아님
[Joy] typecheck 0 test 729 통과 exit 0 build 0 prepare scribe UI 안 건드렸고 떠돌이 파일도 없어 깨끗하다 통과
[리드] 1라운드 PASS. step0 완료. 다음은 step1 짠펜이 이 format 신호 받아서 실제 블록 emit하는 거야. 수고했어 둘 다.
