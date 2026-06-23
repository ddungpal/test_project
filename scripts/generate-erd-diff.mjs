// ERD 개선 사이클 diff — 고립 테이블 4건 해결 전/후(AS-IS / TO-BE)를 한 장에.
// 좌표 기반 SVG(손좌표 오류 방지). 생성: node scripts/generate-erd-diff.mjs
import { writeFileSync } from "node:fs";

// ── 공유 레이아웃(두 패널 동일 좌표) ──
const W = 150, H = 40;
const NODE = (id, cx, cy, layer, key, w = W, h = H) => ({ id, cx, cy, layer, key, w, h });
const NODES = [
  NODE("contents", 300, 250, "core", "콘텐츠 단일 척추", 168, 50),
  NODE("retrospectives", 300, 422, "l3", "회고"),
  NODE("insights", 92, 104, "l3", "운영 원칙(승격 종착점)"),
  NODE("transcripts", 92, 280, "l1", "유튜브 자막"),
  NODE("comments_raw", 92, 422, "l1", "댓글(범채널 풀)"),
  NODE("script_imports", 506, 104, "l1", "구글독스 과거 대본"),
  NODE("run_state_transitions", 506, 300, "cfg", "전이 화이트리스트(룩업)"),
];
const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

const LAYER = {
  core: { stroke: "#F8F082", fill: "#1d1d12", w: 2.6 },
  l1: { stroke: "#6f8fbf", fill: "#14181d", w: 1.5 },
  l2: { stroke: "#cfcfcf", fill: "#1a1a1a", w: 1.5 },
  l3: { stroke: "#7ad17a", fill: "#131a13", w: 1.5 },
  cfg: { stroke: "#777", fill: "#171717", w: 1.3 },
};

// ── 박스 경계 부착점(상대 노드 방향) ──
function border(n, tx, ty) {
  const dx = tx - n.cx, dy = ty - n.cy, hw = n.w / 2, hh = n.h / 2;
  if (dx === 0) return { x: n.cx, y: n.cy + Math.sign(dy) * hh };
  if (dy === 0) return { x: n.cx + Math.sign(dx) * hw, y: n.cy };
  const s = Math.min(hw / Math.abs(dx), hh / Math.abs(dy));
  return { x: n.cx + dx * s, y: n.cy + dy * s };
}

function edgePath(childId, parentId, color, kind) {
  const a = byId[childId], b = byId[parentId];
  const p1 = border(a, b.cx, b.cy), p2 = border(b, a.cx, a.cy);
  const mx = (p1.x + p2.x) / 2;
  const path = `M${p1.x},${p1.y} C${mx},${p1.y} ${mx},${p2.y} ${p2.x},${p2.y}`;
  const dash = kind === "new" ? "" : ' stroke-dasharray="3 3"';
  const wdt = kind === "new" ? 2.2 : 1.4;
  const op = kind === "new" ? 0.95 : 0.6;
  let s = `<path d="${path}" fill="none" stroke="${color}" stroke-width="${wdt}" opacity="${op}"${dash}/>`;
  s += `<circle cx="${p2.x}" cy="${p2.y}" r="3" fill="${color}" opacity="${op}"/>`; // parent(1)
  const lx = p1.x + (p1.x < p2.x ? 6 : -6);
  s += `<text x="${lx}" y="${p1.y - 4}" text-anchor="${p1.x < p2.x ? "start" : "end"}" font-size="9.5" fill="${color}" font-family="ui-monospace,Menlo,monospace">N</text>`;
  return s;
}

function nodeSvg(n, opts = {}) {
  const L = LAYER[n.layer];
  const x = n.cx - n.w / 2, y = n.cy - n.h / 2;
  const dim = opts.removed ? ' opacity="0.32"' : "";
  const dash = opts.isolated ? ' stroke-dasharray="5 3"' : "";
  let s = `<g${dim}>`;
  s += `<rect x="${x}" y="${y}" width="${n.w}" height="${n.h}" rx="3" fill="${L.fill}" stroke="${L.stroke}" stroke-width="${L.w}"${dash}/>`;
  s += `<text x="${n.cx}" y="${n.cy - 2}" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="12" font-weight="700" fill="#fff">${n.id}</text>`;
  s += `<text x="${n.cx}" y="${n.cy + 11}" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="8.5" fill="#9a9a9a">${n.key}</text>`;
  // 태그(상단 배지)
  if (opts.tag) {
    const tw = opts.tag.text.length * 7 + 14;
    s += `<rect x="${n.cx - tw / 2}" y="${y - 17}" width="${tw}" height="15" rx="7.5" fill="${opts.tag.bg}"/>`;
    s += `<text x="${n.cx}" y="${y - 6}" text-anchor="middle" font-size="9" font-weight="700" fill="${opts.tag.fg}" font-family="-apple-system,sans-serif">${opts.tag.text}</text>`;
  }
  if (opts.removed) {
    s += `<line x1="${x}" y1="${y}" x2="${x + n.w}" y2="${y + n.h}" stroke="#ff5b5b" stroke-width="2"/>`;
    s += `<line x1="${x + n.w}" y1="${y}" x2="${x}" y2="${y + n.h}" stroke="#ff5b5b" stroke-width="2"/>`;
  }
  s += `</g>`;
  return s;
}

