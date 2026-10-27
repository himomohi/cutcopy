/** Client-side spend guard. Meta Model API has no hard server-side spend cap. */
export const FREE_CREDITS_USD = 150
/** Stop live calls before free credits are exhausted. Soft stop leaves buffer for coding/ops. */
export const SOFT_STOP_USD = 145
export const HARD_STOP_USD = 149

const STORAGE_KEY = 'cutcopy.spend.usd.v1'

export function getSpendUsd(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const n = raw == null ? 0 : Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

export function recordSpendUsd(delta: number): number {
  const next = Math.max(0, getSpendUsd() + Math.max(0, delta))
  try {
    localStorage.setItem(STORAGE_KEY, String(next))
  } catch {
    /* ignore quota */
  }
  return next
}

export type BudgetDecision =
  | { ok: true; spendUsd: number; remainingSoftUsd: number }
  | { ok: false; reason: string; spendUsd: number }

export function assertBudgetAllows(estimatedUsd: number): BudgetDecision {
  const spendUsd = getSpendUsd()
  const projected = spendUsd + Math.max(0, estimatedUsd)
  if (projected > HARD_STOP_USD) {
    return {
      ok: false,
      reason: `Live calls blocked: projected spend $${projected.toFixed(2)} would pass hard stop $${HARD_STOP_USD} (free credits $${FREE_CREDITS_USD}).`,
      spendUsd,
    }
  }
  if (projected > SOFT_STOP_USD) {
    return {
      ok: false,
      reason: `Live calls blocked: projected spend $${projected.toFixed(2)} would pass soft stop $${SOFT_STOP_USD}. Stay inside free credits.`,
      spendUsd,
    }
  }
  return { ok: true, spendUsd, remainingSoftUsd: SOFT_STOP_USD - projected }
}

/** Rough per-run estimates for CutCopy demo (USD). Prefer overshoot. */
export const ESTIMATE_USD = {
  segment: 0.01,
  variant: 0.02,
  copy: 0.01,
  fullPipeline: 0.08,
} as const
