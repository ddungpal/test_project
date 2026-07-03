// 비유 학습 STT 어댑터 — transcribeReels 단위테스트.
//   설계: docs/specs/2026-07-03-analogy-learning-design.md §4.1, §7.
//
// ★ transcribeOne 스텁은 '교체 가능한 impl 함수 + 별도 호출 카운터'로 둔다(vi.fn 아님). 이유: 실패 격리
//   테스트에서 스텁이 throw(rejected promise)를 반환하는데, vi.fn의 결과 추적(mock.results)이 그
//   rejected promise를 unhandled로 감지해 테스트를 실패로 승격시킨다(vitest 2.1.8). transcribeReels는
//   실제로 catch해 skip하므로, 추적 없는 plain 함수 + 카운터로 그 정상 동작을 그대로 검증한다.
// ★ 실제 STT(ffmpeg/Whisper/mp4)는 절대 호출하지 않는다 — impl 주입으로 격리. mp4는 빈 파일 touch만.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { transcribeReels } from "../src/lib/learning/transcribeReels.js";

describe("transcribeReels", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "reels-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("캐시 히트면 STT 미호출(멱등), 캐시 미스만 전사·기록", async () => {
    // a.mp4 + a.txt(캐시 있음), b.mp4(캐시 없음)
    await writeFile(join(dir, "a.mp4"), "");
    await writeFile(join(dir, "a.txt"), "캐시된A", "utf8");
    await writeFile(join(dir, "b.mp4"), "");

    // 교체 가능한 impl 스텁 + 별도 카운터(vi.fn 금지 규칙).
    let calls = 0;
    const transcribeOne = async (_mp4Path: string): Promise<string> => {
      calls += 1;
      return "stub전사";
    };

    const out = await transcribeReels(dir, { transcribeOne });

    // b만 전사 → 카운터 1
    expect(calls).toBe(1);

    // a는 캐시값, b는 스텁값
    const map = new Map(out.map((r) => [r.name, r.transcript]));
    expect(map.get("a")).toBe("캐시된A");
    expect(map.get("b")).toBe("stub전사");

    // b의 .txt가 디스크에 기록됐는지
    const bTxt = await readFile(join(dir, "b.txt"), "utf8");
    expect(bTxt).toBe("stub전사");
  });

  it("반환 순서는 파일명 정렬 순", async () => {
    for (const n of ["c", "a", "b"]) {
      await writeFile(join(dir, `${n}.mp4`), "");
    }
    let i = 0;
    const transcribeOne = async (_p: string): Promise<string> => {
      i += 1;
      return `t${i}`;
    };

    const out = await transcribeReels(dir, { transcribeOne });
    expect(out.map((r) => r.name)).toEqual(["a", "b", "c"]);
  });

  it("한 파일 전사 실패는 그 파일만 skip, 나머지는 반환", async () => {
    for (const n of ["a", "bad", "c"]) {
      await writeFile(join(dir, `${n}.mp4`), "");
    }
    let calls = 0;
    const transcribeOne = async (mp4Path: string): Promise<string> => {
      calls += 1;
      if (mp4Path.includes("bad.mp4")) {
        throw new Error("STT 폭발");
      }
      return "ok";
    };

    const out = await transcribeReels(dir, { transcribeOne });

    // 셋 다 시도(캐시 없음), bad는 결과에서 빠짐
    expect(calls).toBe(3);
    expect(out.map((r) => r.name).sort()).toEqual(["a", "c"]);

    // bad는 .txt도 안 남는다
    await expect(readFile(join(dir, "bad.txt"), "utf8")).rejects.toThrow();
  });

  it("빈 transcript(전사 결과 빈 문자열)는 결과에서 제외", async () => {
    await writeFile(join(dir, "empty.mp4"), "");
    await writeFile(join(dir, "full.mp4"), "");
    const transcribeOne = async (mp4Path: string): Promise<string> => {
      return mp4Path.includes("empty.mp4") ? "   " : "내용있음";
    };

    const out = await transcribeReels(dir, { transcribeOne });
    expect(out.map((r) => r.name)).toEqual(["full"]);
  });
});
