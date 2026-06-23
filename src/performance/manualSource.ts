// 성과 수동 입력 소스(개발 전용) — fixtures/performance/manual.json 을 읽어 PerformanceEntry[] 로.
//   사람이 영상별 결과 숫자를 직접 채운다. 운영 전환 시 이 파일 대신 YouTube Analytics 어댑터로 교체.
//   node 전용(fs) — 스크립트/서버에서만 import.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parsePerformanceFile, type PerformanceEntry } from "./types.js";

export const MANUAL_PERF_PATH = path.join(process.cwd(), "fixtures", "performance", "manual.json");

/** 수동 입력 파일 로드 + 검증. 파일 없음/JSON 깨짐/스키마 위반을 명확한 에러로. */
export async function loadManualPerformance(filePath = MANUAL_PERF_PATH): Promise<PerformanceEntry[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    throw new Error(
      `성과 입력 파일이 없습니다: ${filePath}\n  → fixtures/performance/manual.example.json 을 manual.json 으로 복사해 숫자를 채우세요.`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error(`성과 입력 파일 JSON 파싱 실패: ${(e as Error).message}`);
  }
  const { entries, errors } = parsePerformanceFile(json);
  if (errors.length) {
    throw new Error(`성과 입력 검증 실패(${errors.length}건):\n  - ${errors.join("\n  - ")}`);
  }
  if (entries.length === 0) throw new Error("성과 입력 entries 가 비었습니다.");
  return entries;
}
