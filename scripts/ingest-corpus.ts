// 학습 코퍼스 ingest — 구글독스 export(.md) → corpus_editions/components 파싱.
//   순수 코드 파싱(AI 미사용, $0·결정적). tech.md §8.1(데이터 수집기로 AI 안 씀)·§13.2.
//
//   실행:
//     set -a; . ./.env; set +a
//     npx tsx scripts/ingest-corpus.ts            # dry-run: corpus/parsed/에 JSON + 요약만(DB 미반영)
//     npx tsx scripts/ingest-corpus.ts --commit    # 검수 후 DB INSERT(service-role, 불변 테이블)
//
//   구조(corpus/README.md): 1파일=1편 · 굵은 라벨(썸네일/제목/더보기란·고정댓글/스크립트) · 긴 구분선 분리
//                          · 썸네일/제목 변형 [N안] 또는 1.2.3. · Google Docs MD 노이즈 정리.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const RAW_DIR = "corpus/raw";
const OUT_DIR = "corpus/parsed";
const COMMIT = process.argv.includes("--commit");

type ComponentType = "title" | "thumbnail_copy" | "description" | "script";

interface ParsedComponent {
  type: ComponentType;
  variant_idx: number | null;
  is_final: boolean;
  content: string;
  char_count: number;
}
interface ParsedEdition {
  source_ref: string;
  edition_date: string | null;
  topic: string;
  youtube_video_id: string | null; // contents 척추 조인 키
  format: "info";
  is_long_form: true;
  sponsored: boolean;
  status: "done";
  date_inferred: boolean; // 골든 매핑(파일 내 날짜 없음) — 사람 확인용 플래그
  components: ParsedComponent[];
}

// 파일명 키워드 → 편 메타(골든 v1, 2026-06-17 동결) + youtube_video_id(사용자 제공 URL, 2026-06-18).
// 파일 내부에 날짜·영상ID가 없어 매핑으로 채움. video_id = contents 척추 조인 키(자막·댓글 매칭).
const EDITION_MAP: { match: string; date: string; topic: string; video_id: string }[] = [
  { match: "슈퍼 ISA", date: "2026-03-22", topic: "슈퍼 ISA", video_id: "PPfnJBFqJEA" },
  { match: "대출vs투자", date: "2026-04-06", topic: "대출 vs 투자", video_id: "2nWAvXHIlGs" },
  { match: "파킹통장", date: "2026-04-14", topic: "파킹통장", video_id: "zYBnZLfg6DM" },
  { match: "사회초년생", date: "2026-04-21", topic: "사회초년생 재테크 5단계", video_id: "faVfC98mt0c" },
  { match: "채권ETF", date: "2026-04-29", topic: "채권 ETF", video_id: "V1NE7th1ugU" },
  { match: "나스닥", date: "2026-05-26", topic: "나스닥100 룰 변경", video_id: "Qi3oWAmT9N8" },
  { match: "ETF투자 Q&A", date: "2026-06-05", topic: "ETF 투자 Q&A", video_id: "VXpUleIos1k" },
  { match: "ISA 3년 만기", date: "2026-06-09", topic: "ISA 3년 만기 전략", video_id: "5f8EtDUXgoQ" },
];

function lookupEdition(filename: string) {
  // macOS 파일명은 NFD(분해형) → 소스 리터럴(NFC)과 비교 위해 양쪽 NFC 정규화.
  const f = filename.normalize("NFC");
  return EDITION_MAP.find((e) => f.includes(e.match.normalize("NFC"))) ?? null;
}

// 굵은 라벨 정규화: ** 제거 + 이모지/공백/문장부호 제거 → 키워드만.
function labelKeyword(line: string): string {
  return line.replace(/\*/g, "").replace(/[^\p{L}\p{N}/]/gu, "");
}
function detectLabel(line: string): ComponentType | null {
  if (!line.trim().startsWith("**")) return null; // 라벨은 굵게
  const k = labelKeyword(line);
  if (k.length > 16) return null;
  if (k === "썸네일") return "thumbnail_copy";
  if (k === "제목") return "title";
  if (k.startsWith("더보기")) return "description"; // 더보기란/고정댓글
  if (k.includes("스크립트")) return "script"; // 스크립트 / 🎬스크립트
  return null;
}

