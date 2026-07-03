# Step 0: STT 어댑터 — mp4 폴더 → Whisper 트랜스크립트(캐시)

> 이 phase의 **입력 관문**. mp4를 텍스트로 바꿔야 이후 추출이 가능. 유이·DB·fixture 전부 **무영향**(순수 신규 모듈).

## 읽어야 할 파일

- `docs/specs/2026-07-03-analogy-learning-design.md` — §3 흐름, §4.1 STT 어댑터.
- `src/llm/backends/openai.ts`, `src/llm/config.ts` — OpenAI **API 키 해석 방식**(env 이름·읽는 법)을 여기서 그대로 재사용.
- `.claude/rules/rules.md`, `CLAUDE.md` — 시작 전 직접 읽을 것. 특히 "catch-swallow는 impl+카운터로 테스트" 규칙.

## 작업 — 신규 `src/lib/learning/transcribeReels.ts`

`learning/analogy-reels/` 폴더의 mp4를 Whisper로 전사하고 결과를 `<name>.txt`로 캐시한다.

```ts
export interface ReelTranscript { name: string; transcript: string; }

// 주입 가능한 STT impl(테스트에서 스텁·호출 카운트). 실제 구현은 defaultTranscribeOne.
export type TranscribeOne = (mp4Path: string) => Promise<string>;

export async function transcribeReels(
  dir: string,
  deps?: { transcribeOne?: TranscribeOne },
): Promise<ReelTranscript[]> { /* ... */ }
```

동작:
1. `dir`의 `*.mp4`를 **파일명 정렬**(결정성)로 나열. 파일명에 공백·`#`가 있으므로 경로를 그대로 인자로 넘김(셸 문자열 조립 금지 — `child_process.execFile`/`spawn` 인자 배열 사용).
2. 각 mp4에 대해 `<name>.txt`가 이미 있으면 **읽어서 재사용(STT 미호출·멱등·재과금 0)**. 없으면 `transcribeOne(mp4Path)` 호출 → `.txt` 기록.
3. `transcribeOne` 실패는 로그 후 **그 파일만 skip**(전체 sweep 안 죽임).
4. 반환: `{name, transcript}[]`(빈 transcript는 제외).

`defaultTranscribeOne`(실제 STT):
- ffmpeg로 오디오만 추출: `execFile('ffmpeg', ['-i', mp4Path, '-vn', '-acodec', 'libmp3lame', '-q:a', '4', '-y', tmpMp3])`. (ffmpeg는 `/opt/homebrew/bin/ffmpeg`에 설치됨.)
- OpenAI Whisper 전사: `POST https://api.openai.com/v1/audio/transcriptions`, multipart `file`=tmpMp3, `model`=`whisper-1`, `language`=`ko`, `response_format`=`text`. 키는 openai.ts와 동일하게 해석. 응답 텍스트 반환.
- tmp 파일 정리.

## 테스트 `tests/transcribeReels.test.ts`

- **캐시 멱등**: 임시 폴더에 `a.mp4`+`a.txt`(캐시 있음), `b.mp4`(캐시 없음) 배치. `transcribeOne` 스텁(호출 카운터 증가·"stub전사" 반환). `transcribeReels(dir,{transcribeOne})` 실행 → **카운터 == 1**(b만 전사), a는 캐시값 반환. b의 `.txt`가 기록됐는지 확인.
- **파일명 정렬**: 반환 순서가 파일명 정렬 순인지.
- **실패 격리**: 스텁이 특정 파일에 throw → 그 파일만 빠지고 나머지는 반환.
- (mp4/ffmpeg/실 Whisper는 테스트에서 호출하지 않는다 — impl 주입으로 격리.)

> `vi.fn` 대신 교체 가능한 impl 함수 + 별도 카운터로 스텁한다(rules.md: rejected promise를 vi.fn이 unhandled로 승격시키는 사각지대 회피).

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

## 검증 절차

1. AC 전부 exit 0. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드(rules.md).
2. 체크리스트: 캐시 히트 시 STT 미호출인가? 경로에 공백·`#` 있어도 안전한가(인자 배열)? 실패가 전체를 안 죽이나?
3. ⚠️ `learning/analogy-reels/`의 실제 mp4·생성될 `.txt`·`.mp3`는 커밋 금지(gitignore 확인). `git status`로 범위 외 파일 섞였는지 점검.
