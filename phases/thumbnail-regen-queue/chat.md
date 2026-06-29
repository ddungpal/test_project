# thumbnail-regen-queue — Step 0: regen-queue-core

[리드] 자, 새 phase 시작. 썸네일 A/B/C 슬롯별 재생성을 비차단 큐로 바꾸는 첫 단추야. step0은 순수 로직만 — "어느 슬롯이 재생성 완료됐나"를 payload 내용 비교로 판정하는 함수.
[리드] 맥스, 이거 맡아줄래? UI는 안 건드리고 thumbnailRegenQueue.ts + 테스트만.
[Max] 응 맡을게. 관련 파일들 다 읽었어. ThumbnailStudio는 읽기만 하고 안 건드릴게. 순수 모듈 하나랑 테스트만 만들면 돼서 깔끔하네.
[Max] candidateKey는 payload가 LLM JSON이라 키 순서가 흔들릴 수 있어서, 키 정렬 직렬화로 안정화할 생각이야. 중첩 객체/배열까지 재귀로.
[Max] 다 됐어. thumbnailRegenQueue.ts랑 테스트 만들어놨고, typecheck/test/build 셋 다 통과. 테스트는 12개 짰어.
[Max] 핵심은 완료 판정을 candidate id 말고 payload 내용 비교로 한 거야. id로 하면 보존 슬롯도 바뀐 것처럼 보여서 비차단이 깨지거든. 키 순서 뒤집힌 케이스도 테스트로 박아놨어. 놓친 거 있으면 말해줘.
[리드] AC 직접 돌려봤어 — typecheck/test/build 전부 exit 0. 조이, 검수 부탁해. git diff랑 AC 재실행으로 봐줘.
[Joy] 오 맥스 빠르다~ 신규 파일 2개 다 읽었어. 코어 순수해 보이고 주석도 친절하네 굿굿. 이제 AC 3개 직접 돌려본다!
[Joy] typecheck/test/build 다 exit 0! 645개 테스트 그린, 신규 12케이스도 싹 통과 🎉
[Joy] 핵심 봤어 - id 아니라 payload 내용으로 비교하고, 키 순서 뒤집힌 보존슬롯 false-positive 막는 테스트(42행) 실제로 있네. 정렬 직렬화도 재귀로 깔끔하고 clearSlots 불변까지 검증됨.
[Joy] step1 영역(ThumbnailStudio/서버액션/Inngest) 안 건드렸고 명세 외 파일도 안 섞였어. 깔끔하다 맥스~ 통과! 굿굿 👍
[Joy] 맥스 깔끔하다~ git diff 보고 AC 3개 다 직접 돌렸어. typecheck/test/build 전부 exit 0, 645개 그린 🎉 보존 슬롯 오판 방지 테스트도 제대로 있고 id 비교 안 했어. 통과!
[리드] 좋아, step0 완료. 순수 코어 완성됐으니 step1에서 ThumbnailStudio 배선하면 돼.
