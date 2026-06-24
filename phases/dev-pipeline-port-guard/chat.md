
=== Step 0: preflight-core ===
[리드] 자 시작하자. dev 포트 밀림(3000→3001) 때문에 Inngest가 죽은 포트 때리는 그 버그, 런 돌리기 전에 잡아내는 순수 진단 함수부터 만든다. 맥스, 이거 좀 맡아줄래?
[Max] 응 내가 할게. rules랑 config.ts envStr 패턴, adoptionSignal 테스트 스타일 다 봤어. 순수함수 3개라 TDD로 테스트 먼저 깔고 갈게.
[Max] 테스트 8개랑 preflight.ts 다 짰어. process.env 안 건드리고 인자 env로만 읽게 했고, url-mismatch는 registered 비면 판정 생략해서 거짓양성 없게 했어. 이제 AC 돌려본다.
[Max] AC 다 통과. typecheck 0, 테스트 220개 전부 통과(내 8개 포함, 기존 것도 안 깨짐), build도 성공. 중간에 build가 한 번 /audit 못 찾는다고 죽었는데 stale한 .next 캐시 탓이었어. 캐시 지우고 클린 빌드 다시 돌리니 깨끗하게 통과했어. 놓친 거 있으면 말해줘.
[리드] 내가 AC 다시 돌려봤어 — typecheck 0, devPreflight 테스트 통과, 풀 테스트 220개 0, build 0. 조이, 독립 검수 좀 부탁해!
[Joy] 오 맥스 빠르다 step0 바로 들어왔네 내가 git status부터 보고 AC 직접 돌려볼게
[Joy] 신규 파일 2개 깔끔하게 분리됐고 preflight.ts엔 import도 process.env도 fetch도 하나도 없어 순수함수 그자체 굿굿
[Joy] typecheck exit0 vitest 14개 통과 build exit0 전체테스트도 220개 다 그린 기존거 하나도 안깨졌어
[Joy] 버그재현 url-mismatch도 있고 registered 빈배열 미발생도 있고 동시실패 2건도 커버됨 same-origin 혼재시 정상처리까지 꼼꼼하네
[Joy] 명세에 host 대소문자 무시는 테스트 케이스가 빠졌는데 new URL origin이 알아서 소문자화하니 동작은 맞아서 통과 막진 않을게 다음에 한줄 추가하면 더 완벽
[Joy] 통과야 깔끔하다 수고했어 맥스 다음 step1 가자 🎉