const VBW = 600, VBH = 500;
const RED = { bg: "#3a1414", fg: "#ff8a8a" };
const GRN = { bg: "#14301a", fg: "#9be8a8" };
const GRY = { bg: "#222", fg: "#aaa" };

// ── AS-IS: 회고만 연결, 나머지 4개 + 룩업 고립 ──
function buildAsIs() {
  let e = edgePath("retrospectives", "contents", "#cccccc", "old");
  let n = "";
  n += nodeSvg(byId["contents"]);
  n += nodeSvg(byId["retrospectives"]);
  n += nodeSvg(byId["insights"], { isolated: true, tag: { text: "고립", ...RED } });
  n += nodeSvg(byId["transcripts"], { isolated: true, tag: { text: "고립", ...RED } });
  n += nodeSvg(byId["comments_raw"], { isolated: true, tag: { text: "고립", ...RED } });
  n += nodeSvg(byId["script_imports"], { isolated: true, tag: { text: "고립·미사용", ...RED } });
  n += nodeSvg(byId["run_state_transitions"], { isolated: true, tag: { text: "룩업", ...GRY } });
  return `<svg viewBox="0 0 ${VBW} ${VBH}" role="img" aria-label="AS-IS"><g stroke-linecap="round">${e}</g>${n}</svg>`;
}

// ── TO-BE: 4개 FK 신규 연결, script_imports 드롭 ──
function buildToBe() {
  let e = edgePath("retrospectives", "contents", "#cccccc", "old");
  e += edgePath("transcripts", "contents", "#7ad17a", "new");
  e += edgePath("comments_raw", "contents", "#7ad17a", "new");
  e += edgePath("insights", "contents", "#7ad17a", "new");
  e += edgePath("insights", "retrospectives", "#7ad17a", "new");
  let n = "";
  n += nodeSvg(byId["contents"]);
  n += nodeSvg(byId["retrospectives"]);
  n += nodeSvg(byId["insights"], { tag: { text: "+provenance FK", ...GRN } });
  n += nodeSvg(byId["transcripts"], { tag: { text: "+content_id FK", ...GRN } });
  n += nodeSvg(byId["comments_raw"], { tag: { text: "+content_id FK", ...GRN } });
  n += nodeSvg(byId["script_imports"], { removed: true, tag: { text: "DROP", ...RED } });
  n += nodeSvg(byId["run_state_transitions"], { tag: { text: "정상·유지", ...GRY } });
  return `<svg viewBox="0 0 ${VBW} ${VBH}" role="img" aria-label="TO-BE"><g stroke-linecap="round">${e}</g>${n}</svg>`;
}

// ── 변경 요약 행 ──
const CHANGES = [
  { t: "script_imports", layer: "l1", verdict: "드롭", vc: RED, why: "코드 0회 사용 + 링크키 0(외부 ref 텍스트뿐). corpus_editions가 이미 역할 대체 → 죽은/중복 테이블 제거." },
  { t: "insights", layer: "l3", verdict: "FK 2개 추가", vc: GRN, why: "학습루프 종착점인데 provenance 0. <code>source_retrospective_id</code>·<code>source_content_id</code> 추가 → '무엇이 이 인사이트를 낳았나' 역추적." },
  { t: "transcripts", layer: "l1", verdict: "FK 승격", vc: GRN, why: "youtube_video_id(text) 느슨연결 → <code>content_id</code> FK. 불변 트리거 일시해제 후 백필. L1 불변성 위해 on delete restrict." },
  { t: "comments_raw", layer: "l1", verdict: "FK 승격", vc: GRN, why: "youtube_video_id(text) → <code>content_id</code> FK(거버넌스 귀속). 트리거 없어 직접 백필. 통계 풀 보존 위해 on delete set null." },
  { t: "run_state_transitions", layer: "cfg", verdict: "변경 없음", vc: GRY, why: "전이 화이트리스트 룩업 테이블. enum처럼 FK가 원래 불필요 — 의도된 단독(정상)." },
];

let rows = "";
for (const c of CHANGES) {
  const sw = LAYER[c.layer].stroke;
  rows += `<div class="crow">
    <div class="ct"><span class="dot" style="background:${sw}"></span><code>${c.t}</code></div>
    <div class="cv"><span class="vbadge" style="background:${c.vc.bg};color:${c.vc.fg}">${c.verdict}</span></div>
    <div class="cw">${c.why}</div></div>`;
}

