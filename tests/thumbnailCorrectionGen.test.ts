// 런 화면 교정 패널 — 후보 payload에서 AI 생성 카피(메인/박스) 추출(순수 함수) 단위 테스트.
//   payload는 jsonb→unknown(LLM 산출·사람 수정) → 형태 보장 없음. 정상·배열아님·더티값·키누락에도
//   throw 없이 안전 추출(CandidateBody 썸네일 추출과 동형). saveCorrection genMain/genBoxes 로 전달될 값.
import { describe, it, expect } from "vitest";
import { extractGenCopy } from "../src/components/thumbnailCorrectionGen.js";

describe("extractGenCopy (순수 추출)", () => {
  it("정상 payload → 메인/박스 그대로", () => {
    const out = extractGenCopy({
      thumbnail_main: ["연봉 7500 이하 꼭 보세요", "지금 안 보면 손해"],
      thumbnail_boxes: ["무조건", "필수"],
    });
    expect(out.main).toEqual(["연봉 7500 이하 꼭 보세요", "지금 안 보면 손해"]);
    expect(out.boxes).toEqual(["무조건", "필수"]);
  });

  it("각 원소 trim, 빈 문자열/공백 제거", () => {
    const out = extractGenCopy({
      thumbnail_main: ["  진짜  ", "   ", ""],
      thumbnail_boxes: [" 팁 "],
    });
    expect(out.main).toEqual(["진짜"]);
    expect(out.boxes).toEqual(["팁"]);
  });

  it("string 아닌 더티 원소(숫자·null·객체)는 제거", () => {
    const out = extractGenCopy({
      thumbnail_main: ["좋은", 123, null, { x: 1 }, "카피"],
      thumbnail_boxes: [true, "박스"],
    });
    expect(out.main).toEqual(["좋은", "카피"]);
    expect(out.boxes).toEqual(["박스"]);
  });

  it("필드가 배열이 아니면(문자열·객체·숫자) [] 폴백", () => {
    const out = extractGenCopy({ thumbnail_main: "메인", thumbnail_boxes: 42 });
    expect(out.main).toEqual([]);
    expect(out.boxes).toEqual([]);
  });

  it("키 누락 → [] 폴백", () => {
    expect(extractGenCopy({})).toEqual({ main: [], boxes: [] });
    expect(extractGenCopy({ thumbnail_main: ["메인"] })).toEqual({ main: ["메인"], boxes: [] });
  });

  it("payload 가 null·undefined·배열·원시값이어도 throw 없이 빈 추출", () => {
    expect(extractGenCopy(null)).toEqual({ main: [], boxes: [] });
    expect(extractGenCopy(undefined)).toEqual({ main: [], boxes: [] });
    expect(extractGenCopy([])).toEqual({ main: [], boxes: [] });
    expect(extractGenCopy("문자열")).toEqual({ main: [], boxes: [] });
    expect(extractGenCopy(42)).toEqual({ main: [], boxes: [] });
  });
});
