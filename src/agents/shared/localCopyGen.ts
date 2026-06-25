// 로컬 카피 생성기(copy-local-gen Step0) — 학습된 '스켈레톤'(슬롯 있는 파라메트릭 템플릿)을
//   런의 주제 컨텍스트로 채워 제목/썸네일 후보를 LLM 없이 만드는 순수·결정적 생성기.
//
//   ★ 순수성: DB·네트워크·LLM·Date·random 전부 금지. 인자(skeletons·ctx·opts)만 사용한다.
//     이유: 테스트 용이 + 재료(ctx)는 step2가 run/DB에서 구성해 주입한다.
//   ★ 빈 슬롯 누출 금지: 치환 못한 슬롯이 남는 후보는 통째로 버린다("{number}년..." 같은 깨진 문구 차단).
//   ★ 결정성+변주: 같은 (sk, ctx, opts)는 항상 같은 출력. offset(기본 0)으로 스켈레톤 배열을 인덱스
//     회전시켜 다시생성 라운드마다 다른 후보 집합을 낸다(random 금지).
//   ★ 출력 payload 형태는 stage.ts toCandidates와 정합: 제목 {title}, 썸네일 {copy_main,copy_boxes}.
//     (step2가 copy_main/copy_boxes를 thumbnail_main/thumbnail_boxes로 감싼다.)

/** 제목 스켈레톤 — 1줄 템플릿 + 그 안의 슬롯 목록. patterns.skeletons에 저장될 형태(step1). */
export interface TitleSkeleton {
  template: string;
  slots: string[];
}

/** 썸네일 스켈레톤 — 메인 카피·작은 박스 카피 템플릿 배열 + 슬롯 목록. */
export interface ThumbnailSkeleton {
  main: string[];
  boxes: string[];
  slots: string[];
}

/** 학습 산출(patterns.skeletons). title/thumbnail 둘 다 옵셔널(없으면 step2가 LLM 폴백). */
export interface CopySkeletons {
  title?: TitleSkeleton[];
  thumbnail?: ThumbnailSkeleton[];
}

/** 슬롯 채움 재료. step2가 run/리서치에서 구성해 주입(이 함수는 순수). */
export interface LocalGenContext {
  topic: string;
  keyword?: string; // 주제 핵심 명사
  number?: string; // 주제/리서치에서 뽑은 대표 숫자(있으면)
  target?: string; // 타깃/수준(예: 사회초년생, 입문)
}

/** 인식 슬롯 키. 템플릿에 이 외 토큰이 {} 형태로 남으면 빈슬롯 누출로 간주(폐기). */
//   export: step1 normalizeSkeletons 가 동일 화이트리스트로 학습 산출 스켈레톤을 검증하기 위해 재사용한다
//   (검증 의미를 한 곳에 모은다 — 슬롯 정의가 두 군데로 갈라지는 것 방지).
export const SLOT_KEYS = ["number", "target", "keyword", "topic"] as const;
type SlotKey = (typeof SLOT_KEYS)[number];

/** 텍스트의 모든 `{...}` 토큰이 전부 화이트리스트(SLOT_KEYS) 안에 있으면 true. 화이트리스트 밖 토큰이 하나라도 있으면 false. */
//   fillLine 의 폐기 의미와 일치: 인식 슬롯만 치환 가능하고, 그 외 {...} 토큰이 남으면 누출로 본다.
//   step1 normalizeSkeletons 가 학습 산출 template/라인 검증에 재사용한다(생성 시점 폐기를 학습 시점에 선차단).
export function templateSlotsAllowed(text: string): boolean {
  if (typeof text !== "string") return false;
  const matches = text.match(/\{([^}]*)\}/g);
  if (!matches) return true; // 슬롯 토큰 자체가 없으면 허용(고정 표현).
  const allowed = new Set<string>(SLOT_KEYS);
  return matches.every((m) => allowed.has(m.slice(1, -1)));
}

/** 텍스트에서 화이트리스트(SLOT_KEYS) 안의 슬롯 키만 중복 없이 추출(등장 순서). 화이트리스트 밖 토큰은 무시. */
export function extractAllowedSlots(text: string): SlotKey[] {
  if (typeof text !== "string") return [];
  const matches = text.match(/\{([^}]*)\}/g);
  if (!matches) return [];
  const allowed = new Set<string>(SLOT_KEYS);
  const seen = new Set<string>();
  const out: SlotKey[] = [];
  for (const m of matches) {
    const key = m.slice(1, -1);
    if (allowed.has(key) && !seen.has(key)) {
      seen.add(key);
      out.push(key as SlotKey);
    }
  }
  return out;
}

