// 쏙이 문항 정답 위치 분산 — 결정적 셔플(순수·throw 0·입력 비변형).
//   설계: docs/specs/2026-07-03-onboarding-question-quality-design.md "Step 0".
//   문제: claude-p가 정답을 한 위치(늘 2번)에 고정 → 김짠부가 "답은 늘 2번" 패턴 학습 → 프리테스트 효과 소멸.
//   해결: 문항 내용을 시드로 한 결정적 순열로 choices를 재배열하고 answerIdx를 재매핑.
//   ★ Math.random·Date.now 금지 — replay·테스트 비결정성 유발. 시드는 문항 내용 해시라 같은 문항 → 항상 같은 순열.
import type { ArcQuestion } from "../../agents/onboarder/schema.js";

/** djb2 로컬 정수 해시(비암호·결정적). 문자열 → 32bit 부호없는 정수. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i); // h*33 + c 변형(XOR 버전)
  }
  return h >>> 0; // 부호없는 32bit
}

/** mulberry32 시드 PRNG — 자체 4줄(의존성 0). seed → [0,1) 결정적 난수 생성기. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 문항의 choices를 결정적으로 재배열하고 answerIdx를 재매핑한다(순수·throw 0·입력 비변형).
 *   - 정답은 하나 그대로 — 원래 answerIdx가 순열에서 이동한 새 위치를 answerIdx로(정답 내용 불변).
 *     ★ 값 검색이 아니라 위치 추적 — 동일 문자열 choice가 있어도 정확히 매핑.
 *   - 시드 = 문항 내용(prompt + choices 조인)의 djb2 해시. 같은 문항 → 항상 같은 순열(결정적).
 *   - choices.length < 2면 새 객체로 그대로 반환(방어).
 *   - unverifiedNumbers·cliffhanger 등 다른 필드는 전부 보존.
 */
export function shuffleChoices(q: ArcQuestion): ArcQuestion {
  const choices = q.choices;
  const n = choices.length;
  if (n < 2) return { ...q, choices: [...choices] }; // 방어 — 섞을 게 없음(새 객체로 일관 반환)

  // 시드: 문항 내용으로 결정적. prompt + choices 조인(구분자로 안전 조인).
  const seed = djb2(q.prompt + " " + choices.join("  "));
  const rand = mulberry32(seed);

  // 0..n-1 인덱스 순열을 Fisher-Yates로 생성(결정적 rand 사용).
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = perm[i]!;
    perm[i] = perm[j]!;
    perm[j] = tmp;
  }

  // 순열 적용: newChoices[newPos] = choices[perm[newPos]].
  //   answerIdx 재매핑 = 원래 answerIdx를 담게 된 새 위치(perm[newPos] === q.answerIdx인 newPos).
  const newChoices: string[] = new Array(n);
  let newAnswerIdx = q.answerIdx;
  for (let newPos = 0; newPos < n; newPos++) {
    const origIdx = perm[newPos]!;
    newChoices[newPos] = choices[origIdx]!;
    if (origIdx === q.answerIdx) newAnswerIdx = newPos; // 위치 추적(값 검색 아님)
  }

  return { ...q, choices: newChoices, answerIdx: newAnswerIdx };
}
