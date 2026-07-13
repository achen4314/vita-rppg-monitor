import { Activity, BrainCircuit, HeartPulse, TrendingUp, Wind } from "lucide-react";
import { useMemo, useState } from "react";
import type { MeasurementSession, PersonalProfile } from "../lib/localDb";
import { buildSessionReport } from "../lib/report";

type InsightMetric = "hrv" | "rhr" | "resp" | "sleep";

interface MetricDefinition {
  label: string;
  unit: string;
  icon: typeof Activity;
  value: (session: MeasurementSession) => number | null;
}

const METRICS: Record<InsightMetric, MetricDefinition> = {
  hrv: { label: "HRV", unit: "ms", icon: Activity, value: (session) => session.hrv?.rmssd ?? null },
  rhr: { label: "静息心率", unit: "BPM", icon: HeartPulse, value: (session) => session.avgBpm },
  resp: { label: "呼吸率", unit: "/min", icon: Wind, value: (session) => session.avgRespirationRate },
  sleep: { label: "睡眠质量", unit: "/5", icon: BrainCircuit, value: (session) => session.checkIn?.sleepQuality ?? null },
};

function average(values: readonly number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function InsightsDashboard({ profile, sessions }: { profile: PersonalProfile; sessions: readonly MeasurementSession[] }) {
  const [metricKey, setMetricKey] = useState<InsightMetric>("hrv");
  const definition = METRICS[metricKey];
  const report = buildSessionReport(profile, sessions);
  const recent = useMemo(
    () => sessions.filter((session) => session.pointCount > 0).slice(0, 7).reverse(),
    [sessions],
  );
  const values = recent.map(definition.value);
  const numericValues = values.filter((value): value is number => value !== null);
  const baselineValues = sessions
    .filter((session) => Date.now() - session.startedAt <= 30 * 24 * 60 * 60 * 1000)
    .map(definition.value)
    .filter((value): value is number => value !== null);
  const latest = numericValues.length ? numericValues[numericValues.length - 1] : null;
  const baseline = average(baselineValues);
  const delta = latest !== null && baseline !== null ? latest - baseline : null;
  const min = numericValues.length ? Math.min(...numericValues) : 0;
  const max = numericValues.length ? Math.max(...numericValues) : 1;
  const span = Math.max(1, max - min);
  const Icon = definition.icon;

  return (
    <section className="insights-dashboard">
      <div className="section-heading compact-heading">
        <div>
          <span>PERFORMANCE INSIGHTS</span>
          <h2>恢复与趋势洞察</h2>
        </div>
        <div className="system-live"><i /> 本地数据已就绪</div>
      </div>

      <div className="insight-tabs" role="tablist" aria-label="趋势指标">
        {(Object.keys(METRICS) as InsightMetric[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={metricKey === key}
            className={metricKey === key ? "active" : ""}
            onClick={() => setMetricKey(key)}
          >
            {METRICS[key].label}
          </button>
        ))}
      </div>

      <div className="insight-layout">
        <article className="trend-lab-card">
          <div className="trend-card-header">
            <div>
              <Icon size={17} />
              <span>7 次趋势</span>
            </div>
            <strong>{latest === null ? "--" : latest.toFixed(1)} <small>{definition.unit}</small></strong>
            <em className={delta !== null && delta >= 0 ? "positive" : "negative"}>
              {delta === null ? "建立基线中" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} 较 30 天基线`}
            </em>
          </div>
          <div className="insight-bars" aria-label={`${definition.label}近期趋势`}>
            {Array.from({ length: 7 }, (_, index) => {
              const value = values[index] ?? null;
              const height = value === null ? 8 : 24 + ((value - min) / span) * 70;
              return (
                <div key={`${metricKey}-${index}`}>
                  <span className={index === 6 ? "latest" : ""} style={{ height: `${height}%` }} />
                  <small>{recent[index] ? new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(recent[index].startedAt) : "--"}</small>
                </div>
              );
            })}
          </div>
        </article>

        <div className="insight-kpi-stack">
          <article><span>30 天基线</span><strong>{baseline === null ? "--" : baseline.toFixed(1)} <small>{definition.unit}</small></strong></article>
          <article><span>恢复指数</span><strong>{report.readinessScore ?? "--"}<small>/100</small></strong></article>
          <article className="automated-insight">
            <TrendingUp size={18} />
            <span>自动洞察</span>
            <strong>{report.suggestions[0]?.title ?? "完成测量后生成建议"}</strong>
            <p>{report.suggestions[0]?.body ?? "建议在固定时间连续测量，用个人趋势而不是单次数字做决策。"}</p>
          </article>
        </div>
      </div>
    </section>
  );
}
