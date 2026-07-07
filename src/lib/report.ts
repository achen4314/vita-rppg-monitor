import type { MeasurementSession, PersonalProfile } from "./localDb";

export interface TrainingZones {
  maxHr: number;
  moderateLow: number;
  moderateHigh: number;
  vigorousLow: number;
  vigorousHigh: number;
}

export interface ReportSuggestion {
  title: string;
  body: string;
  severity: "good" | "watch" | "action";
}

export interface SessionReport {
  latest: MeasurementSession | null;
  baselineBpm: number | null;
  deltaFromBaseline: number | null;
  readinessScore: number | null;
  readinessLabel: string;
  trendLabel: string;
  qualityLabel: string;
  zones: TrainingZones | null;
  suggestions: ReportSuggestion[];
}

function avg(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function completedSessions(sessions: readonly MeasurementSession[]): MeasurementSession[] {
  return sessions.filter((session) => session.pointCount > 0 && session.avgBpm !== null);
}

function estimateTrainingZones(age: number | null): TrainingZones | null {
  if (!age || age < 10 || age > 100) return null;
  const maxHr = 220 - age;
  return {
    maxHr,
    moderateLow: Math.round(maxHr * 0.5),
    moderateHigh: Math.round(maxHr * 0.7),
    vigorousLow: Math.round(maxHr * 0.7),
    vigorousHigh: Math.round(maxHr * 0.85),
  };
}

function qualityLabel(session: MeasurementSession | null): string {
  if (!session) return "等待测量";
  if (session.avgConfidence >= 0.72 && session.lastSnrDb >= 8) return "高可信";
  if (session.avgConfidence >= 0.48 && session.lastSnrDb >= 4) return "可参考";
  return "需复测";
}

function trendLabel(delta: number | null): string {
  if (delta === null) return "建立基线中";
  if (delta >= 6) return "高于个人基线";
  if (delta <= -6) return "低于个人基线";
  return "接近个人基线";
}

function readinessFrom(latest: MeasurementSession | null, delta: number | null): number | null {
  if (!latest || latest.avgBpm === null) return null;
  const qualityPenalty = Math.max(0, 1 - latest.avgConfidence) * 24;
  const snrPenalty = latest.lastSnrDb < 4 ? 10 : latest.lastSnrDb < 8 ? 5 : 0;
  const trendPenalty = delta === null ? 8 : Math.max(0, delta - 2) * 3.2;
  const instabilityPenalty =
    latest.minBpm !== null && latest.maxBpm !== null ? Math.max(0, latest.maxBpm - latest.minBpm - 8) * 1.4 : 0;
  return Math.round(Math.max(0, Math.min(100, 96 - qualityPenalty - snrPenalty - trendPenalty - instabilityPenalty)));
}

function readinessLabel(score: number | null): string {
  if (score === null) return "暂无报告";
  if (score >= 82) return "恢复状态良好";
  if (score >= 64) return "适合常规训练";
  if (score >= 48) return "建议降低强度";
  return "优先恢复与复测";
}

function goalText(goal: PersonalProfile["trainingGoal"]): string {
  switch (goal) {
    case "fat_loss":
      return "减脂目标下，优先保证可持续的中等强度与足够恢复。";
    case "endurance":
      return "耐力目标下，关注低强度容量与静息趋势是否逐步稳定。";
    case "performance":
      return "表现目标下，把高强度安排在静息状态接近个人基线的日子。";
    case "recovery":
      return "恢复目标下，先追求连续数天稳定读数，再逐步增加训练量。";
    default:
      return "通用健康目标下，先建立个人基线，再用趋势指导训练调整。";
  }
}

export function buildSessionReport(
  profile: PersonalProfile,
  sessions: readonly MeasurementSession[],
): SessionReport {
  const completed = completedSessions(sessions);
  const latest = completed[0] ?? null;
  const previous = latest ? completed.filter((session) => session.id !== latest.id).slice(0, 7) : completed.slice(0, 7);
  const baseline = avg(previous.map((session) => session.avgBpm).filter((value): value is number => value !== null));
  const delta =
    latest?.avgBpm !== null && latest?.avgBpm !== undefined && baseline !== null ? round1(latest.avgBpm - baseline) : null;
  const readinessScore = readinessFrom(latest, delta);
  const zones = estimateTrainingZones(profile.age);
  const suggestions: ReportSuggestion[] = [];

  if (!latest) {
    suggestions.push({
      title: "先建立第一条基线",
      body: "完成一次 20 秒以上的安静测量后，这里会生成本次报告、趋势判断和训练调整建议。",
      severity: "watch",
    });
  } else {
    if (latest.avgConfidence < 0.48 || latest.lastSnrDb < 4) {
      suggestions.push({
        title: "本次信号质量偏低",
        body: "建议在均匀正面光下复测，保持脸部稳定，避免背景闪烁或强反光。低质量样本不建议用于训练决策。",
        severity: "action",
      });
    }

    if (delta !== null && delta >= 6) {
      suggestions.push({
        title: "静息心率高于近期基线",
        body: "今天先降低训练强度，优先安排技术练习、Zone 2 或恢复性活动，并关注睡眠、补水和压力因素。",
        severity: "action",
      });
    } else if (delta !== null && delta <= -6) {
      suggestions.push({
        title: "静息心率低于近期基线",
        body: "如果主观状态良好，可按计划训练；如果伴随疲劳感，仍建议以恢复和热身反馈为准。",
        severity: "good",
      });
    } else if (delta !== null) {
      suggestions.push({
        title: "读数接近个人基线",
        body: "可执行原训练计划。训练前继续做 5-10 分钟渐进热身，用体感和动作质量确认当天状态。",
        severity: "good",
      });
    } else {
      suggestions.push({
        title: "正在建立个人基线",
        body: "建议连续 5-7 天在相同时间、相同姿势下测量，之后趋势建议会更有参考价值。",
        severity: "watch",
      });
    }

    if (latest.maxBpm !== null && latest.minBpm !== null && latest.maxBpm - latest.minBpm >= 12) {
      suggestions.push({
        title: "本次测量波动较大",
        body: "测量过程中可能有移动、表情变化或光照变化。下次测量时让手机固定，保持自然呼吸和中性表情。",
        severity: "watch",
      });
    }

    suggestions.push({
      title: "训练目标校准",
      body: goalText(profile.trainingGoal),
      severity: "watch",
    });
  }

  return {
    latest,
    baselineBpm: baseline === null ? null : round1(baseline),
    deltaFromBaseline: delta,
    readinessScore,
    readinessLabel: readinessLabel(readinessScore),
    trendLabel: trendLabel(delta),
    qualityLabel: qualityLabel(latest),
    zones,
    suggestions: suggestions.slice(0, 5),
  };
}
