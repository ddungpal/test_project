import { getAuditLog, type AuditView } from "@/lib/dashboard/auditView";
import { isDevBypass, requireOwnerPage } from "@/app/actions/auth";

// 감사 로그(migration 20) — 사람 게이트 결정 이력(선택·승인·변경). owner 전용.
export const dynamic = "force-dynamic";

function fmt(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

function detailText(detail: AuditView["detail"]): string {
  if (detail === null || typeof detail !== "object") return "";
  const o = detail as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof o.stage === "string") parts.push(`단계 ${o.stage}`);
  if (typeof o.chosenIdx === "number") parts.push(`#${o.chosenIdx} 선택`);
  if (o.from !== undefined && o.to !== undefined) parts.push(`${o.from} → ${o.to}`);
  if (typeof o.approved === "number") parts.push(`승인 ${o.approved}건`);
  if (typeof o.reason === "string") parts.push(o.reason);
  if (Array.isArray(o.fields)) parts.push(`수정: ${o.fields.join(", ")}`);
  if (typeof o.topic === "string") parts.push(o.topic);
  return parts.join(" · ") || JSON.stringify(detail);
}

export default async function AuditPage() {
  await requireOwnerPage();
  const [entries, devBypass] = await Promise.all([getAuditLog(150), isDevBypass()]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      {devBypass && (
        <div className="mb-6 border border-trus-yellow/40 px-3 py-2 text-xs text-trus-yellow/80">
          ⚠ 개발용 owner 바이패스 활성 — 로그인 없이 owner 권한으로 동작 중.
        </div>
      )}

      <h1 className="text-3xl font-black leading-tight">
        감사 <span className="text-trus-yellow">로그</span>
      </h1>
      <p className="mt-2 text-sm text-trus-white/60">
        김짠부가 내린 <b className="text-trus-white">선택·승인·변경</b> 이력. 학습·책임 추적용.
      </p>

      {entries.length === 0 ? (
        <p className="mt-10 border border-dashed border-trus-white/20 px-4 py-8 text-center text-sm text-trus-white/40">
          아직 기록된 감사 로그가 없습니다. (migration 20 적용 후 사람 게이트 동작부터 쌓입니다.)
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-1.5">
          {entries.map((e) => (
            <li key={e.id} className="flex items-baseline gap-3 border border-trus-white/12 px-4 py-2.5 text-sm">
              <span className="shrink-0 border border-trus-yellow/40 px-1.5 py-0.5 text-xs font-bold text-trus-yellow/80">{e.actionLabel}</span>
              <span className="min-w-0 flex-1 truncate text-trus-white/70">
                {e.targetType && <span className="text-trus-white/40">{e.targetType} </span>}
                {detailText(e.detail)}
              </span>
              <span className="shrink-0 text-xs text-trus-white/40">{e.actorName ?? "—"}</span>
              <span className="shrink-0 font-mono text-xs text-trus-white/35">{fmt(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
