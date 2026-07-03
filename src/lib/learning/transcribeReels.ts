// 비유 학습 STT 어댑터 — learning/analogy-reels/*.mp4 → Whisper 전사 → <name>.txt 캐시.
//   설계: docs/specs/2026-07-03-analogy-learning-design.md §4.1.
//   ★ 멱등·재과금 0: <name>.txt 캐시가 있으면 STT 미호출(읽어서 재사용).
//   ★ 실패 격리(best-effort): 한 파일 STT 실패는 로그 후 skip — 전체 sweep 안 죽임.
//   ★ 셸 문자열 조립 금지: 파일명에 공백·'#'가 있으므로 execFile 인자 배열로만 경로 전달.
//   ★ owner-local: 로컬 mp4 폴더를 읽으므로 owner 머신/dev에서만 동작.
import { readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, basename, extname } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const execFileAsync = promisify(execFile);

const WHISPER_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";

export interface ReelTranscript {
  name: string;
  transcript: string;
}

/** 주입 가능한 STT impl — 테스트에서 impl 함수 스텁 + 호출 카운터로 격리(vi.fn 지양 규칙). */
export type TranscribeOne = (mp4Path: string) => Promise<string>;

/**
 * `dir`의 *.mp4를 파일명 정렬(결정성)로 전사한다.
 *   - <name>.txt 캐시가 있으면 읽어서 재사용(STT 미호출·멱등).
 *   - 없으면 transcribeOne(mp4Path) → <name>.txt 기록.
 *   - transcribeOne 실패는 로그 후 그 파일만 skip.
 *   - 빈 transcript(캐시가 빈 문자열이거나 전사 결과 빈 문자열)는 결과에서 제외.
 */
export async function transcribeReels(
  dir: string,
  deps?: { transcribeOne?: TranscribeOne },
): Promise<ReelTranscript[]> {
  const transcribeOne = deps?.transcribeOne ?? defaultTranscribeOne;

  const entries = await readdir(dir);
  const mp4s = entries
    .filter((f) => extname(f).toLowerCase() === ".mp4")
    .sort(); // 파일명 정렬 = 결정성

  const results: ReelTranscript[] = [];
  for (const file of mp4s) {
    const name = basename(file, extname(file));
    const mp4Path = join(dir, file);
    const txtPath = join(dir, `${name}.txt`);

    let transcript: string;
    const cached = await readCache(txtPath);
    if (cached !== null) {
      transcript = cached; // 캐시 히트 — STT 미호출
    } else {
      try {
        transcript = await transcribeOne(mp4Path);
      } catch (err) {
        // best-effort: 이 파일만 skip, 전체 sweep은 계속.
        console.error(`[transcribeReels] STT 실패 — skip: ${file}`, err);
        continue;
      }
      await writeFile(txtPath, transcript, "utf8");
    }

    const trimmed = transcript.trim();
    if (!trimmed) continue; // 빈 transcript 제외
    results.push({ name, transcript });
  }

  return results;
}

/** <name>.txt를 읽어 내용을 반환. 없으면 null(캐시 미스). */
async function readCache(txtPath: string): Promise<string | null> {
  try {
    return await readFile(txtPath, "utf8");
  } catch {
    return null; // 파일 없음 = 캐시 미스
  }
}

/**
 * 실제 STT — ffmpeg로 오디오 추출 후 OpenAI Whisper(whisper-1, ko) 전사.
 *   테스트에서는 transcribeOne 주입으로 격리되어 호출되지 않는다.
 */
export const defaultTranscribeOne: TranscribeOne = async (mp4Path) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY 미설정 — Whisper 전사에는 OpenAI 키가 필요하다.");
  }

  const tmpMp3 = join(tmpdir(), `reel-${randomBytes(8).toString("hex")}.mp3`);
  try {
    // ffmpeg: 오디오만 추출(-vn), mp3(libmp3lame). PATH의 ffmpeg 사용. 인자 배열 → 셸 미경유(공백·# 안전).
    await execFileAsync("ffmpeg", [
      "-i",
      mp4Path,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-q:a",
      "4",
      "-y",
      tmpMp3,
    ]);

    const bytes = await readFile(tmpMp3);
    // Node 내장 FormData + Blob으로 multipart 구성(의존성 0).
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "audio/mpeg" }), "audio.mp3");
    form.append("model", "whisper-1");
    form.append("language", "ko");
    form.append("response_format", "text");

    const res = await fetch(WHISPER_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 600);
      throw new Error(`Whisper HTTP ${res.status}: ${detail}`);
    }
    // response_format=text → 응답 본문이 전사 텍스트 문자열.
    return (await res.text()).trim();
  } finally {
    // tmp 정리 — 존재하면 삭제, 실패 무시(best-effort).
    try {
      await unlink(tmpMp3);
    } catch {
      // ignore
    }
  }
};
