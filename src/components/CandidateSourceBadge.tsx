import { candidateSource, CANDIDATE_SOURCE_LABEL } from "@/lib/dashboard/proposalTypes";

// 후보 출처 배지(copy-local-gen step3) — evidence_ids에 "skeleton"이 있으면 로컬($0), 없으면 LLM.
//   판정은 candidateSource(순수·단위테스트)에 위임. 여기선 TRUS 3색·직각·무그림자 표시만.
//   둘 다 외곽선 칩(메타정보라 채움은 과함): 로컬=노란 외곽선(돈 안 든 걸 또렷이·기존 경고칩과 같은 언어),
//   LLM=흰 외곽선(보조 톤). 같은 형태·색만 달라 로컬/LLM이 한눈에 구분되고, 카드의 A/B 채움 뱃지를 안 압도한다.
export function CandidateSourceBadge({ evidenceIds }: { evidenceIds: readonly string[] }) {
  const src = candidateSource(evidenceIds);
  const cls =
    src === "local"
      ? "border border-trus-yellow text-trus-yellow"
      : "border border-trus-white/30 text-trus-white/60";
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>
      {CANDIDATE_SOURCE_LABEL[src]}
    </span>
  );
}
