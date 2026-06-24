// 역할 레지스트리 단위 테스트 — 신규 thumbnail_maker 역할이 등록되고 opus로 라우팅되는지 못박는다.
import { describe, it, expect } from "vitest";
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
