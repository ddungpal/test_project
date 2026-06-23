// DB ERD 생성기 — 마이그레이션에서 추출한 실제 FK 그래프를 좌표 기반 SVG로. 손좌표 오류 방지.
import { writeFileSync } from "node:fs";

// ── 노드(테이블): col(x밴드)·y(px)·layer(색)·key(주요 컬럼) ──
const COLX = [120, 415, 715, 1015];
const W = 158, H = 34; // 박스 크기
const N = (id, col, y, layer, key) => ({ id, col, y, layer, key, x: COLX[col] });

const NODES = [
  // col0 — 루트(FK 없음/거의 없음)
  N("auth.users", 0, 70, "ext", "Supabase Auth"),
  N("run_state_transitions", 0, 150, "cfg", "from→to (전이 화이트리스트)"),
  N("contents", 0, 320, "core", "콘텐츠 단일 척추 · imported/produced"),
  N("transcripts", 0, 470, "l1", "유튜브 자막 · content_id FK"),
  N("comments_raw", 0, 560, "l1", "댓글 · content_id FK"),
  N("tone_profile", 0, 672, "l3", "짠펜 말투"),
  N("style_profiles", 0, 736, "l3", "제목/썸네일 스타일"),
  // col1 — col0 참조
  N("profiles", 1, 70, "cfg", "owner(김짠부)"),
  N("topic_interviews", 1, 150, "l1", "왜 골랐나(주관식)"),
  N("content_links", 1, 218, "core", "새 편 → 참조 기존편"),
  N("production_runs", 1, 320, "core", "편 1회 실행 · 상태머신 · cost_usd"),
  N("script_segments", 1, 410, "l2", "대본 문장(lineage 핵심)"),
  N("topic_candidates", 1, 476, "l2", "촉이 발굴 풀"),
  N("performance_metrics", 1, 544, "l2", "업로드 성과"),
  N("retrospectives", 1, 612, "l3", "회고"),
  N("corpus_editions", 1, 686, "l3", "롤링 독스 → 편"),
  N("ab_variants", 1, 750, "l3", "썸네일/제목 A·B·C"),
  // col2 — col1 참조
  N("config_registry", 2, 70, "cfg", "정적-A 설정(DB)"),
  N("source_documents", 2, 230, "l1", "페치 원문 스냅샷(불변)"),
  N("stage_proposals", 2, 320, "l2", "단계별 AI 후보 N + 이유"),
  N("research_facts", 2, 408, "l2", "검증된 사실(무결성·신선도)"),
  N("explanation_assets", 2, 478, "l2", "숫자예시·비유"),
  N("cost_ledger", 2, 548, "l2", "편당 실비 원장"),
  N("insights", 2, 618, "l3", "운영 원칙 · provenance FK"),
  N("corpus_components", 2, 720, "l3", "편 → 컴포넌트별 학습"),
  // col3 — col2 참조
  N("source_parses", 3, 230, "l1", "파싱 결과(가변)"),
  N("stage_selections", 3, 320, "l2", "사람 선택+수정+이유 = 학습신호"),
  N("script_segment_facts", 3, 408, "l2", "문장 ↔ fact (조인)"),
  N("script_segment_explanation_assets", 3, 478, "l2", "문장 ↔ 자산 (조인)"),
  N("profile_training_sources", 3, 640, "l3", "provenance: 무엇이 프로파일을 학습?"),
];
const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

