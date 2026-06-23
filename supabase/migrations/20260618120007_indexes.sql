-- 07 — hot FK 인덱스(§17). Postgres는 FK에 자동 인덱스를 만들지 않는다 → 조인·삭제 성능.

create index idx_production_runs_content on public.production_runs(content_id);
create index idx_topic_interviews_content on public.topic_interviews(content_id);
create index idx_source_documents_run on public.source_documents(run_id);
create index idx_source_parses_doc on public.source_parses(source_document_id);

create index idx_stage_proposals_run on public.stage_proposals(run_id);
create index idx_stage_selections_proposal on public.stage_selections(proposal_id);
create index idx_research_facts_run on public.research_facts(run_id);
create index idx_research_facts_source_doc on public.research_facts(source_document_id);
create index idx_explanation_assets_run on public.explanation_assets(run_id);
create index idx_explanation_assets_fact on public.explanation_assets(source_fact_id);
create index idx_script_segments_run on public.script_segments(run_id);
create index idx_script_segments_content on public.script_segments(content_id);
create index idx_seg_facts_fact on public.script_segment_facts(fact_id);
create index idx_seg_assets_asset on public.script_segment_explanation_assets(asset_id);
create index idx_topic_candidates_content on public.topic_candidates(content_id);
create index idx_performance_metrics_content on public.performance_metrics(content_id);
create index idx_cost_ledger_run on public.cost_ledger(run_id, created_at);

create index idx_corpus_components_edition on public.corpus_components(edition_id);
create index idx_corpus_editions_content on public.corpus_editions(content_id);
create index idx_ab_variants_content on public.ab_variants(content_id);
create index idx_pts_tone on public.profile_training_sources(tone_profile_id);
create index idx_pts_style on public.profile_training_sources(style_profile_id);
create index idx_config_registry_key on public.config_registry(key, effective_from);

-- 학습 대상 빠른 필터(생성 컬럼).
create index idx_corpus_editions_training on public.corpus_editions(include_in_training) where include_in_training;
