"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  SECTION_FORMATS,
  SECTION_FORMAT_LABEL,
  type SectionFormat,
  type StructureSection,
} from "@/lib/dashboard/proposalTypes";
import { addSection, moveSection, patchSection, removeSection } from "@/lib/outline/ops";

// 섹션 편집 위젯(공유) — 선택 중(ProposalSelector draft)·확정 후(PostConfirmStructureEdit) 둘 다 이걸 쓴다.
//   제어 컴포넌트: 상태는 부모 소유(outline prop). 편집 결과는 순수 StructureSection[]로 onChange에 올린다.
//   드래그 안정 id: @dnd-kit sortable은 드래그 내내 각 item id가 안정이어야 한다. 인덱스 id는 재정렬 시
//   깨지므로 내부에 클라 전용 임시 id(crypto.randomUUID)를 outline과 병렬로 들고, id는 payload에 저장 안 한다.
//   onChange로 부모에 올릴 때는 id를 벗겨 순수 StructureSection[]만 전달(스키마·payload 불변).

const inputCls =
  "w-full border border-trus-white/30 bg-transparent px-2 py-1 text-sm text-trus-white placeholder:text-trus-white/35 focus:border-trus-yellow focus:outline-none";
const selectCls =
  "shrink-0 border border-trus-white/30 bg-trus-black px-2 py-1 text-sm text-trus-white focus:border-trus-yellow focus:outline-none";

// 내부 id — 클라 전용 임시값(payload 미저장). crypto.randomUUID 없으면(구형 환경 방어) 카운터 폴백.
let fallbackCounter = 0;
function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  fallbackCounter += 1;
  return `oe-${fallbackCounter}`;
}

export function OutlineEditor({
  outline,
  onChange,
}: {
  outline: StructureSection[];
  onChange: (next: StructureSection[]) => void;
}) {
  // outline과 병렬인 안정 id 배열. 길이가 outline과 다르면(외부 변경) 재동기화.
  const [ids, setIds] = useState<string[]>(() => outline.map(() => newId()));

  // 외부에서 outline이 바뀌면(재생성 로드·삭제/추가 등) id 배열 길이를 맞춘다.
  //   길이 증가분엔 새 id, 감소 시 앞에서부터 잘라 유지(정렬은 onDragEnd에서 outline·ids를 함께 재배열).
  useEffect(() => {
    setIds((prev) => {
      if (prev.length === outline.length) return prev;
      if (prev.length < outline.length) {
        return [...prev, ...Array.from({ length: outline.length - prev.length }, () => newId())];
      }
      return prev.slice(0, outline.length);
    });
  }, [outline.length]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    // id 배열도 outline과 동일하게 재배열(안정 id 유지).
    setIds((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1); // from !== -1 확인 완료 → moved 항상 존재
      next.splice(to, 0, moved as string);
      return next;
    });
    onChange(moveSection(outline, from, to));
  }

  function handleAdd() {
    setIds((prev) => [...prev, newId()]);
    onChange(addSection(outline));
  }

  // 렌더 시 ids가 아직 outline보다 짧을 수 있다(useEffect는 커밋 후 실행). 즉석 보강해 인덱스 접근을 안전화.
  //   여기서 만든 여분 id는 이번 렌더에만 쓰이고, 다음 커밋의 useEffect가 상태로 확정 재동기화한다.
  const renderIds =
    ids.length >= outline.length
      ? ids
      : [...ids, ...Array.from({ length: outline.length - ids.length }, () => newId())];

  return (
    <div className="flex flex-col gap-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={renderIds} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            {outline.map((s, i) => (
              <SectionRow
                key={renderIds[i] as string}
                id={renderIds[i] as string}
                index={i}
                section={s}
                onPatch={(patch) => onChange(patchSection(outline, i, patch))}
                onRemove={() => {
                  setIds((prev) => prev.filter((_, j) => j !== i));
                  onChange(removeSection(outline, i));
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={handleAdd}
        aria-label="섹션 추가"
        className="self-start border border-trus-white/30 px-3 py-1 text-sm text-trus-white/70 hover:border-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow"
      >
        + 섹션 추가
      </button>
    </div>
  );
}

function SectionRow({
  id,
  index,
  section,
  onPatch,
  onRemove,
}: {
  id: string;
  index: number;
  section: StructureSection;
  onPatch: (patch: Partial<StructureSection>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-1 border-l pl-2 ${
        isDragging ? "border-trus-yellow" : "border-trus-white/15"
      }`}
    >
      <div className="flex items-center gap-2">
        {/* 드래그 핸들 — listeners/attributes는 핸들에만(인풋 클릭이 드래그로 안 먹히게).
            시각적으로 섹션 번호(1~)를 겸해 순서를 드러낸다. grab 커서 + 옅은 grip(⠿)로 드래그 어포던스. */}
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`섹션 ${index + 1} 순서 이동 핸들`}
          className="flex shrink-0 cursor-grab items-center gap-1 border border-trus-white/30 px-2 py-1 text-sm text-trus-white/70 hover:border-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow active:cursor-grabbing"
        >
          <span className="tabular-nums font-bold">{index + 1}</span>
          <span aria-hidden className="text-trus-white/30">⠿</span>
        </button>
        <input
          value={section.section ?? ""}
          onChange={(e) => onPatch({ section: e.target.value })}
          placeholder="섹션"
          aria-label={`섹션 ${index + 1} 제목`}
          className={`flex-1 ${inputCls}`}
        />
        <label className="sr-only" htmlFor={`outline-format-${id}`}>{`섹션 ${index + 1} 형식`}</label>
        <select
          id={`outline-format-${id}`}
          value={section.format ?? "explain"}
          onChange={(e) => onPatch({ format: e.target.value as SectionFormat })}
          className={selectCls}
        >
          {SECTION_FORMATS.map((f) => (
            <option key={f} value={f}>
              {SECTION_FORMAT_LABEL[f]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`섹션 ${index + 1} 삭제`}
          className="shrink-0 border border-trus-white/30 px-2 py-1 text-sm text-trus-white/50 hover:border-trus-yellow hover:text-trus-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow"
        >
          ✕
        </button>
      </div>
      <input
        value={section.goal ?? ""}
        onChange={(e) => onPatch({ goal: e.target.value })}
        placeholder="목표"
        aria-label={`섹션 ${index + 1} 목표`}
        className={inputCls}
      />
      <textarea
        value={section.why ?? ""}
        onChange={(e) => onPatch({ why: e.target.value })}
        placeholder="왜 이 순서"
        aria-label={`섹션 ${index + 1} 왜 이 순서`}
        rows={2}
        className={inputCls}
      />
    </li>
  );
}
