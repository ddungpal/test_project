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

=== Step 1: regen-queue-wiring ===

[리드] 이제 진짜 배선이야. ThumbnailStudio의 단일 busy/startId 추적을 슬롯별 비차단 큐로 바꾸는 거. step0 순수함수(resolveCompletedSlots·clearSlots·candidateKey) 그대로 소비하고. 핵심은 한 슬롯 재생성 중에도 다른 슬롯 버튼이 안 막히는 거 — 그게 고치려는 버그야.
[리드] 맥스, 이거 맡아줘. 교정 패널 독립성이랑 백엔드(서버액션·Inngest)는 절대 건드리지 말고. UI만.
[Max] step1 맡을게. 관련 파일 다 읽었어. step0 순수함수(resolveCompletedSlots·clearSlots·candidateKey) 그대로 쓰고 새로 안 만들어.
[Max] 지금 단일 busy/startId 추적을 슬롯별 pending(idx→candidateKey 스냅샷)으로 바꿀 거야. confirmBusy는 따로 둬서 확정만 전체잠금. 교정 패널은 손 안 댈게.
[Max] 다 됐어. ThumbnailStudio를 슬롯별 비차단 큐로 바꿨어. 슬롯 입력/버튼은 confirmBusy나 그 슬롯이 pending일 때만 잠기고, 다른 카드는 계속 누를 수 있어. 전체재생성·확정·전체사유만 hasPending으로 같이 잠가놨고.
[Max] 완료 감지는 step0 resolveCompletedSlots(payload 내용 비교) 그대로 써서 바뀐 슬롯만 비워. id 비교 안 했어. 5분 안전 타임아웃도 hasPending 기준으로 유지했고. 교정 패널은 손 안 댔어 — 그대로 독립이야.
[Max] proposalId prop은 이제 안 쓰여서 props랑 호출부(page.tsx) 한 줄만 같이 정리했어. 백엔드는 안 건드렸고. typecheck/test(645 그린)/build 셋 다 exit 0. 봐줄래?

[Joy] 오 맥스 빠르다~ git diff 쫙 봤어. busy/startId 통째로 걷어내고 pending(슬롯idx→스냅샷) 큐로 바꿨네. 깔끔하다!
[Joy] 핵심 비차단 확인했어. slotDisabled가 confirmBusy || (idx in pending)이라서 한 칸 돌아도 다른 칸은 안 잠겨. 이게 고치려던 버그 맞지 굿굿
[Joy] 완료감지는 step0 resolveCompletedSlots(payload 내용 비교) 그대로 쓰고 candidate id로 안 봤어. 자체 재구현도 없고 좋아
[Joy] 교정 패널은 slotDisabled/disabledGlobal 어디에도 안 묶였어. 재생성 중에도 교정 가능, 독립성 보존 확인
[Joy] 5분 타임아웃(POLL_LIMIT_MS) 살아있고 백엔드(topicRun/inngest)는 아예 안 건드렸어. page.tsx는 proposalId prop 제거 정리뿐
[Joy] AC 직접 다 돌렸어 typecheck/test/build 전부 exit 0, 645개 테스트 통과, 테스트 삭제도 없어. 통과! 🎉
[리드] 좋아, step1 완료. ThumbnailStudio가 이제 슬롯별 비차단 큐로 도네 — A·B·C 연달아 눌러도 각자 갱신. phase 끝.
