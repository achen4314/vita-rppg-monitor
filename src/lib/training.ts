import type { TrainingLog, TrainingZone } from "./localDb";

export interface TrainingLoadSummary {
  fitness: number;
  fatigue: number;
  freshness: number;
  label: string;
  dailyLoads: number[];
  zoneLoads: Record<TrainingZone, number>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function ewma(values: readonly number[], timeConstant: number): number {
  const alpha = 2 / (timeConstant + 1);
  return values.reduce((value, sample) => value + alpha * (sample - value), 0);
}

export function buildTrainingLoadSummary(
  logs: readonly TrainingLog[],
  now = Date.now(),
): TrainingLoadSummary {
  const today = startOfDay(now);
  const dailyLoads = Array.from({ length: 28 }, () => 0);
  const zoneLoads: Record<TrainingZone, number> = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };

  logs.forEach((log) => {
    const daysAgo = Math.floor((today - startOfDay(log.performedAt)) / DAY_MS);
    if (daysAgo >= 0 && daysAgo < dailyLoads.length) {
      dailyLoads[dailyLoads.length - 1 - daysAgo] += log.load;
    }
    if (daysAgo >= 0 && daysAgo < 7) zoneLoads[log.zone] += log.load;
  });

  const fitness = ewma(dailyLoads, 28);
  const fatigue = ewma(dailyLoads.slice(-14), 7);
  const freshness = fitness - fatigue;
  const label =
    logs.length === 0
      ? "记录训练后建立负荷基线"
      : freshness >= 12
        ? "新鲜度高，适合质量训练"
        : freshness >= -10
          ? "负荷均衡，可按计划训练"
          : "短期疲劳偏高，建议降低强度";

  return {
    fitness: Number(fitness.toFixed(1)),
    fatigue: Number(fatigue.toFixed(1)),
    freshness: Number(freshness.toFixed(1)),
    label,
    dailyLoads,
    zoneLoads,
  };
}
