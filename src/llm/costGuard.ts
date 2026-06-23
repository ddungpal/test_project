// 비용 가드 — tech.md §8·§14·§17.
// 2단 캡(SOFT $7 사람확인 / HARD $10 중단) + 병렬 fan-out 누수 차단을 위한 preflight 원자 예약.
//
// 핵심(§17 P1): 사후 ledger만으로는 fan-out 3개가 동시에 시작해 HARD 캡을 넘길 수 있다.
// 따라서 호출 전 추정비용을 run 예산에서 '예약'하고, 예약+기지출이 HARD를 넘기면 호출 자체를 거부한다.
// 호출 후 실제비용으로 정산(reconcile)하여 예약을 실비로 교체한다.

export class HardCapExceededError extends Error {
  constructor(
    readonly runId: string,
    readonly attemptedUsd: number,
    readonly hardCapUsd: number,
  ) {
    super(
      `[run ${runId}] HARD 비용캡 초과: 예약 시도 $${attemptedUsd.toFixed(4)} → 누계가 $${hardCapUsd} 초과. 호출 거부.`,
    );
    this.name = "HardCapExceededError";
  }
}

/** SOFT 캡 도달 시 사람 확인을 받기 위해 던지는 신호(에러 아님 — 일시정지). 반장이 잡아 사람 게이트로. */
export class SoftCapPause {
  constructor(
    readonly runId: string,
    readonly spentUsd: number,
    readonly softCapUsd: number,
  ) {}
}

interface RunBudget {
  spentUsd: number; // 정산 완료된 실비 누계
  reservedUsd: number; // 진행 중 호출들의 예약 합
  softAcknowledged: boolean; // 사람이 SOFT 캡을 승인했는지
}

export interface CostLedgerSink {
  /** 정산된 실비 1건 기록(Phase 1에서 DB cost_ledger 테이블에 적재). */
  record(entry: {
    runId: string;
    category: "llm" | "search" | "embedding" | "storage" | "infra" | "human_review";
    detail: string;
    costUsd: number;
    tokens?: number;
    latencyMs?: number;
  }): void;
}

export interface CostGuardOptions {
  softCapUsd: number;
  hardCapUsd: number;
  sink?: CostLedgerSink;
}

/**
 * run 단위 비용 가드. 동시(fan-out) 호출에 안전하도록 예약 합을 함께 계산한다.
 * Node 단일 스레드라 reserve/reconcile 본문은 원자적으로 실행된다.
 */
export class CostGuard {
  private readonly budgets = new Map<string, RunBudget>();

  constructor(private readonly opts: CostGuardOptions) {}

  private get(runId: string): RunBudget {
    let b = this.budgets.get(runId);
    if (!b) {
      b = { spentUsd: 0, reservedUsd: 0, softAcknowledged: false };
      this.budgets.set(runId, b);
    }
    return b;
  }

  /**
   * 비용캡을 'run 누적'으로 만들기 위한 시드(반장 마감). 각 단계는 새 CostGuard를 만드므로,
   * 단계 시작 시 production_runs.cost_usd(지금까지 누계)를 주입해야 SOFT/HARD가 편 전체 기준으로 동작한다.
   * (시드 안 하면 캡이 '단계당'으로 느슨해짐.) 이미 시드/지출된 값보다 클 때만 올린다(중복 시드 안전).
   */
  seed(runId: string, spentUsd: number): void {
    const b = this.get(runId);
    if (spentUsd > b.spentUsd) b.spentUsd = spentUsd;
  }

  /** 사람이 SOFT 캡을 승인하면 호출 → 이후 SOFT 일시정지 없이 HARD까지 진행. */
  acknowledgeSoftCap(runId: string): void {
    this.get(runId).softAcknowledged = true;
  }

  /**
   * 호출 전 예약. 예약 후 (spent+reserved)가
   *  - HARD 초과 → 예약 롤백 + HardCapExceededError (호출 금지)
   *  - SOFT 초과 & 미승인 → 예약 롤백 + SoftCapPause throw (사람 확인 대기)
   * 성공 시 reservationId 반환(reconcile/release에 사용).
   */
  reserve(runId: string, estimatedUsd: number): string {
    const b = this.get(runId);
    const projected = b.spentUsd + b.reservedUsd + estimatedUsd;
    if (projected > this.opts.hardCapUsd) {
      throw new HardCapExceededError(runId, estimatedUsd, this.opts.hardCapUsd);
    }
    if (projected > this.opts.softCapUsd && !b.softAcknowledged) {
      // 사람 확인 전까지 진행 불가. 예약하지 않고 일시정지 신호.
      throw new SoftCapPause(runId, b.spentUsd + b.reservedUsd, this.opts.softCapUsd);
    }
    b.reservedUsd += estimatedUsd;
    return `${runId}:${estimatedUsd}:${b.reservedUsd}`;
  }

  /** 호출 성공 후: 예약을 실비로 교체 + ledger 기록. */
  reconcile(
    runId: string,
    estimatedUsd: number,
    actualUsd: number,
    detail: { label: string; tokens?: number; latencyMs?: number },
  ): void {
    const b = this.get(runId);
    b.reservedUsd = Math.max(0, b.reservedUsd - estimatedUsd);
    b.spentUsd += actualUsd;
    this.opts.sink?.record({
      runId,
      category: "llm",
      detail: detail.label,
      costUsd: actualUsd,
      ...(detail.tokens !== undefined ? { tokens: detail.tokens } : {}),
      ...(detail.latencyMs !== undefined ? { latencyMs: detail.latencyMs } : {}),
    });
  }

  /** 호출 실패 시: 예약만 해제(실비 없음). */
  release(runId: string, estimatedUsd: number): void {
    const b = this.get(runId);
    b.reservedUsd = Math.max(0, b.reservedUsd - estimatedUsd);
  }

  spentUsd(runId: string): number {
    return this.get(runId).spentUsd;
  }
}

/** 메모리 ledger(Phase 0). Phase 1에서 Supabase cost_ledger로 교체. */
export class InMemoryCostLedger implements CostLedgerSink {
  readonly entries: Array<{ runId: string; category: string; detail: string; costUsd: number }> = [];
  record(entry: { runId: string; category: "llm" | "search" | "embedding" | "storage" | "infra" | "human_review"; detail: string; costUsd: number }): void {
    this.entries.push({ runId: entry.runId, category: entry.category, detail: entry.detail, costUsd: entry.costUsd });
  }
}
