// stageProgress.getProgress(state, progressNote?) — 제안 생성 중 isWorking 판정 회귀/확장 가드.
//   버그: 제안 단계(topic/title/thumbnail/structure) 생성 중 run.state가 이전 *_selected/proposed에
//   머물러 phase!=="working" → isWorking=false → 페이지 LiveRefresh 미작동(결과 자동표시 안 됨).
//   수정: 생성 마커(progressNote)가 합법 상태에 set되면 isWorking=true. 종료·검수 상태는 stale 마커
//   있어도 false(폴링 유발 금지).
import { describe, it, expect } from "vitest";
import { getProgress } from "../src/lib/dashboard/stageProgress.js";

describe("getProgress isWorking", () => {
  it("researching → isWorking true (회귀: phase=working)", () => {
    expect(getProgress("researching").isWorking).toBe(true);
  });

  it("scripting → isWorking true (회귀: phase=working)", () => {
    expect(getProgress("scripting").isWorking).toBe(true);
  });

  it("제안 fromState(thumbnails_selected) + 마커 존재 → isWorking true", () => {
    expect(getProgress("thumbnails_selected", "제안 생성 중").isWorking).toBe(true);
  });

  it("제안 proposedState(structure_proposed) + 마커 존재 → isWorking true (run-in-place 재생성)", () => {
    expect(getProgress("structure_proposed", "제안 생성 중").isWorking).toBe(true);
  });

  it("제안 상태(thumbnails_selected) + 마커 없음(null) → isWorking false (정상 idle)", () => {
    expect(getProgress("thumbnails_selected", null).isWorking).toBe(false);
    expect(getProgress("thumbnails_selected").isWorking).toBe(false);
  });

  it("종료 상태(approved) + 마커 존재(가정) → isWorking false (stale 폴링 방지)", () => {
    expect(getProgress("approved", "제안 생성 중").isWorking).toBe(false);
  });

  it("종료 상태(aborted) + 마커 존재(가정) → isWorking false (stale 폴링 방지)", () => {
    expect(getProgress("aborted", "제안 생성 중").isWorking).toBe(false);
  });

  it("paused_soft_cap + 마커 존재(가정) → isWorking false 유지", () => {
    expect(getProgress("paused_soft_cap", "제안 생성 중").isWorking).toBe(false);
  });

  it("created(forward fromState) + 마커 존재 → isWorking true", () => {
    expect(getProgress("created", "제안 생성 중").isWorking).toBe(true);
  });
});
