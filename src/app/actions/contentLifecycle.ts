// 검증된 produced-content 하드 삭제 시퀀스(deleteRun·deleteLearningVideo 공유). 두 CHECK 가드 선제.
//   ★ 이 파일은 'use server' 금지 — 'use server' 파일의 모든 export 는 외부 호출 가능한 server action 으로
//     노출된다(헬퍼 노출=보안). 여기 함수들은 서버 측 일반 함수(호출자가 requireOwner·auditLog 책임).
//   cascade 를 복붙·재구현하지 않고 여기 한 곳으로 추출 — pts_has_source·insights A3 두 CHECK 가드가
//   과거 여러 번 고친 함정이라, 중복되면 한쪽만 갱신돼 재발한다.

import type { Supa } from "../../pipeline/runState.js";
import { cleanupRetrospectives } from "../../agents/retrospectivist/runRetrospective.js";

/**
 * provenance(profile_training_sources) 선 정리 — contents 삭제 전에 호출.
 *   contents 삭제 → ab_variants·performance_metrics 가 캐스케이드 삭제 → pts 의 ab_variant_id/metric_id 가
 *   `ON DELETE SET NULL`(migration 06). 그 출처가 pts 행의 '유일' 출처였으면 num_nonnulls=0 →
 *   `pts_has_source`(출처≥1) CHECK 위반으로 contents 삭제 트랜잭션 전체가 롤백된다(/copy-learn 재학습이 ab_variant_id를 채운 뒤 발생).
 *   → 유일 출처가 되는 pts 행을 먼저 삭제한다(다중 출처 행은 DB SET NULL 에 맡김 — CHECK 안 깨짐).
 *   cleanupRetrospectives 의 'detach 먼저' 패턴과 동일 클래스. 멱등(대상 없으면 no-op).
 */
export async function detachOrphanTrainingSources(supa: Supa, contentId: string): Promise<void> {
  const [{ data: vars }, { data: metrics }] = await Promise.all([
    supa.from("ab_variants").select("id").eq("content_id", contentId),
    supa.from("performance_metrics").select("id").eq("content_id", contentId),
  ]);
  const varIds = (vars ?? []).map((v) => v.id);
  const metricIds = (metrics ?? []).map((m) => m.id);
  if (varIds.length === 0 && metricIds.length === 0) return;

  const filters: string[] = [];
  if (varIds.length) filters.push(`ab_variant_id.in.(${varIds.join(",")})`);
  if (metricIds.length) filters.push(`metric_id.in.(${metricIds.join(",")})`);
  const { data: pts, error } = await supa
    .from("profile_training_sources")
    .select("id, edition_id, component_id, ab_variant_id, metric_id")
    .or(filters.join(","));
  if (error) throw new Error(`provenance 조회 실패: ${error.message}`);

  // 이 콘텐츠의 출처가 사라지면 출처 0개가 되는(=유일 출처) 행만 삭제.
  const orphanIds = (pts ?? [])
    .filter((r) => [r.edition_id, r.component_id, r.ab_variant_id, r.metric_id].filter((x) => x !== null && x !== undefined).length === 1)
    .map((r) => r.id);
  if (orphanIds.length === 0) return;
  const { error: de } = await supa.from("profile_training_sources").delete().in("id", orphanIds);
  if (de) throw new Error(`provenance 정리 실패: ${de.message}`);
}

/**
 * produced content 1건 하드 삭제(+캐스케이드). detach→cleanup→delete(source='produced' 가드).
 *   - DB 캐스케이드로 run + 모든 자식(제안·선택·리서치·대본·lineage·비용·content_links) 제거.
 *   - ★ imported(참조용 기존편)는 source 가드로 절대 삭제 안 됨.
 *   - ★ 삭제 전 두 CHECK 충돌을 선제 정리:
 *       ① detachOrphanTrainingSources — pts_has_source(provenance 고아 행).
 *       ② cleanupRetrospectives — retrospectives 캐스케이드 삭제 시 insights.source_retrospective_id SET NULL 이
 *          A3 CHECK(insights_retro_consistent: retro FK ⇔ source_type='retrospective')와 충돌하는 것 방지
 *          (draft 회고-insight 삭제·승격분은 human_authored 로 detach 보존 후 retrospectives 선삭제).
 *   - 반환 deleted = 실제 삭제 행수(0이면 미존재 or produced 아님). 멱등.
 *   - auditLog·requireOwner 는 호출자 책임 — 이 모듈은 순수 DB 시퀀스.
 */
export async function deleteProducedContent(supa: Supa, contentId: string): Promise<{ deleted: number }> {
  await detachOrphanTrainingSources(supa, contentId); // pts_has_source CHECK 충돌 선제 방어.
  await cleanupRetrospectives(supa, contentId); // insights_retro_consistent(A3) CHECK 충돌 선제 방어(승격분 보존).
  const { data: del, error: de } = await supa
    .from("contents")
    .delete()
    .eq("id", contentId)
    .eq("source", "produced") // 안전장치: produced만 삭제(기존편/참조 보호)
    .select("id");
  if (de) throw new Error(`삭제 실패: ${de.message}`);
  return { deleted: del?.length ?? 0 };
}

/** 'YYYY-MM-DD' 형식 검증(순수 — 테스트 import 용). trim 은 호출자가 한다(이 함수는 받은 문자열만 판정). */
export function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