const isDelimiter = (l: string) => /^[\s—–\-_=·]{6,}$/.test(l.trim());

// Google Docs MD 노이즈 정리: 이미지 placeholder·백슬래시 이스케이프·잉여 공백.
function clean(s: string): string {
  return s
    .normalize("NFC")                       // macOS NFD → NFC 정규화
    .replace(/^\[[^\]]+\]:\s*<[^\n]*>\s*$/gm, "") // MD 참조정의 [image1]: <data:image/png;base64,…> (문서끝 이미지)
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, "") // ![👉🏻][image1]
    .replace(/\\(?=[^\w\s])/g, "")          // \! \& \~ \# ...
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 썸네일/제목 변형 분리 — [N안] 또는 최상위 1.2.3. 번호.
function splitVariants(text: string): { variant_idx: number | null; content: string }[] {
  const lines = text.split("\n");
  const anRe = /^\s*\*{0,2}\[?\s*\d+\s*안\s*\]?\*{0,2}\s*$/;
  const anIdx = lines.map((l, i) => (anRe.test(l.replace(/\\/g, "")) ? i : -1)).filter((i) => i >= 0);
  const numRe = /^\s*(\d+)\.\s+\S/;
  const numIdx = lines.map((l, i) => (numRe.test(l) ? i : -1)).filter((i) => i >= 0);

  const sliceBy = (idxs: number[], dropMarker: boolean) =>
    idxs.map((start, k) => {
      const end = k + 1 < idxs.length ? idxs[k + 1] : lines.length;
      const body = lines.slice(dropMarker ? start + 1 : start, end).join("\n");
      return { variant_idx: k, content: clean(body) };
    });

  if (anIdx.length >= 2) return sliceBy(anIdx, true);   // [N안] 마커 줄은 버림
  if (numIdx.length >= 2) return sliceBy(numIdx, false); // "1." 은 내용에 포함
  const c = clean(text);
  return c ? [{ variant_idx: null, content: c }] : [];
}

function parseFile(filename: string): ParsedEdition {
  const raw = readFileSync(join(RAW_DIR, filename), "utf8");
  const lines = raw.split("\n");

  // 라벨 위치(각 타입 첫 등장, 등장 순서대로)
  const found: { type: ComponentType; idx: number }[] = [];
  lines.forEach((line, i) => {
    const t = detectLabel(line);
    if (t && !found.some((f) => f.type === t)) found.push({ type: t, idx: i });
  });
  found.sort((a, b) => a.idx - b.idx);

  const components: ParsedComponent[] = [];
  found.forEach((f, k) => {
    const next = found[k + 1];
    const end = next ? next.idx : lines.length;
    const sectionLines = lines.slice(f.idx + 1, end).filter((l) => !isDelimiter(l));
    const section = sectionLines.join("\n");

    if (f.type === "thumbnail_copy" || f.type === "title") {
      const variants = splitVariants(section);
      const multi = variants.length > 1;
      variants.forEach((v) =>
        components.push({
          type: f.type,
          variant_idx: multi ? v.variant_idx : null,
          is_final: !multi, // 변형이면 승자 미상(A/B 성과 ingest에서 확정), 단일이면 최종
          content: v.content,
          char_count: v.content.length,
        }),
      );
    } else {
      const content = clean(section);
      components.push({ type: f.type, variant_idx: null, is_final: true, content, char_count: content.length });
    }
  });

  const meta = lookupEdition(filename);
  return {
    source_ref: `gdoc-tab:${filename}`,
    edition_date: meta?.date ?? null,
    topic: meta?.topic ?? filename.replace(/\.md$/, ""),
    youtube_video_id: meta?.video_id ?? null,
    format: "info",
    is_long_form: true,
    sponsored: false,
    status: "done",
    date_inferred: !!meta,
    components,
  };
}

