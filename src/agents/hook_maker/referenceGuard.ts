// 훅이 레퍼런스 유사도 가드(순수) — 제안 제목이 과거 제목을 통째로 베꼈는지 근사 측정.
//   새 알고리즘을 만들지 않고 scriptGuards의 containment(문자 n-gram 포함도)를 재사용한다.
//   각 개별 레퍼런스에 대한 포함도의 '최대값'을 본다(전체를 한 셋으로 합치면 한 ref 통째 베낌을 못 잡음).
import { buildCorpusShingles, containment } from "../../pipeline/scriptGuards.js";

/** 이상이면 '레퍼런스 거의 베낌' 의심 → 소프트 플래그. (scriptGuards.PLAGIARISM_THRESHOLD와 동일 기조) */
export const REFERENCE_SIMILARITY_FLAG = 0.6;

/** text가 references 중 어느 하나와 가장 많이 겹치는 포함도(0~1). references 비면 0. */
export function maxReferenceSimilarity(text: string, references: string[]): number {
  let max = 0;
  for (const ref of references) {
    const sim = containment(text, buildCorpusShingles([ref]));
    if (sim > max) max = sim;
  }
  return max;
}
