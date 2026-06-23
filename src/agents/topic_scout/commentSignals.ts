// 댓글 신호 집계(공유) — 촉이 prep(런 단위)과 매일 발굴 Cron(전역) 양쪽이 쓴다.
// ★ governance C안: 댓글 '원문'은 LLM에 전송하지 않는다. 여기서 코드로 집계(키워드 빈도·질문 카운트)만 산출.
//   순수 함수(DB·LLM·시각 의존 없음) → 단위 테스트 가능.

// 한국어 조사/불용어 — 키워드 정제용(형태소 분석기 없이 경량 휴리스틱).
const JOSA = ["으로서", "으로써", "에서는", "으로", "에서", "에게", "한테", "께서", "처럼", "보다", "까지", "부터", "이라고", "라고", "이라는", "라는", "에는", "에도", "은", "는", "이", "가", "을", "를", "의", "에", "도", "만", "과", "와", "로", "랑", "이나", "나", "든지", "이며", "며"];
const STOP = new Set([
  "그리고", "그런데", "그래서", "근데", "진짜", "너무", "정말", "완전", "그냥", "지금", "오늘", "영상", "감사합니다", "감사해요", "짠부", "짠부님", "님", "ㅋㅋ", "ㅋㅋㅋ", "ㅎㅎ", "ㅠㅠ", "구독", "좋아요", "항상", "보고", "보면", "하는", "해서", "해요", "하고", "있는", "있어요", "같아요", "거예요", "건가요", "건데", "이거", "저거", "근데요", "있나요", "한번", "혹시", "정도", "제가", "저는", "내가", "우리", "this", "the", "and",
  // 약신호 잡음 컷(2026-06-22 라이브 검증 반영) — 내용 없는 필러·평가어·메타·대명사 잔여.
  //   ★ 금융 토픽어(통장·금리·적금·투자·세금·청약·배당 등)는 절대 넣지 않는다(신호 보존).
  "정보", "좋은", "좋네요", "좋아", "바로", "저도", "저희", "본인", "댓글", "채널", "알림", "컨텐츠", "콘텐츠",
  "생각", "부분", "사람", "경우", "내용", "얘기", "이야기", "말씀", "느낌", "도움", "응원", "최고", "대박",
  "다시", "계속", "이제", "아직", "역시", "조금", "약간", "살짝", "가끔", "자주", "무슨", "모든", "여러",
  "그게", "그건", "이게", "이건", "그거", "요거", "그래도", "그럼", "그러면", "하지만", "또한",
  "같은", "같이", "통해", "위해", "대한", "관련", "보니", "들어", "알게", "정말요", "너무너무",
  // 연결어미·서술 필러("~는데/~은데" 등) — 토픽어가 아닌 문장 잔여.
  "있는데", "없는데", "하는데", "되는데", "같은데", "인데", "한데", "라는데", "거든요", "더라고요", "네요", "겠어요",
  "기존", "관심", "시작", "요즘", "처음", "그동안",
]);

// 코드리뷰 반영: (1) 최장일치 — 긴 조사부터 검사(수동 순서 의존 제거). (2) 어간 2자 이상만 분리.
//   1자 어간 허용은 위험("주가·물가·제도"가 "주·물·제"로 오분리)하므로 보수적 유지("투자를"→"투자" ✓).
const JOSA_SORTED = [...JOSA].sort((a, b) => b.length - a.length);
export function stripJosa(tok: string): string {
  for (const j of JOSA_SORTED) {
    if (tok.endsWith(j) && tok.length - j.length >= 2) return tok.slice(0, -j.length);
  }
  return tok;
}

const QUESTION_RE = /(나요|까요|을까|ㄹ까|가요|인가|어떻게|뭐|무엇|어떤|있을까|하면|할까|되나|되나요|\?)/;

export interface CommentSignal {
  id: string; // "kw:<term>"
  term: string;
  count: number;
}
export interface CommentAggregate {
  comment_count: number;
  question_comment_count: number;
  keyword_signals: CommentSignal[];
}

/**
 * 댓글 행(원문 비전송) → 키워드 빈도·질문 카운트. keyword 지정 시 그 키워드 포함 댓글만(군집).
 *   - like_count 가중, 동일 댓글 내 중복 토큰 1회, 숫자·불용어·1자 어간 제외.
 *   - 컷: 키워드 군집(표본 작음) ≥2, 광역 ≥3.
 */
export function aggregateCommentSignals(
  rows: { body: string | null; like_count: number | null }[],
  opts: { keyword?: string | null } = {},
): CommentAggregate {
  const kwNorm = opts.keyword ? opts.keyword.normalize("NFC") : null;
  const pool = rows.filter((c) => (kwNorm ? (c.body ?? "").normalize("NFC").includes(kwNorm) : true));

  const freq = new Map<string, number>();
  let questionCount = 0;
  for (const c of pool) {
    const body = (c.body ?? "").normalize("NFC");
    if (QUESTION_RE.test(body)) questionCount++;
    const w = 1 + Math.min(5, Math.floor((c.like_count ?? 0) / 10)); // like 가중
    const seen = new Set<string>();
    for (const raw of body.split(/[^\p{L}\p{N}]+/u)) {
      if (raw.length < 2) continue;
      const tok = stripJosa(raw);
      if (tok.length < 2 || STOP.has(tok)) continue;
      if (/^[0-9]+$/.test(tok)) continue;
      if (kwNorm && tok === opts.keyword) continue; // 키워드 모드: 키워드 자체 제외(동시출현 용어를 본다)
      if (seen.has(tok)) continue;
      seen.add(tok);
      freq.set(tok, (freq.get(tok) ?? 0) + w);
    }
  }

  const keyword_signals = [...freq.entries()]
    .filter(([, n]) => n >= (kwNorm ? 2 : 3)) // 키워드 군집은 표본이 작아 컷 완화
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([term, count]) => ({ id: `kw:${term}`, term, count }));

  return { comment_count: pool.length, question_comment_count: questionCount, keyword_signals };
}