// ── 엣지(FK): [child, parent, hub] — hub로 색 구분 ──
const E = (c, p, hub = "") => ({ c, p, hub });
const EDGES = [
  E("production_runs", "contents", "contents"),
  E("profiles", "auth.users"),
  E("transcripts", "contents", "contents"),
  E("comments_raw", "contents", "contents"),
  E("insights", "contents", "contents"),
  E("insights", "retrospectives"),
  E("topic_interviews", "contents", "contents"),
  E("content_links", "contents", "contents"),
  E("script_segments", "contents", "contents"),
  E("script_segments", "production_runs", "runs"),
  E("topic_candidates", "contents", "contents"),
  E("performance_metrics", "contents", "contents"),
  E("retrospectives", "contents", "contents"),
  E("corpus_editions", "contents", "contents"),
  E("ab_variants", "contents", "contents"),
  E("config_registry", "profiles"),
  E("source_documents", "production_runs", "runs"),
  E("stage_proposals", "production_runs", "runs"),
  E("research_facts", "production_runs", "runs"),
  E("research_facts", "source_documents"),
  E("explanation_assets", "production_runs", "runs"),
  E("explanation_assets", "research_facts"),
  E("cost_ledger", "production_runs", "runs"),
  E("corpus_components", "corpus_editions"),
  E("source_parses", "source_documents"),
  E("stage_selections", "stage_proposals"),
  E("stage_selections", "profiles"),
  E("script_segment_facts", "script_segments"),
  E("script_segment_facts", "research_facts"),
  E("script_segment_explanation_assets", "script_segments"),
  E("script_segment_explanation_assets", "explanation_assets"),
  E("profile_training_sources", "tone_profile", "prov"),
  E("profile_training_sources", "style_profiles", "prov"),
  E("profile_training_sources", "corpus_editions", "prov"),
  E("profile_training_sources", "corpus_components", "prov"),
  E("profile_training_sources", "ab_variants", "prov"),
  E("profile_training_sources", "performance_metrics", "prov"),
];

const LAYER = {
  core: { stroke: "#F8F082", fill: "#1d1d12", w: 2.4 },
  l1: { stroke: "#6f8fbf", fill: "#14181d", w: 1.4 },
  l2: { stroke: "#cfcfcf", fill: "#1a1a1a", w: 1.4 },
  l3: { stroke: "#7ad17a", fill: "#131a13", w: 1.4 },
  cfg: { stroke: "#777", fill: "#171717", w: 1.2 },
  ext: { stroke: "#555", fill: "#161616", w: 1.2 },
};
const HUB = { contents: "#F8F082", runs: "#cccccc", prov: "#7ad17a", "": "#5a5a5a" };

// ── SVG 빌드 ──
const VBW = 1180, VBH = 800;
let edgeSvg = "", nodeSvg = "";

for (const { c, p, hub } of EDGES) {
  const a = byId[c], b = byId[p];
  if (!a || !b) continue;
  const color = HUB[hub] ?? "#5a5a5a";
  const dash = hub === "prov" ? ' stroke-dasharray="4 3"' : "";
  const op = hub === "prov" ? 0.55 : hub ? 0.9 : 0.5;
  let x1, y1, x2, y2, path;
  if (a.col > b.col) {
    // child 오른쪽 → parent 왼쪽: child.left → parent.right (좌향 직선)
    x1 = a.x - W / 2; y1 = a.y; x2 = b.x + W / 2; y2 = b.y;
    const mx = (x1 + x2) / 2;
    path = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  } else {
    // 같은 컬럼: 왼쪽으로 불룩한 곡선(박스 본체 비껴가게)
    x1 = a.x - W / 2; y1 = a.y; x2 = b.x - W / 2; y2 = b.y;
    const bx = Math.min(x1, x2) - 46;
    path = `M${x1},${y1} C${bx},${y1} ${bx},${y2} ${x2},${y2}`;
  }
  edgeSvg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.3" opacity="${op}"${dash}/>`;
  // parent 끝(1) 점 + child 끝(N) 막대
  edgeSvg += `<circle cx="${x2}" cy="${y2}" r="2.6" fill="${color}" opacity="${op}"/>`;
  edgeSvg += `<text x="${x1 + (a.col > b.col ? -2 : -6)}" y="${y1 - 4}" text-anchor="end" font-size="9" fill="${color}" opacity="${Math.min(1, op + 0.2)}" font-family="ui-monospace,Menlo,monospace">N</text>`;
}

for (const n of NODES) {
  const L = LAYER[n.layer];
  const x = n.x - W / 2, y = n.y - H / 2;
  nodeSvg += `<g>`;
  nodeSvg += `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="3" fill="${L.fill}" stroke="${L.stroke}" stroke-width="${L.w}"/>`;
  nodeSvg += `<text x="${n.x}" y="${n.y + 1}" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="11.5" font-weight="700" fill="#fff">${n.id}</text>`;
  nodeSvg += `<text x="${n.x}" y="${n.y + 13}" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="8" fill="#8f8f8f">${n.key}</text>`;
  nodeSvg += `</g>`;
}

