// thumbnail-regen-queue step0: 슬롯 재생성 '비차단 큐' 순수 코어.
//   완료 판정은 candidate id가 아니라 payload '내용' 동등성으로 한다 — 보존 슬롯(같은 payload)은 미완료, 바뀐 슬롯만 완료.
import { describe, it, expect } from "vitest";
import { candidateKey, resolveCompletedSlots, clearSlots } from "../src/components/thumbnailRegenQueue.js";
import type { CandidateView } from "../src/lib/dashboard/proposalTypes.js";

// 테스트용 후보 헬퍼 — idx와 payload만 의미 있고 reason/evidence_ids는 형식 충족용.
function cand(idx: number, payload: unknown): CandidateView {
  return { idx, payload, reason: "", evidence_ids: [] };
}

describe("candidateKey — 내용 동등성(키 순서 무관)", () => {
  it("키 순서만 다른 동일 내용 객체는 같은 키를 반환한다", () => {
    const a = { thumbnail_main: ["가", "나"], thumbnail_boxes: ["A", "B"] };
    const b = { thumbnail_boxes: ["A", "B"], thumbnail_main: ["가", "나"] };
    expect(candidateKey(a)).toBe(candidateKey(b));
  });

  it("중첩 객체의 키 순서도 정규화한다", () => {
    const a = { x: { p: 1, q: 2 }, y: [{ m: 1, n: 2 }] };
    const b = { y: [{ n: 2, m: 1 }], x: { q: 2, p: 1 } };
    expect(candidateKey(a)).toBe(candidateKey(b));
  });

  it("배열 순서가 다르면 다른 키(순서는 의미가 있다)", () => {
    expect(candidateKey({ main: ["가", "나"] })).not.toBe(candidateKey({ main: ["나", "가"] }));
  });

  it("내용이 다르면 다른 키", () => {
    expect(candidateKey({ main: ["가"] })).not.toBe(candidateKey({ main: ["다"] }));
  });
});

describe("resolveCompletedSlots — 변경된 슬롯만 완료로 판정", () => {
  it("스냅샷과 payload가 동일(보존 슬롯)이면 완료 아님 — 빈 배열", () => {
    const payload = { thumbnail_main: ["가", "나"], thumbnail_boxes: ["A", "B"] };
    const pending = { 0: candidateKey(payload) };
    const candidates = [cand(0, payload)];
    expect(resolveCompletedSlots(pending, candidates)).toEqual([]);
  });

  it("키 순서만 다르고 내용이 같으면 보존으로 보아 완료 아님(id 비교가 아님 검증)", () => {
    const snapshot = candidateKey({ thumbnail_main: ["가"], thumbnail_boxes: ["A"] });
    const pending = { 0: snapshot };
    // 같은 내용, 키 순서만 뒤집힌 현재 후보
    const candidates = [cand(0, { thumbnail_boxes: ["A"], thumbnail_main: ["가"] })];
    expect(resolveCompletedSlots(pending, candidates)).toEqual([]);
  });

  it("payload가 변경된 슬롯만 완료로 반환한다", () => {
    const keptKey = candidateKey({ main: ["보존"] });
    const pending = { 0: keptKey, 1: candidateKey({ main: ["옛날B"] }) };
    const candidates = [
      cand(0, { main: ["보존"] }), // 슬롯0: 그대로
      cand(1, { main: ["새B"] }), // 슬롯1: 바뀜
    ];
    expect(resolveCompletedSlots(pending, candidates)).toEqual([1]);
  });

  it("여러 슬롯이 한 번에 바뀌면 모두 반환(폴링 사이 2개 완료)", () => {
    const pending = {
      0: candidateKey({ main: ["옛A"] }),
      2: candidateKey({ main: ["옛C"] }),
    };
    const candidates = [
      cand(0, { main: ["새A"] }),
      cand(1, { main: ["변경없음"] }),
      cand(2, { main: ["새C"] }),
    ];
    expect(resolveCompletedSlots(pending, candidates).sort()).toEqual([0, 2]);
  });

  it("해당 idx 후보가 사라지면 완료로 본다", () => {
    const pending = { 1: candidateKey({ main: ["X"] }) };
    const candidates = [cand(0, { main: ["다른슬롯"] })]; // idx 1 없음
    expect(resolveCompletedSlots(pending, candidates)).toEqual([1]);
  });
});

describe("clearSlots — 완료 슬롯만 제거(불변)", () => {
  it("완료 슬롯만 제거하고 나머지는 보존한다", () => {
    const pending = { 0: "k0", 1: "k1", 2: "k2" };
    expect(clearSlots(pending, [1])).toEqual({ 0: "k0", 2: "k2" });
  });

  it("원본 객체를 변형하지 않는다(불변)", () => {
    const pending = { 0: "k0", 1: "k1" };
    const next = clearSlots(pending, [0]);
    expect(pending).toEqual({ 0: "k0", 1: "k1" }); // 원본 그대로
    expect(next).toEqual({ 1: "k1" });
    expect(next).not.toBe(pending); // 새 객체
  });

  it("완료가 없으면 동일 내용의 새 객체를 돌려준다", () => {
    const pending = { 0: "k0" };
    expect(clearSlots(pending, [])).toEqual({ 0: "k0" });
  });
});