const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ERD 개선 — 고립 테이블 연결 (Before / After)</title>
<style>
:root{--bg:#121212;--paper:#fff;--yellow:#F8F082;--line:#2a2a2a;--muted:#9a9a9a}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--paper);font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard",sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased;padding:0 0 80px}
.wrap{max-width:1240px;margin:0 auto;padding:0 24px}
header{border-bottom:3px solid var(--yellow);padding:52px 0 26px}
.kicker{color:var(--yellow);font-weight:800;letter-spacing:.18em;font-size:12px;text-transform:uppercase}
h1{font-size:40px;font-weight:900;line-height:1.08;margin:14px 0 10px;letter-spacing:-.02em}
h1 .hl{color:var(--yellow)}
.sub{color:var(--muted);font-size:15px;max-width:820px}
.panels{display:flex;gap:18px;flex-wrap:wrap;margin-top:26px}
.panel{flex:1 1 460px;border:1px solid var(--line);background:#141414}
.ptitle{display:flex;align-items:center;gap:10px;padding:13px 18px;border-bottom:1px solid var(--line);font-weight:800;font-size:15px}
.ptitle .badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:10px}
.asis .badge{background:#3a1414;color:#ff8a8a}
.tobe .badge{background:#14301a;color:#9be8a8}
.pbody{padding:8px}
svg{display:block;width:100%;height:auto}
.legend{display:flex;gap:18px;flex-wrap:wrap;margin-top:18px;font-size:12.5px;color:#cfcfcf;align-items:center}
.legend .it{display:flex;align-items:center;gap:7px}
.ln{width:26px;height:0;border-top:2px solid;display:inline-block}
section{margin:48px 0 0}
.secnum{color:var(--yellow);font-weight:900;font-size:13px;letter-spacing:.1em}
h2{font-size:25px;font-weight:900;margin:6px 0 16px}
.ctable{border:1px solid var(--line)}
.crow{display:grid;grid-template-columns:200px 130px 1fr;gap:14px;padding:14px 18px;border-bottom:1px solid #1f1f1f;align-items:start;font-size:13px}
.crow:last-child{border-bottom:none}
.ct{display:flex;align-items:center;gap:8px}
.ct code{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:#fff}
.dot{width:11px;height:11px;border-radius:2px;flex:0 0 auto}
.vbadge{font-size:11px;font-weight:800;padding:3px 10px;border-radius:10px;white-space:nowrap}
.cw{color:#bdbdbd}
.cw code{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--yellow);background:#1f1f1f;padding:1px 5px;border-radius:2px}
@media(max-width:720px){.crow{grid-template-columns:1fr;gap:6px}}
footer{margin-top:50px;border-top:1px solid var(--line);padding-top:20px;color:var(--muted);font-size:12px}
footer b{color:#fff}
</style></head><body><div class="wrap">
<header>
<div class="kicker">ERD 개선 사이클 · ②해결 → ③변화</div>
<h1>고립 테이블을 <span class="hl">척추에 다시 잇다</span></h1>
<p class="sub">현재 30개 테이블 중 5개가 FK 그래프에서 고립. 그중 <b>4개를 연결</b>하고 <b>1개(룩업)는 의도된 단독</b>으로 유지한다. 왼쪽이 현재(AS-IS), 오른쪽이 migration 17 적용 후(TO-BE). 초록 굵은 선 = 신규 FK, 빨강 ✕ = 드롭.</p>
<div class="legend">
<span class="it"><span class="ln" style="border-color:#7ad17a"></span> 신규 FK(추가)</span>
<span class="it"><span class="ln" style="border-color:#ccc;border-top-style:dashed"></span> 기존 FK</span>
<span class="it"><span style="color:#ff8a8a;font-weight:700">✕</span> 드롭</span>
<span class="it">● = 부모(1) · N = 자식(다)</span>
</div>
</header>
<div class="panels">
  <div class="panel asis">
    <div class="ptitle"><span class="badge">AS-IS</span> 현재 — 고립 5개</div>
    <div class="pbody">${buildAsIs()}</div>
  </div>
  <div class="panel tobe">
    <div class="ptitle"><span class="badge">TO-BE</span> migration 17 적용 후</div>
    <div class="pbody">${buildToBe()}</div>
  </div>
</div>
<section>
<div class="secnum">변경 요약</div>
<h2>테이블별 처리와 근거</h2>
<div class="ctable">${rows}</div>
</section>
<footer>
<div><b>읽는 법.</b> 박스=테이블(색=레이어: 파랑 L1 / 초록 L3 / 노랑 Core 척추 / 회색 Config). <code>contents</code>가 콘텐츠 단일 척추. AS-IS에서 점선 테두리=고립. TO-BE의 초록 선이 migration 17이 새로 잇는 FK다. <b>run_state_transitions</b>는 전이 화이트리스트(룩업)라 FK 없이 단독이 정상.</div>
</footer>
</div></body></html>`;

writeFileSync(new URL("../erd-database-diff.html", import.meta.url), html);
console.log("✓ erd-database-diff.html 생성 — AS-IS/TO-BE 비교 (고립 5 → 연결 4 + 룩업 1)");
