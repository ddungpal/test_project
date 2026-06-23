"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startTopicRun, startSeedRun } from "@/app/actions/topicRun";
import type { ReferenceEdition } from "@/lib/dashboard/queries";
import { RELATION_LABEL, type ContentRelation } from "@/lib/dashboard/seedTypes";

// 새 편 시작 — 세 입구(§8.2 단계경계 버튼).
//   발굴: 촉이가 댓글+외부검색 신호로 주제 제안(입력 없음).
//   키워드: 키워드 1개 → 그 키워드 댓글 군집 + 외부검색으로 구체 주제 발굴(촉이 생성).
//   씨앗: 사용자가 준 주제를 확정으로 시작 + 참조 기존편(참고|이어보기) + 연결 의도. 촉이 건너뜀.
type Mode = "discovery" | "keyword" | "seed";

export function NewRunButton({ references }: { references: ReferenceEdition[] }) {
  const [mode, setMode] = useState<Mode>("discovery");
  const [topic, setTopic] = useState("");
  const [keyword, setKeyword] = useState("");
  const [intent, setIntent] = useState("");
  const [levelSplit, setLevelSplit] = useState(false); // 촉이 수준 분해 토글(입문~고급)
  const [refs, setRefs] = useState<Record<string, ContentRelation>>({}); // contentId → 관계
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggleRef(id: string) {
    setRefs((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = "reference";
      return next;
    });
  }
  function setRelation(id: string, relation: ContentRelation) {
    setRefs((prev) => ({ ...prev, [id]: relation }));
  }

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setTopic("");
        setKeyword("");
        setIntent("");
        setRefs({});
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "새 편 시작 실패");
      }
    });
  }

  const tabCls = (m: Mode) =>
    `px-3 py-1.5 text-xs font-bold ${mode === m ? "bg-trus-yellow text-trus-black" : "border border-trus-white/25 text-trus-white/60 hover:border-trus-yellow/60"}`;
  const inputCls =
    "w-full border border-trus-white/30 bg-transparent px-3 py-2 text-sm text-trus-white placeholder:text-trus-white/40 focus:border-trus-yellow focus:outline-none";

  // 촉이 수준 분해 토글 — 발굴·키워드 모드 공용(씨앗은 촉이 건너뜀이라 미적용).
  const levelToggle = (
    <label className="flex items-center gap-2 text-xs text-trus-white/70">
      <input type="checkbox" checked={levelSplit} onChange={(e) => setLevelSplit(e.target.checked)} disabled={pending} className="accent-[#F8F082]" />
      시청자 수준별로 주제 나누기 <span className="text-trus-white/40">(입문·초급·중급·고급)</span>
    </label>
  );

  return (
    <div className="border border-trus-yellow p-4">
      <label className="text-trus-yellow block text-xs font-bold tracking-widest uppercase">새 편 시작</label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setMode("discovery")} className={tabCls("discovery")}>주제 발굴받기</button>
        <button onClick={() => setMode("keyword")} className={tabCls("keyword")}>키워드로 발굴</button>
        <button onClick={() => setMode("seed")} className={tabCls("seed")}>내 주제로 시작</button>
      </div>

      {mode === "discovery" ? (
        <div className="mt-3">
          <p className="text-xs text-trus-white/50">촉이가 시청자 댓글 + 외부 검색(웹·YouTube) 신호를 결합해 주제 후보를 제안합니다.</p>
          <div className="mt-2">{levelToggle}</div>
          <button
            onClick={() => run(() => startTopicRun(undefined, levelSplit))}
            disabled={pending}
            className="mt-2 bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black disabled:opacity-50"
          >
            {pending ? "시작 중…" : "발굴 시작"}
          </button>
        </div>
      ) : mode === "keyword" ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-trus-white/50">키워드의 댓글 반응 + 외부 검색을 분석해 구체적인 하위 주제를 발굴합니다.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !pending && keyword.trim() && run(() => startTopicRun(keyword.trim(), levelSplit))}
              placeholder="키워드 (예: 청년미래적금)"
              disabled={pending}
              className={inputCls}
            />
            <button
              onClick={() => run(() => startTopicRun(keyword.trim(), levelSplit))}
              disabled={pending || !keyword.trim()}
              className="shrink-0 bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black disabled:opacity-50"
            >
              {pending ? "시작 중…" : "발굴 시작"}
            </button>
          </div>
          {levelToggle}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="내 주제 (예: ISA 3년 만기 후 연금저축 전환 전략)"
            disabled={pending}
            className={inputCls}
          />

          <div>
            <p className="text-xs font-bold text-trus-white/70">참조할 기존편 <span className="font-normal text-trus-white/40">(선택 · 여러 개 가능)</span></p>
            {references.length === 0 ? (
              <p className="mt-1 text-xs text-trus-white/40">보유한 기존편이 없습니다.</p>
            ) : (
              <ul className="mt-2 flex max-h-52 flex-col gap-1 overflow-y-auto pr-1">
                {references.map((r) => {
                  const sel = refs[r.id];
                  return (
                    <li key={r.id} className={`border px-2 py-1.5 ${sel ? "border-trus-yellow/60" : "border-trus-white/15"}`}>
                      <label className="flex items-center gap-2 text-sm text-trus-white/85">
                        <input type="checkbox" checked={!!sel} onChange={() => toggleRef(r.id)} className="accent-[#F8F082]" />
                        <span className="min-w-0 flex-1 truncate">{r.label}</span>
                        {r.uploadDate && <span className="shrink-0 text-[10px] text-trus-white/35">{r.uploadDate}</span>}
                      </label>
                      {sel && (
                        <div className="mt-1.5 flex gap-1 pl-6">
                          {(["reference", "series_followup"] as ContentRelation[]).map((rel) => (
                            <button
                              key={rel}
                              onClick={() => setRelation(r.id, rel)}
                              className={`px-2 py-0.5 text-[10px] font-bold ${sel === rel ? "bg-trus-yellow text-trus-black" : "border border-trus-white/25 text-trus-white/55"}`}
                            >
                              {RELATION_LABEL[rel]}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="연결 의도 — 참조편과 어떻게 이을지 (예: 지난 ISA 편을 본 시청자가 만기 후 다음 행동을 알게)"
            rows={2}
            disabled={pending}
            className={inputCls}
          />

          <button
            onClick={() =>
              run(() =>
                startSeedRun({
                  topic,
                  references: Object.entries(refs).map(([contentId, relation]) => ({ contentId, relation })),
                  intent,
                }),
              )
            }
            disabled={pending || !topic.trim()}
            className="bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black disabled:opacity-50"
          >
            {pending ? "시작 중…" : "이 주제로 시작"}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}
