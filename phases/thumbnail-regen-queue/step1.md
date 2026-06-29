# Step 1: regen-queue-wiring

`ThumbnailStudio.tsx`의 재생성 상태 모델을 **단일 추적 → 슬롯별 비차단 큐**로 리팩터한다. 사용자가 A·B·C를 **기다리지 않고 연달아** 눌러두면, 백엔드(concurrency:1)가 직렬로 처리하고 **각 카드가 완료되는 대로 독립 갱신**된다. step0의 순수 함수를 소비한다.

## 읽어야 할 파일

- `src/components/thumbnailRegenQueue.ts` (step0 산출) — `candidateKey`·`resolveCompletedSlots`·`clearSlots`. **완료 감지는 이걸 쓰고 새로 만들지 마라.**
- `tests/thumbnailRegenQueue.test.ts` (step0) — 순수 함수 계약 확인.
- `src/components/ThumbnailStudio.tsx` — **이 파일을 리팩터**한다. 현재 모델: `busy:Busy`(단일)·`startId`(단일 proposalId)·`submitted`·`disabledAll`·완료감지 useEffect(`proposalId !== startId`). 교정 패널(`CorrectionPanel`/`corrections`)은 **이미 독립**이며 `disabledAll`에 안 묶인다 — 이 독립성을 절대 깨지 마라.
- `src/app/actions/topicRun.ts` — `regenerateThumbnailSlot(runId, idx, reason)`·`regenerateThumbnails(runId, reason, forceLlm)`·`confirmThumbnails(runId)`. 시그니처 그대로 사용(백엔드 무변경).
- `src/components/LiveRefresh.tsx` — 폴링 컴포넌트(`active`·`fallbackMs`). 대기 슬롯이 있는 동안만 폴링.

## 작업

### 상태 모델 교체 (ThumbnailStudio 내부)

단일 `busy`/`startId` → 아래로 교체:

```ts
const [pending, setPending] = useState<Record<number, string>>({}); // 슬롯idx → 큐 투입 시점 candidateKey 스냅샷
const [confirmBusy, setConfirmBusy] = useState(false);              // 확정(상태전이)은 전체 잠금 유지
const hasPending = Object.keys(pending).length > 0;
```

동작:
- **슬롯 재생성 클릭(idx)**: `setPending(prev => ({ ...prev, [idx]: candidateKey(candidates[idx].payload) }))` → `regenerateThumbnailSlot(...)` 호출 → 폴링 시작. **다른 슬롯이 대기 중이어도 이 클릭은 막지 않는다**(비차단의 핵심).
- **전체 재생성 클릭**(`다시 생성($0)` / `LLM으로 새로 써줘`): 3슬롯 전부 스냅샷 떠서 pending에 넣고 `regenerateThumbnails(...)` 호출. (전체도 같은 큐 모델로 통일 — 새 proposal에서 3칸 payload 다 바뀌면 한 번에 다 비워짐.)
- **완료 감지 useEffect**(deps: candidates/proposalId 변화): `resolveCompletedSlots(pending, candidates)` → 완료 슬롯을 `clearSlots`로 pending에서 제거. 슬롯별 사유(`slotReasons`)도 완료 슬롯 것만 정리.
- **폴링**: `hasPending` 동안만 `<LiveRefresh active fallbackMs={3000} />` 렌더.
- **안전 상한**: 기존 5분 타임아웃 유지하되 "대기 슬롯이 5분 넘게 안 비면 안내" 형태로(payload가 우연히 동일해 영영 안 비는 극단 케이스 백스톱). 무한 폴링 금지.

### 잠금 규칙 (disable)

`disabledAll` 단일 플래그를 **두 결로 분리**:
- **슬롯 입력/버튼**(idx): `disabled = confirmBusy || (idx in pending)`. → **그 카드만** 잠기고, 다른 카드는 계속 누를 수 있다.
- **전체 재생성 버튼 2개 + 확정 버튼 + 전체 사유 textarea**: `disabled = confirmBusy || hasPending`. → 슬롯 큐가 도는 동안 전체재생성·확정은 막는다(정합성).
- **확정**: 기존대로 상태 전이(`confirmThumbnails`→`router.refresh`). `confirmBusy`로 표시.
- **교정 패널**: 기존 독립 유지(`pending`/`confirmBusy`와 무관 — 재생성 중에도 교정 가능).

### 카드 표시
- 카드 헤더의 "생성 중…" 배지·본문 `opacity-50`는 `idx in pending` 기준으로(슬롯별). 버튼 라벨도 슬롯별("이 칸 생성 중…").

## Acceptance Criteria

```bash
npm run typecheck
npm test
npm run build
```

(라이브 동시 재생성은 사람이 dev에서 확인 — A·B·C 연달아 눌러도 안 막히고 각자 갱신되는지. build가 stale `.next`로 깨지면 `rm -rf .next` 후 재빌드.)

## 검증 절차

1. 위 AC 실행(전부 exit 0).
2. 체크리스트:
   - 한 슬롯 재생성 중에도 **다른 슬롯 버튼이 안 잠기는가**(비차단 달성 — 핵심).
   - 완료 감지가 step0 `resolveCompletedSlots`(payload 비교)를 쓰는가(자체 재구현 아님).
   - 교정 패널 독립성이 보존됐는가(재생성 중에도 교정 가능).
   - 확정·전체재생성은 슬롯 큐 도는 동안 잠기는가(정합성).
   - 5분 안전 타임아웃이 살아있는가(무한 폴링 방지).
   - 백엔드 액션·Inngest를 안 건드렸는가.
3. `phases/thumbnail-regen-queue/index.json`의 step 1 갱신(completed+summary / error / blocked). **index.json은 반드시 유효한 JSON으로 저장하라.**

## 금지사항

- 한 슬롯 재생성이 다른 슬롯을 잠그게 하지 마라. 이유: 그게 고치려는 바로 그 버그(비차단이 목적).
- 교정 패널을 `pending`/`confirmBusy`에 묶지 마라. 이유: 교정은 상태 전이 없는 독립 경로 — 기존 독립성 유지가 계약.
- 백엔드(서버 액션·Inngest `concurrency:1`·슬롯 교체 모델)를 바꾸지 마라. 이유: 직렬 처리가 정합성의 핵심, 이 phase는 UI만.
- 완료 감지를 candidate id로 하지 마라. 이유: 보존 슬롯도 새 id를 받아 오판된다(step0가 payload 비교로 푼 이유).
- 확정 흐름(상태 전이)·5분 안전 타임아웃을 제거하지 마라.
- 기존 테스트를 깨뜨리지 마라.
