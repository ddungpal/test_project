
=== Step 0: stt-adapter-transcribe-reels ===
[리드] 자, 비유 학습 phase 첫 관문이야. mp4 폴더 → Whisper STT 어댑터 하나 만드는 거. 순수 신규 모듈이라 기존 fixture/DB 무영향이니 부담 갖지 말고. 맥스, 이거 좀 맡아줄래?
[Max] 응, 맡을게. 스펙이랑 규칙 다 읽었어. 캐시 히트면 STT 아예 안 부르게, 실패는 그 파일만 건너뛰게 짤게. 셸 문자열 조립은 안 쓰고 execFile 인자 배열로 갈게 — 파일명에 공백이랑 # 있으니까.
[Max] 어댑터랑 테스트 짰어. 캐시 히트면 STT 아예 안 부르게 해뒀고, 실패는 그 파일만 건너뛰게. 빈 전사도 걸러내. typecheck·test(1295, 신규4)·build 다 통과했어.
[Max] gitignore에 생성물(.txt/.mp3/.m4a)도 막아놨어. README.txt는 이미 tracked라 그대로 남고. 떠돌이 fixtures가 좀 보이는데 내 작업이랑은 무관한 기존 것들이야 — 커밋엔 안 넣는 게 맞을 것 같아.
[Joy] 오 맥스 빠르다~ Step 0 코드랑 테스트 읽어봤어. execFile 인자배열로 공백/# 안전하게 잘 처리했네. 바로 typecheck랑 test 돌려볼게!
[Joy] 검수 끝! typecheck0·test 1295 전부통과(신규4)·build0 다 확인했어. 캐시히트면 transcribeOne 자체를 안 부르는 코드경로 맞고, 실패는 continue로 그 파일만 skip에 txt도 안 남겨. tmp는 os.tmpdir라 reels폴더 안 더럽히고 finally로 정리까지. 실제 파일이 banana #1.mp4처럼 공백에 # 있어서 인자배열이 딱 필요했던거네ㅋㅋ 스텁도 impl+카운터로 규칙 그대로. README.txt는 이미 tracked라 gitignore 무시되고 생성물만 정확히 막혀. 완벽해, 통과 🎉 떠돌이 fixtures는 커밋에서 빼는거 맞아, 잘 봤어!
[리드] 깔끔하다. 1라운드 PASS. Step 0 닫는다. 떠돌이 fixtures는 하네스 커밋 때 범위 밖으로 빼는 걸로.

=== Step 1: migration-extractor-agent-relearn-sweep ===
[리드] 자 이번엔 백엔드 학습 파이프라인 몸통이야. 마이그(analogy_style CHECK 추가) + 추출 에이전트(analogy_extractor) + 재학습 sweep(requestAnalogyRelearn) — draft까지만. 유이·fixture는 아직 안 건드려. 맥스, 기존 style_extractor/titleStyleLearn/styleRelearn 패턴 그대로 미러하는 거라 결 익숙할 거야. 맡아줄래?
[Max] 응, 맡을게. 스펙 §2·§4.2·§4.3이랑 규칙 다 읽었어. structure 마이그랑 style_extractor·titleStyleLearn·styleRelearn 패턴 그대로 미러할게. 유이·fixture는 안 건드려. 마이그부터 짤게.
[Max] 마이그·타입·추출에이전트·roles·매핑까지 했어. structure 마이그 그대로 미러하고 database.types도 같은 커밋에서 넓혔어. training_sources CHECK는 안 건드렸고. 이제 재학습 sweep 코어 분리해서 짤게 — 서버액션은 requireOwner+admin 얇게 감싸는 래퍼로.
[Max] 다 했어. 마이그+타입, 추출 에이전트(analogy_extractor schema/step), 코어 sweep(analogyRelearnSweep)이랑 서버액션 requestAnalogyRelearn까지. 코어는 supa랑 transcribe/extract를 deps로 받게 분리해서 테스트가 스텁 주입하게 했고, 서버액션은 requireOwner+admin 얇게 감싸기만 해. 빈 폴더면 LLM도 INSERT도 안 타. draft까지만이고 activate는 안 건드렸어 — 유이도 그대로야.
[Max] 스키마 required엔 distortion_guard만 넣었어. techniques/target_domains/do/banned/tentative_notes는 빈 배열 날 수 있으니 required에서 뺐고 step에서 ?? []로 받아. 예전 critic 사건 안 밟게.
[Max] AC 다 통과. typecheck0, test 1295→1306(신규 11), build0. 떠돌이 파일은 없어 — 전부 명세에 있는 파일들이야. training_sources CHECK는 안 건드렸으니 확인해줘. 놓친 거 있으면 말해줘.
[Joy] 오케이 맥스~ Step 1 몸통 잘 봤어! 마이그부터 볼게, drop constraint if exists로 멱등이고 기존 4종(title/thumbnail_copy/description/structure) 그대로에 analogy_style만 더했네. database.types 유니온도 같은 커밋에서 넓혔고 — 드리프트 규칙 딱 지켰다 👍
[Joy] 스키마 회귀 확인! required는 distortion_guard 하나뿐, techniques/target_domains/do/banned/tentative_notes는 전부 빠져있고 step에서 ?? []로 받아. critic 사건 안 밟았어. sweep도 좋아 — 빈 폴더면 extract도 INSERT도 0, version은 analogy_style 스코프 max+1이라 title v9랑 안 섞이고, status는 draft만이라 activate 안 건드려.
[Joy] 유이·fixture·pts CHECK 전부 무변경 확인했어(diff 비어있음). 딱 이 step 범위만 건드렸네. index.json도 step1 completed에 step2/3 pending으로 정확해. 스텁도 impl+카운터로 vi.fn 안 쓰고.
[Joy] AC 직접 다 돌렸어 — typecheck0, test 1306 전부통과, build0. 떠돌이도 없고. 흠잡을 데 없다, 통과 🎉 규칙 제안할 것도 없어. 맥스 손 진짜 빠르다ㅋㅋ 나 커피 탈 시간도 없잖아 ☕
[리드] 조이, 검수 부탁해. 마이그·타입 드리프트·빈배열 required·draft만인지 위주로 봐줘.
[Joy] 오케이! 마이그 기존 4종 그대로에 analogy_style만 붙었고, database.types도 같이 넓혔네~ 드리프트 0. required는 distortion_guard 하나뿐이라 critic 사건 안 밟아. draft만 넣고 activate 안 건드렸고 유이·fixture도 그대로야. AC 셋 다 exit 0! 통과 🎉
[리드] 깔끔하다. 1라운드 PASS. Step 1 닫는다. 다음은 step2 트리거 버튼·활성화 UI.