async function commitToDb(editions: ParsedEdition[]) {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  const db = createClient(url, key, { auth: { persistSession: false } });

  // 불변 테이블이라 기존 미연결 행이 있으면 재삽입 시 중복됨 → 먼저 비워야 함(SQL에디터 TRUNCATE).
  const { count: existing } = await db.from("corpus_editions").select("*", { count: "exact", head: true });
  if ((existing ?? 0) > 0) {
    throw new Error(
      `corpus_editions에 이미 ${existing}행 존재. 불변 테이블이라 UPDATE/DELETE 불가 → 재적재 전 SQL에디터에서\n` +
        `  truncate table public.corpus_components, public.corpus_editions;\n실행 후 다시 --commit 하세요.`,
    );
  }

  for (const ed of editions) {
    // 1) 척추: contents upsert(youtube_video_id 유일) — 자막·댓글이 같은 키로 매칭됨.
    const { data: cRow, error: e0 } = await db
      .from("contents")
      .upsert(
        {
          source: "imported",
          title: ed.topic,
          topic: ed.topic,
          format: ed.format,
          sponsored: ed.sponsored,
          status: "published",
          youtube_video_id: ed.youtube_video_id,
          upload_date: ed.edition_date,
        },
        { onConflict: "youtube_video_id" },
      )
      .select("id")
      .single();
    if (e0) throw new Error(`contents upsert 실패(${ed.topic}): ${e0.message}`);

    // 2) corpus_editions — content_id로 척추에 연결.
    const { data: edRow, error: e1 } = await db
      .from("corpus_editions")
      .insert({
        content_id: cRow.id,
        source_ref: ed.source_ref,
        edition_date: ed.edition_date,
        topic: ed.topic,
        format: ed.format,
        is_long_form: ed.is_long_form,
        sponsored: ed.sponsored,
        status: ed.status,
      })
      .select("id")
      .single();
    if (e1) throw new Error(`edition INSERT 실패(${ed.topic}): ${e1.message}`);

    const rows = ed.components.map((c) => ({
      edition_id: edRow.id,
      type: c.type,
      variant_idx: c.variant_idx,
      content: c.content,
      is_final: c.is_final,
    }));
    const { error: e2 } = await db.from("corpus_components").insert(rows);
    if (e2) throw new Error(`components INSERT 실패(${ed.topic}): ${e2.message}`);
    console.log(`   ✅ ${ed.topic} — contents(${ed.youtube_video_id}) 연결 + 컴포넌트 ${rows.length}개`);
  }
}

async function main() {
  const files = readdirSync(RAW_DIR).filter((f) => f.endsWith(".md"));
  if (files.length === 0) throw new Error(`${RAW_DIR}에 .md 없음`);

  const editions = files.map(parseFile);

  // 요약 출력
  console.log(`\n📚 파싱 결과 (${editions.length}편)\n`);
  const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - [...s].length));
  console.log(pad("편(topic)", 26) + pad("날짜", 12) + "썸네일 제목 더보기자 스크립트자");
  for (const ed of editions) {
    const th = ed.components.filter((c) => c.type === "thumbnail_copy").length;
    const ti = ed.components.filter((c) => c.type === "title").length;
    const de = ed.components.find((c) => c.type === "description")?.char_count ?? 0;
    const sc = ed.components.find((c) => c.type === "script")?.char_count ?? 0;
    const types = new Set(ed.components.map((c) => c.type));
    const missing = (["title", "thumbnail_copy", "description", "script"] as ComponentType[]).filter((t) => !types.has(t));
    const warn = missing.length ? `  ⚠️ 누락:${missing.join(",")}` : "";
    console.log(pad(ed.topic, 26) + pad(ed.edition_date ?? "??", 12) + `${pad(String(th) + "안", 6)} ${pad(String(ti) + "안", 4)} ${pad(String(de), 8)} ${sc}${warn}`);
  }

  // dry-run JSON 저장(검수용, gitignore)
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, "corpus-parsed.json");
  writeFileSync(outPath, JSON.stringify(editions, null, 2), "utf8");
  console.log(`\n📄 상세 파싱 결과: ${outPath} (검수용)`);

  if (COMMIT) {
    console.log(`\n💾 DB 적재 시작(service-role)...`);
    await commitToDb(editions);
    console.log(`\n✅ ingest 완료 — corpus_editions ${editions.length}편.`);
  } else {
    console.log(`\n🔍 dry-run (DB 미반영). 검수 후 --commit 로 적재.`);
  }
}

main().catch((e) => {
  console.error("ingest 실패:", e.message);
  process.exit(1);
});