const svg = `<svg viewBox="0 0 ${VBW} ${VBH}" role="img" aria-label="데이터베이스 ERD">
<g stroke-linecap="round">${edgeSvg}</g>
${nodeSvg}
</svg>`;

// ── 레이어별 카드(설명) ──
const LAYER_META = [
  { key: "core", name: "Core 척추", color: "#F8F082", desc: "편(run)과 콘텐츠가 모든 것의 중심. 두 허브(contents·production_runs)에 거의 모든 테이블이 매달린다." },
  { key: "l1", name: "L1 Raw (불변 원천)", color: "#6f8fbf", desc: "수집 원본. 자막·댓글은 youtube_video_id(text)로 느슨 연결, 페치 원문은 run에 FK." },
  { key: "l2", name: "L2 Pipeline (편별 산출)", color: "#cfcfcf", desc: "한 편이 도는 동안 생기는 제안·검증·대본. lineage(문장↔근거)는 조인 테이블로 정규화." },
  { key: "l3", name: "L3 Knowledge (학습·코퍼스)", color: "#7ad17a", desc: "말투·스타일·회고·성과. provenance 허브가 '무엇이 이 프로파일을 학습시켰나'를 추적." },
  { key: "cfg", name: "Config · Auth", color: "#777", desc: "설정·인증·전이 화이트리스트(룩업)." },
];
const childrenOf = (pid) => EDGES.filter((e) => e.p === pid).map((e) => e.c);
const fkOf = (cid) => EDGES.filter((e) => e.c === cid).map((e) => e.p);

let cards = "";
for (const lm of LAYER_META) {
  const ns = NODES.filter((n) => n.layer === lm.key && n.id !== "auth.users");
  if (!ns.length) continue;
  let rows = "";
  for (const n of ns) {
    const fks = fkOf(n.id);
    const fkTxt = fks.length ? fks.map((f) => `→ <code>${f}</code>`).join(" ") : '<span class="root">루트(FK 없음)</span>';
    rows += `<div class="trow"><div class="tn"><code>${n.id}</code><small>${n.key}</small></div><div class="fk">${fkTxt}</div></div>`;
  }
  cards += `<div class="lcard" style="border-left-color:${lm.color}">
    <div class="lh"><span class="ld" style="background:${lm.color}"></span><b>${lm.name}</b><span class="cnt">${ns.length} 테이블</span></div>
    <p class="ldesc">${lm.desc}</p>${rows}</div>`;
}

