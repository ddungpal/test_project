// Supabase DB 타입 — supabase/migrations/ 스키마와 1:1. (CLI 미사용, 스키마 기준 수기 생성)
// enum 컬럼은 src/domain/enums.ts 의 리터럴 유니온을 재사용해 코드-DB 동기화 유지.
// 스키마 변경 시 마이그레이션 + 이 파일 + domain/enums 함께 갱신.

import type {
  AbDecisiveness,
  ContentFormat,
  Freshness,
  RunState,
  SourceTier,
  Stage,
  VerificationStatus,
  Volatility,
} from "../../domain/enums.js";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Insert 헬퍼: 기본값/nullable은 optional, NOT NULL·무기본 컬럼(R)만 required. */
type Insertable<Row, R extends keyof Row = never> = Partial<Row> & Pick<Row, R>;

type Role = "owner" | "editor" | "viewer";
type ContentSource = "imported" | "produced";
type ContentStatus = "draft" | "in_production" | "published" | "archived";
type AbResultStatus = "pending" | "decided";
type BillStatus = "draft" | "enacted" | "na";
type ParseStatus = "ok" | "partial" | "failed" | "blocked";
type CorpusStatus = "done" | "todo" | "drafting";
type ProfileStatus = "draft" | "active" | "retired";

// ── Row 타입 ──
type Profiles = { id: string; role: Role; display_name: string | null; created_at: string };
type ConfigRegistry = { id: string; key: string; value: Json; version: number; effective_from: string; note: string | null; updated_by: string | null; created_at: string };
type Contents = {
  id: string; source: ContentSource; title: string | null; topic: string | null; format: ContentFormat;
  sponsored: boolean; status: ContentStatus; youtube_video_id: string | null; thumbnail_url: string | null;
  upload_date: string | null; ab_margin: number | null; ab_decisiveness: AbDecisiveness | null;
  ab_result_status: AbResultStatus; created_at: string; updated_at: string;
};
type ProductionRuns = {
  id: string; content_id: string; state: RunState; as_of_date: string; prompt_version: string | null;
  model: string | null; context_ref: string | null; cost_usd: number; latency_ms: number | null;
  rework_count: number; abort_reason: string | null; // migration 12(반장 마감)
  paused_stage: "research" | "script" | null; // migration 13(soft-cap 재개 단계 보존)
  progress_note: string | null; // migration 15(단계 내부 서브진행 'i/n·라벨')
  created_at: string; updated_at: string;
};
type Transcripts = { id: string; content_id: string; youtube_video_id: string; lang: string | null; full_text: string; segments: Json | null; source: "subtitle" | "whisper" | null; fetched_at: string };
type CommentsRaw = { id: string; content_id: string | null; youtube_video_id: string; external_id_hash: string; body: string | null; like_count: number | null; posted_at: string | null; redacted_at: string | null; fetched_at: string };
type TopicInterviews = { id: string; content_id: string | null; question: string | null; answer: string; created_at: string };
type SourceDocuments = { id: string; run_id: string | null; url: string; content_type: string | null; archived_copy: string | null; publisher: string | null; source_published_at: string | null; fetched_at: string };
type SourceParses = { id: string; source_document_id: string; parse_status: ParseStatus | null; parsed_text: string | null; parser_version: string | null; created_at: string };
type StageProposals = { id: string; run_id: string; stage: Stage; candidates: Json; sources: Json | null; prompt_run_ref: string | null; created_at: string }; // sources: migration 16
type StageSelections = { id: string; proposal_id: string; chosen_idx: number | null; edited_payload: Json | null; edit_distance: number | null; selection_reason: string | null; selected_by: string | null; created_at: string };
type ResearchFacts = {
  id: string; run_id: string; claim: string; verification_status: VerificationStatus; source_tier: SourceTier | null;
  primary_source_url: string | null; source_document_id: string | null; independent_origin_count: number;
  quote_excerpt: string | null; citation_verified: boolean; is_financial: boolean; misleading_check: string | null;
  as_of_date: string | null; source_published_at: string | null; data_reference_period: string | null;
  effective_date: string | null; applies_to: string | null; grace_period: string | null; bill_status: BillStatus;
  volatility: Volatility | null; freshness: Freshness | null; recheck_after: string | null;
  escalated_to_human: boolean; human_approved: boolean | null; created_at: string;
};
type ExplanationAssets = { id: string; run_id: string; concept: string; kind: "number" | "analogy"; numeric_example: string | null; analogy: string | null; created_by: string | null; source_fact_id: string | null; math_verified: boolean | null; distortion_checked: boolean | null; used_in_script: boolean; landed_score: number | null; created_at: string };
type ScriptSegments = { id: string; content_id: string; run_id: string; ord: number; text: string; prompt_run_ref: string | null; created_at: string };
type ScriptSegmentFacts = { segment_id: string; fact_id: string };
type ScriptSegmentExplanationAssets = { segment_id: string; asset_id: string };
type TopicCandidates = { id: string; source: "comment" | "trend" | "competitor" | "community" | "econ_calendar"; title: string | null; rationale: string | null; signal_score: number | null; evidence: Json | null; status: "new" | "shortlisted" | "used" | "dropped"; content_id: string | null; dedup_key: string | null; last_seen_at: string; created_at: string }; // migration 19(발굴 신선도)
type PerformanceMetrics = { id: string; content_id: string; metric_window: "d1" | "d7" | "d14" | "d30"; views: number | null; ctr: number | null; avg_view_pct: number | null; traffic_source: Json | null; ab_variant: string; recorded_at: string };
type CostLedger = { id: string; run_id: string; category: "llm" | "search" | "embedding" | "storage" | "infra" | "human_review"; detail: string | null; cost_usd: number; tokens: number | null; latency_ms: number | null; created_at: string };
type ToneProfile = { id: string; version: number; components: Json; source_ref: string | null; status: ProfileStatus; created_at: string };
type Insights = { id: string; category: "topic" | "thumbnail" | "title" | "structure" | "tone" | "research" | "cta" | "analogy"; title: string | null; body: string | null; confidence: number | null; valid_until: string | null; status: "draft" | "reviewed" | "approved" | "deprecated"; source_type: "ai_suggested" | "human_authored" | "retrospective" | null; source_retrospective_id: string | null; source_content_id: string | null; created_at: string };
type Retrospectives = { id: string; content_id: string | null; scope: "content" | "campaign" | null; good_points: string | null; improvements: string | null; lessons: string | null; created_at: string };
type CorpusEditions = { id: string; content_id: string | null; source_ref: string | null; edition_date: string | null; topic: string | null; format: ContentFormat; is_long_form: boolean; sponsored: boolean; status: CorpusStatus; include_in_training: boolean; created_at: string };
type CorpusComponents = { id: string; edition_id: string; type: "title" | "thumbnail_copy" | "description" | "script"; variant_idx: number | null; content: string; is_final: boolean; created_at: string };
type AbVariants = { id: string; content_id: string; component_type: "title" | "thumbnail"; variant: "A" | "B" | "C"; payload: Json | null; ctr_pct: number | null; impressions: number | null; weight: number | null; rank: number | null; is_winner: boolean; created_at: string };
type StyleProfiles = { id: string; component_type: "title" | "thumbnail_copy" | "description"; version: number | null; patterns: Json | null; status: ProfileStatus; created_at: string };
type ProfileTrainingSources = { id: string; profile_type: "tone" | "title" | "thumbnail_copy" | "description"; tone_profile_id: string | null; style_profile_id: string | null; edition_id: string | null; component_id: string | null; ab_variant_id: string | null; metric_id: string | null; weight: number | null; created_at: string };
type RunStateTransitions = { from_state: string; to_state: string };
type ContentRelation = "reference" | "series_followup";
type ContentLinks = { id: string; from_content_id: string; to_content_id: string; relation: ContentRelation; intent: string | null; created_at: string }; // migration 14
type AuditLog = { id: string; actor_id: string | null; action: string; target_type: string | null; target_id: string | null; detail: Json | null; created_at: string }; // migration 20

