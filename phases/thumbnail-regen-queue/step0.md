# Step 0: regen-queue-core

썸네일 A/B/C 슬롯별 재생성을 **비차단 큐**로 바꾸기 위한 **순수 로직**을 먼저 만든다. 핵심은 "어느 슬롯의 재생성이 완료됐는가"를 판정하는 순수 함수다 — step1의 UI 리팩터가 이걸 소비한다.

## 배경 (왜 이게 필요한가)

현재 `ThumbnailStudio.tsx`는 재생성을 **단일 추적**한다: `busy`(단일 값) + `startId`(단일 proposalId)로 한 번에 하나만 따라가고, 완료는 `proposalId` prop 하나가 뒤집히는 걸로 감지한다. 그래서 A를 재생성하면 B·C가 전부 잠긴다(`disabledAll`).

비차단 큐로 가려면 **슬롯별 완료 감지**가 필요한데, 백엔드 슬롯 재생성은 "현재 proposal을 읽어 → slotIdx 1칸만 교체 → **나머지 2칸은 payload 그대로 보존** → 새 proposal 통째 INSERT" 모델이다(`src/inngest/client.ts:20` 주석 참조). 따라서:
- **재생성된 슬롯**: 그 후보의 `payload`가 바뀐다.
- **보존된 슬롯**: 같은 proposal에 들어가도 `payload`는 동일하다(후보 row id만 새로 생김 — **id로 판정하면 보존 슬롯까지 false-positive** 나니 금지).

→ 완료 감지는 **payload 내용 비교**로 한다: 큐에 넣을 때 그 슬롯 payload의 스냅샷을 떠두고, 새 후보가 도착했을 때 payload가 스냅샷과 **달라진 슬롯 = 완료**.

## 읽어야 할 파일

- `src/components/ThumbnailStudio.tsx` — 현재 단일추적 상태 모델(`busy`/`startId`/`disabledAll`/완료감지 useEffect). step1이 이 파일을 리팩터한다.
- `src/lib/dashboard/proposalTypes.ts` — `CandidateView { idx:number; payload:unknown; evidence_ids:string[] }`. 슬롯=idx, 내용=payload.
- `src/inngest/client.ts`(20~21줄)·`src/inngest/functions/thumbnailSlotStage.ts` — 슬롯 재생성이 "1칸 교체·나머지 보존·concurrency:1 직렬"임을 확인(백엔드는 이 step에서 안 건드린다).

## 작업

### `src/components/thumbnailRegenQueue.ts` (신규, 순수 — React 의존 0)

```ts
import type { CandidateView } from "@/lib/dashboard/proposalTypes";

// 후보 payload의 안정적 비교 키. payload는 LLM JSON 객체 → 키 순서 무관하게 같은 내용이면 같은 키가 나오도록 직렬화.
export function candidateKey(payload: unknown): string;

// 대기 중 슬롯들 중 '완료된' 슬롯 idx 목록을 반환(순수).
//   pending: 슬롯idx → 큐 투입 시점의 candidateKey 스냅샷.
//   candidates: 현재 화면의 후보들.
//   규칙: 해당 idx의 현재 후보 candidateKey가 스냅샷과 '다르면' 완료(=배열에 포함). 후보가 없으면(idx 사라짐) 완료로 본다.
export function resolveCompletedSlots(
  pending: Readonly<Record<number, string>>,
  candidates: readonly CandidateView[],
): number[];

// 완료된 슬롯을 pending에서 제거한 새 객체 반환(불변, 순수).
export function clearSlots(
  pending: Readonly<Record<number, string>>,
  completed: readonly number[],
): Record<number, string>;
```

핵심 규칙(반드시 지킬 것):
- **순수**: 네트워크·React·전역상태 의존 0. 입력만으로 결정.
- `candidateKey`는 **내용 동등성**이어야 한다. 보존된 슬롯(같은 payload)은 같은 키, 재생성된 슬롯은 다른 키. (키 순서가 흔들리지 않게 정렬 직렬화 권장 — 단순 `JSON.stringify`로 흔들릴 여지가 있으면 키 정렬.)
- `resolveCompletedSlots`는 **변경된 슬롯만** 완료로 본다(보존 슬롯을 완료로 오판하면 큐가 즉시 비어 비차단이 깨진다).

### 테스트 — `tests/thumbnailRegenQueue.test.ts` (신규)
최소 케이스:
1. 스냅샷과 payload 동일(보존 슬롯) → 완료 아님(빈 배열).
2. payload 변경된 슬롯만 완료로 반환.
3. 여러 슬롯이 한 번에 바뀌면 모두 반환(폴링 사이 2개 완료 케이스).
4. `clearSlots`가 완료 슬롯만 제거하고 나머지는 보존(불변).
5. `candidateKey`가 키 순서 다른 동일 내용 객체에 같은 키를 반환.

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(순수 로직만 — 라이브 UI·네트워크 없음. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - `thumbnailRegenQueue.ts`가 순수(React/네트워크 의존 0)이고 테스트가 입력만으로 도는가.
   - 보존 슬롯(payload 동일)을 완료로 오판하지 않는가(false-positive 방지 테스트 존재).
   - candidate **id가 아니라 payload 내용**으로 비교하는가.
   - `ThumbnailStudio.tsx`를 아직 수정하지 않았는가(step1 몫).
3. `phases/thumbnail-regen-queue/index.json`의 step 0 갱신(completed+summary / error / blocked). **index.json은 반드시 유효한 JSON으로 저장하라.**

## 금지사항

- candidate **id/row 식별자로 완료 판정 금지**. 이유: 보존 슬롯도 새 proposal에서 새 id를 받으므로 전부 완료로 오판된다 — 반드시 payload 내용 비교.
- 백엔드(Inngest `concurrency:1`, 슬롯 교체 모델)를 바꾸지 마라. 이유: 직렬 처리가 "1칸 교체·나머지 보존" 정합성의 핵심 — 이 phase는 UI만 비차단으로 만든다.
- `ThumbnailStudio.tsx`·서버 액션을 수정하지 마라. 이유: 이 step은 순수 로직만, 배선은 step1.
- 기존 테스트를 깨뜨리지 마라.
