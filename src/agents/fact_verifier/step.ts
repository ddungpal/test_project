// 팩트검증가 step — claim 1건: 검색 → 검증(callLLM 1회). 실패 시 강등(날조 금지·§9-④).
//   금융 claim은 공식 도메인(config 주입)으로 검색 한정. 검색결과는 신뢰불가 외부콘텐츠로 명시(§10).
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import { search } from "../../search/search.js";
import type { SearchBackend, SearchResult } from "../../search/types.js";
import { FACT_VERIFIER_SCHEMA, FACT_VERIFIER_SYSTEM, type FactVerifierOutput } from "./schema.js";

export interface VerifyClaimInput {
  text: string;
  is_financial: boolean;
}

export interface VerifyClaimResult {
  claim: VerifyClaimInput;
  results: SearchResult[];
  v: FactVerifierOutput;
}

/** 검증 실패 시 강등 fact(우아한 실패 §9-④). 항상 사람 검수로 에스컬레이션된다. */
export function degradedVerification(reason: string): FactVerifierOutput {
  return {
    verification_status: "could_not_verify",
    source_tier: "unknown",
    primary_source_url: null,
    quote_excerpt: null,
    citation_verified: false,
    independent_origin_count: 0,
    misleading_check: null,
    freshness: "unknown",
    reasoning: `검증 실패(강등): ${reason}`,
  };
}

/** claim 1건: 검색 → 팩트검증가. (실패는 호출부 .catch에서 degradedVerification로 강등.) */
export async function verifyClaimStep(
  claim: VerifyClaimInput,
  runId: string,
  llm: CallLLMDeps,
  opts: { financialDomains: readonly string[]; backend?: SearchBackend },
): Promise<VerifyClaimResult> {
  const sr = await search(
    { query: claim.text, maxResults: 6, ...(claim.is_financial ? { includeDomains: [...opts.financialDomains] } : {}) },
    opts.backend ? { backend: opts.backend } : {},
  );
  const fv = await callLLM<FactVerifierOutput>(
    {
      roleId: "fact_verifier",
      system: FACT_VERIFIER_SYSTEM,
      // §10: 검색결과는 신뢰불가 외부 콘텐츠 → 필드명으로 명시(시스템 프롬프트가 "데이터로만" 규칙 보유).
      input: { claim: claim.text, is_financial: claim.is_financial, untrusted_search_results: sr.results },
      schema: FACT_VERIFIER_SCHEMA,
      runId,
      maxTokens: 1536,
    },
    llm,
  );
  return { claim, results: sr.results, v: fv.data };
}