type T<Row, R extends keyof Row = never> = { Row: Row; Insert: Insertable<Row, R>; Update: Partial<Row>; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      profiles: T<Profiles, "id">;
      config_registry: T<ConfigRegistry, "key" | "value">;
      contents: T<Contents>;
      production_runs: T<ProductionRuns, "content_id">;
      transcripts: T<Transcripts, "youtube_video_id" | "full_text">;
      comments_raw: T<CommentsRaw, "youtube_video_id" | "external_id_hash">;
      topic_interviews: T<TopicInterviews, "answer">;
      source_documents: T<SourceDocuments, "url">;
      source_parses: T<SourceParses, "source_document_id">;
      stage_proposals: T<StageProposals, "run_id" | "stage" | "candidates">;
      stage_selections: T<StageSelections, "proposal_id">;
      research_facts: T<ResearchFacts, "run_id" | "claim" | "verification_status">;
      explanation_assets: T<ExplanationAssets, "run_id" | "concept" | "kind">;
      script_segments: T<ScriptSegments, "content_id" | "run_id" | "ord" | "text">;
      script_segment_facts: T<ScriptSegmentFacts, "segment_id" | "fact_id">;
      script_segment_explanation_assets: T<ScriptSegmentExplanationAssets, "segment_id" | "asset_id">;
      topic_candidates: T<TopicCandidates, "source">;
      performance_metrics: T<PerformanceMetrics, "content_id" | "metric_window">;
      cost_ledger: T<CostLedger, "run_id" | "category" | "cost_usd">;
      tone_profile: T<ToneProfile, "version" | "components">;
      insights: T<Insights, "category">;
      retrospectives: T<Retrospectives>;
      // include_in_training은 generated → Insert에서 제외.
      corpus_editions: { Row: CorpusEditions; Insert: Insertable<Omit<CorpusEditions, "include_in_training">>; Update: Partial<Omit<CorpusEditions, "include_in_training">>; Relationships: [] };
      corpus_components: T<CorpusComponents, "edition_id" | "type" | "content">;
      ab_variants: T<AbVariants, "content_id" | "component_type" | "variant">;
      style_profiles: T<StyleProfiles, "component_type">;
      profile_training_sources: T<ProfileTrainingSources, "profile_type">;
      run_state_transitions: T<RunStateTransitions, "from_state" | "to_state">;
      content_links: T<ContentLinks, "from_content_id" | "to_content_id" | "relation">;
      audit_log: T<AuditLog, "action">;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// 편의 별칭.
export type Tables<K extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][K]["Row"];
export type TablesInsert<K extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][K]["Insert"];
export type TablesUpdate<K extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][K]["Update"];