/** ctx에서 슬롯 값을 꺼낸다. undefined/빈문자열이면 null(누락 취급). */
function slotValue(ctx: LocalGenContext, key: SlotKey): string | null {
  const v = ctx[key];
  if (typeof v !== "string") return null;
  return v.length > 0 ? v : null;
}

/**
 * 한 줄 템플릿의 모든 슬롯을 ctx로 치환한다. 치환 못한 슬롯이 하나라도 남으면 null(폐기 신호).
 * 인식 슬롯({number}|{target}|{keyword}|{topic})만 치환하고, 남은 임의 {...} 토큰도 누출로 보고 폐기.
 */
function fillLine(template: string, ctx: LocalGenContext): string | null {
  let out = template;
  for (const key of SLOT_KEYS) {
    if (!out.includes(`{${key}}`)) continue;
    const val = slotValue(ctx, key);
    if (val === null) return null; // 채울 값 없음 → 후보 폐기
    out = out.split(`{${key}}`).join(val);
  }
  // 미인식 또는 미치환 슬롯이 남았으면 누출 → 폐기
  if (/\{[^}]*\}/.test(out)) return null;
  return out;
}

/** 여러 라인을 모두 채운다. 한 라인이라도 폐기되면 전체 null(부분 깨짐 누출 방지). */
function fillLines(templates: string[], ctx: LocalGenContext): string[] | null {
  const out: string[] = [];
  for (const t of templates) {
    const filled = fillLine(t, ctx);
    if (filled === null) return null;
    out.push(filled);
  }
  return out;
}

/** banned 항목 중 하나라도 텍스트들에 substring으로 포함되면 true(제외 신호). banned 비면 항상 false. */
function isBanned(texts: string[], banned: string[] | undefined): boolean {
  if (!banned || banned.length === 0) return false;
  const joined = texts.join("\n");
  return banned.some((b) => typeof b === "string" && b.length > 0 && joined.includes(b));
}

/** offset만큼 회전한 인덱스 순서(0..len-1). len이 0이면 빈 배열. */
function rotatedIndices(len: number, offset: number): number[] {
  if (len <= 0) return [];
  const start = ((offset % len) + len) % len; // 음수 offset도 안전
  const order: number[] = [];
  for (let i = 0; i < len; i++) order.push((start + i) % len);
  return order;
}

/**
 * 제목 스켈레톤을 ctx로 채워 최대 count개 {title} 후보를 만든다(순수·결정적).
 * 빈/undefined skeletons → 빈 배열. 슬롯 누출·banned 후보는 제외(count 미달 허용).
 */
export function fillTitleSkeletons(
  sk: TitleSkeleton[],
  ctx: LocalGenContext,
  opts: { count: number; offset?: number; banned?: string[] },
): { title: string }[] {
  if (!Array.isArray(sk) || sk.length === 0 || opts.count <= 0) return [];
  const order = rotatedIndices(sk.length, opts.offset ?? 0);
  const out: { title: string }[] = [];
  for (const i of order) {
    if (out.length >= opts.count) break;
    const skeleton = sk[i];
    if (!skeleton || typeof skeleton.template !== "string") continue;
    const title = fillLine(skeleton.template, ctx);
    if (title === null) continue; // 빈슬롯 누출 → 폐기
    if (isBanned([title], opts.banned)) continue;
    out.push({ title });
  }
  return out;
}

/**
 * 썸네일 스켈레톤을 ctx로 채워 최대 count개 {copy_main, copy_boxes} 후보를 만든다(순수·결정적).
 * main/boxes 라인 중 하나라도 슬롯을 못 채우면 그 스켈레톤 후보 전체를 버린다(부분 깨짐 누출 방지).
 */
export function fillThumbnailSkeletons(
  sk: ThumbnailSkeleton[],
  ctx: LocalGenContext,
  opts: { count: number; offset?: number; banned?: string[] },
): { copy_main: string[]; copy_boxes: string[] }[] {
  if (!Array.isArray(sk) || sk.length === 0 || opts.count <= 0) return [];
  const order = rotatedIndices(sk.length, opts.offset ?? 0);
  const out: { copy_main: string[]; copy_boxes: string[] }[] = [];
  for (const i of order) {
    if (out.length >= opts.count) break;
    const skeleton = sk[i];
    if (!skeleton || !Array.isArray(skeleton.main) || !Array.isArray(skeleton.boxes)) continue;
    const copy_main = fillLines(skeleton.main, ctx);
    if (copy_main === null) continue; // main 한 라인이라도 깨지면 후보 폐기
    const copy_boxes = fillLines(skeleton.boxes, ctx);
    if (copy_boxes === null) continue; // boxes 한 라인이라도 깨지면 후보 폐기
    if (isBanned([...copy_main, ...copy_boxes], opts.banned)) continue;
    out.push({ copy_main, copy_boxes });
  }
  return out;
}