const totalTables = NODES.filter((n) => n.id !== "auth.users").length;
const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Database ERD — 테이블 관계도</title>
<style>
:root{--bg:#121212;--paper:#fff;--yellow:#F8F082;--line:#2a2a2a;--muted:#9a9a9a}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--paper);font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard",sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased;padding:0 0 80px}
.wrap{max-width:1240px;margin:0 auto;padding:0 24px}
header{border-bottom:3px solid var(--yellow);padding:52px 0 26px}
.kicker{color:var(--yellow);font-weight:800;letter-spacing:.18em;font-size:12px;text-transform:uppercase}
h1{font-size:42px;font-weight:900;line-height:1.07;margin:14px 0 10px;letter-spacing:-.02em}
h1 .hl{color:var(--yellow)}
.sub{color:var(--muted);font-size:15px;max-width:780px}
.legend{display:flex;gap:18px;flex-wrap:wrap;margin-top:20px;font-size:12.5px;color:#cfcfcf;align-items:center}
.legend .it{display:flex;align-items:center;gap:7px}
.sw{width:24px;height:14px;border-radius:2px;display:inline-block}
.ln{width:26px;height:0;border-top:2px solid;display:inline-block}
.diagram{border:1px solid var(--line);background:#141414;margin-top:20px;padding:10px;overflow-x:auto}
svg{display:block;min-width:1080px;width:100%;height:auto}
section{margin:50px 0 0}
.secnum{color:var(--yellow);font-weight:900;font-size:13px;letter-spacing:.1em}
h2{font-size:26px;font-weight:900;margin:6px 0 4px}
.lead{color:var(--muted);font-size:14px;margin-bottom:20px;max-width:760px}
.lcards{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
@media(max-width:840px){.lcards{grid-template-columns:1fr}}
.lcard{border:1px solid var(--line);border-left:4px solid var(--yellow);padding:16px 18px}
.lh{display:flex;align-items:center;gap:9px;margin-bottom:4px}
.lh b{font-size:16px}
.ld{width:11px;height:11px;border-radius:2px}
.cnt{margin-left:auto;font-size:11px;color:var(--muted)}
.ldesc{font-size:12.5px;color:var(--muted);margin-bottom:12px}
.trow{display:flex;gap:12px;padding:7px 0;border-bottom:1px solid #1f1f1f;font-size:12.5px;align-items:baseline}
.trow:last-child{border-bottom:none}
.tn{flex:0 0 44%}
.tn code{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#fff;background:#1f1f1f;padding:1px 6px;border-radius:2px}
.tn small{display:block;color:#8f8f8f;font-size:10.5px;margin-top:3px}
.fk{flex:1;color:#bdbdbd}
.fk code{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--yellow)}
.root{color:#666;font-style:italic}
footer{margin-top:54px;border-top:1px solid var(--line);padding-top:20px;color:var(--muted);font-size:12px}
footer b{color:#fff}
</style></head><body><div class="wrap">
<header>
<div class="kicker">Database ERD · produce script</div>
<h1>테이블은 어떻게 <span class="hl">연결되는가</span></h1>
<p class="sub">${totalTables}개 테이블, ${EDGES.length}개 외래키(FK) 관계를 마이그레이션에서 직접 추출해 한 장으로. 화살표는 <b>자식 → 부모</b>(FK 방향), 끝점 ●가 부모(1)·라벨 N이 자식(다)이다. 왼쪽일수록 의존의 뿌리 — 모든 길은 <b>contents</b>와 <b>production_runs</b>로 모인다.</p>
<div class="legend">
<span class="it"><span class="sw" style="background:#1d1d12;border:2px solid #F8F082"></span> Core 척추</span>
<span class="it"><span class="sw" style="background:#14181d;border:1.5px solid #6f8fbf"></span> L1 Raw</span>
<span class="it"><span class="sw" style="background:#1a1a1a;border:1.5px solid #cfcfcf"></span> L2 Pipeline</span>
<span class="it"><span class="sw" style="background:#131a13;border:1.5px solid #7ad17a"></span> L3 Knowledge</span>
<span class="it"><span class="sw" style="background:#171717;border:1.5px solid #777"></span> Config/Auth</span>
<span class="it"><span class="ln" style="border-color:#F8F082"></span> →contents</span>
<span class="it"><span class="ln" style="border-color:#ccc"></span> →production_runs</span>
<span class="it"><span class="ln" style="border-color:#7ad17a;border-top-style:dashed"></span> provenance</span>
</div>
</header>
<div class="diagram">${svg}</div>
<section>
<div class="secnum">레이어별</div>
<h2>각 테이블의 역할과 연결</h2>
<p class="lead">3층 데이터 구조(L1 raw 불변 / L2 structured 편별 / L3 knowledge 학습). 각 행: 테이블 → 어떤 부모를 FK로 참조하는지.</p>
<div class="lcards">${cards}</div>
</section>
<footer>
<div><b>읽는 법.</b> 박스=테이블(색=레이어) · 선=FK 관계(색=참조 대상 허브) · ●=부모(1) · N=자식(다). <code>contents</code>(콘텐츠 척추)와 <code>production_runs</code>(편 실행)가 두 허브이며, lineage(<code>script_segments</code>→facts/assets)와 provenance(<code>profile_training_sources</code>)는 배열 대신 조인 테이블로 정규화돼 근거를 역추적할 수 있다.</div>
</footer>
</div></body></html>`;

writeFileSync(new URL("../erd-database.html", import.meta.url), html);
console.log(`✓ erd-database.html 생성 — ${totalTables} 테이블 · ${EDGES.length} FK`);
