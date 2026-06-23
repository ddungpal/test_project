import assert from "node:assert";

/**
 * 두 수를 더해 반환하는 순수 함수.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function add(a, b) {
  return a + b;
}

// 자체 검증 (배선 확인용 스모크 테스트)
assert.strictEqual(add(2, 3), 5);
assert.strictEqual(add(-1, 1), 0);

console.log("SMOKE OK");
