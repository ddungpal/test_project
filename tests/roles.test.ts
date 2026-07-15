// 역할 레지스트리 단위 테스트 — 신규 thumbnail_maker 역할이 등록되고 opus로 라우팅되는지 못박는다.
import { describe, it, expect, afterEach } from "vitest";
import { ROLES, resolveModel, roleTools } from "../src/agents/roles.js";

describe("roles — thumbnail_maker 등록", () => {
  it("thumbnail_maker가 ROLES에 있고 roleId가 안정 키", () => {
    expect(ROLES.thumbnail_maker.roleId).toBe("thumbnail_maker");
  });
  it("resolveModel('thumbnail_maker') === 'opus'", () => {
    expect(resolveModel("thumbnail_maker")).toBe("opus");
  });
  it("thumbnail_maker는 도구 없음(§10) — 빈 화이트리스트", () => {
    expect(roleTools("thumbnail_maker")).toEqual([]);
  });
});

describe("roles — Fable 테스트 토글(PIPELINE_MODEL)", () => {
  const prev = process.env.PIPELINE_MODEL;
  afterEach(() => {
    if (prev === undefined) delete process.env.PIPELINE_MODEL;
    else process.env.PIPELINE_MODEL = prev;
  });

  it("env 미설정이면 전 역할 기존 opus (무영향)", () => {
    delete process.env.PIPELINE_MODEL;
    for (const r of ["sherlock_lead", "scribe", "topic_scout", "hook_maker", "fact_verifier"]) {
      expect(resolveModel(r)).toBe("opus");
    }
  });

  it("PIPELINE_MODEL=claude-fable-5면 리서치+짠펜만 fable", () => {
    process.env.PIPELINE_MODEL = "claude-fable-5";
    for (const r of ["sherlock_lead", "fact_verifier", "numbers", "analogist", "comparator", "case_miner", "critic", "scribe"]) {
      expect(resolveModel(r)).toBe("fable");
    }
  });

  it("토글 켜도 대상 밖(주제·제목·썸네일·구성·온보딩)은 opus 유지", () => {
    process.env.PIPELINE_MODEL = "claude-fable-5";
    for (const r of ["topic_scout", "hook_maker", "thumbnail_maker", "structurer", "onboarder"]) {
      expect(resolveModel(r)).toBe("opus");
    }
  });

  it("다른 값이면 무영향(fable 아님)", () => {
    process.env.PIPELINE_MODEL = "something-else";
    expect(resolveModel("scribe")).toBe("opus");
  });
});
