// fixtures 리플레이 — 개발 $0 전략의 핵심(tech.md §2). promptHash로 녹화·재생.
// replay: 녹화분만 사용(없으면 에러 → 과금 0 보장). record: 없으면 호출 후 녹화. off: 미사용.
//
// 민감 응답은 fixtures/**/sensitive/ 에 두어 .gitignore로 제외(governance).

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { LlmUsage } from "./types.js";

export interface FixtureRecord {
  promptHash: string;
  roleId: string;
  model: string;
  rawJson: string;
  usage: LlmUsage;
  recordedAt: string;
}

export class FixtureMissError extends Error {
  constructor(roleId: string, promptHash: string) {
    super(
      `[${roleId}] fixture 없음(hash ${promptHash.slice(0, 12)}…). replay 모드는 과금 0을 보장하려 미녹화 호출을 거부함. record 모드로 녹화하거나 LLM_FIXTURES=off 로 실호출.`,
    );
    this.name = "FixtureMissError";
  }
}

const ROOT = join(process.cwd(), "fixtures", "parity");

function pathFor(roleId: string, promptHash: string, sensitive = false): string {
  // roleId별 디렉토리 + hash 앞 16자리 파일명(가독성·충돌회피).
  // roleId 살균(traversal 차단): 영숫자·_·- 외 전부 _ 로 치환.
  const safeRole = roleId.replace(/[^a-zA-Z0-9_-]/g, "_");
  // 민감 응답은 sensitive/ 하위로 라우팅 → .gitignore(fixtures/**/sensitive/)가 커밋 차단(코드리뷰 H·governance).
  const base = sensitive ? join(ROOT, "sensitive") : ROOT;
  return join(base, safeRole, `${promptHash.slice(0, 16)}.json`);
}

export function loadFixture(roleId: string, promptHash: string): FixtureRecord | null {
  // 일반 경로 우선, 없으면 sensitive/ 경로도 조회(녹화 위치 무관하게 재생).
  const p = existsSync(pathFor(roleId, promptHash)) ? pathFor(roleId, promptHash) : pathFor(roleId, promptHash, true);
  if (!existsSync(p)) return null;
  const rec = JSON.parse(readFileSync(p, "utf8")) as FixtureRecord;
  // hash 무결성: 파일이 다른 요청으로 덮였는지 방어.
  if (rec.promptHash !== promptHash) {
    throw new Error(`fixture hash 불일치: ${p} 기대 ${promptHash} 실제 ${rec.promptHash}`);
  }
  return rec;
}

/**
 * record 모드 녹화. ⚠️ 녹화물은 실제 모델 출력이므로 커밋 전 검토 필요.
 * sensitive=true면 fixtures/**​/sensitive/ 로 라우팅되어 .gitignore가 커밋을 차단(코드리뷰 H).
 */
export function saveFixture(rec: FixtureRecord, sensitive = false): void {
  const p = pathFor(rec.roleId, rec.promptHash, sensitive);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(rec, null, 2), "utf8");
}
