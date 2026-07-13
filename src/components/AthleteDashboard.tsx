import { Activity, ArrowRight, HeartPulse, Play, Sparkles, Wind } from "lucide-react";
import type { MeasurementSession, PersonalProfile, TrainingLog } from "../lib/localDb";
import { buildSessionReport } from "../lib/report";
import { buildTrainingLoadSummary } from "../lib/training";

interface AthleteDashboardProps {
  profile: PersonalProfile;
  sessions: readonly MeasurementSession[];
  trainingLogs: readonly TrainingLog[];
  running: boolean;
  onStart: () => void;
  onOpenInsights: () => void;
}

function metric(value: number | null | undefined, unit: string, digits = 0): string {
  return value === null || value === undefined ? "--" : `${value.toFixed(digits)} ${unit}`;
}

export function AthleteDashboard({
  profile,
  sessions,
  trainingLogs,
  running,
  onStart,
  onOpenInsights,
}: AthleteDashboardProps) {
  const report = buildSessionReport(profile, sessions);
  const load = buildTrainingLoadSummary(trainingLogs);
  const latest = report.latest;
  const score = report.readinessScore ?? 0;
  const greeting = profile.displayName ? `${profile.displayName}，今天好` : "今日运动员状态";

  return (
    <section className="athlete-dashboard" aria-labelledby="athlete-status-title">
      <div className="athlete-copy">
        <div className="dashboard-kicker">
          <Sparkles size={15} />
          <span>本地健康指挥中心</span>
        </div>
        <h1 id="athlete-status-title">{greeting}</h1>
        <p>{latest ? report.readinessLabel : "完成一次晨起测量，建立你的个人恢复基线。"}</p>

        <button className="scan-cta" type="button" onClick={onStart} disabled={running}>
          <Play size={20} fill="currentColor" />
          <span>{running ? "正在测量" : "开始生物信号扫描"}</span>
        </button>
        <button className="text-link-button" type="button" onClick={onOpenInsights}>
          <span>查看训练与恢复洞察</span>
          <ArrowRight size={16} />
        </button>
      </div>

      <div className="readiness-orbit" style={{ "--readiness": `${score * 3.6}deg` } as React.CSSProperties}>
        <div className="readiness-orbit-inner">
          <span>READINESS</span>
          <strong>{report.readinessScore ?? "--"}</strong>
          <small>{report.readinessLabel}</small>
        </div>
      </div>

      <div className="vital-summary-grid">
        <article>
          <HeartPulse size={18} />
          <span>静息心率</span>
          <strong>{metric(latest?.avgBpm, "BPM", 1)}</strong>
          <small>{report.trendLabel}</small>
        </article>
        <article>
          <Activity size={18} />
          <span>HRV · RMSSD</span>
          <strong>{metric(latest?.hrv?.rmssd, "ms")}</strong>
          <small>{latest?.hrv ? `压力指数 ${latest.hrv.stressIndex}` : "建议测量 30 秒以上"}</small>
        </article>
        <article>
          <Wind size={18} />
          <span>呼吸率</span>
          <strong>{metric(latest?.avgRespirationRate, "次/分", 1)}</strong>
          <small>{latest?.respirationConfidence ? `可信度 ${Math.round(latest.respirationConfidence * 100)}%` : "从 rPPG 慢波估算"}</small>
        </article>
        <article>
          <Activity size={18} />
          <span>训练新鲜度</span>
          <strong>{trainingLogs.length ? `${load.freshness > 0 ? "+" : ""}${load.freshness}` : "--"}</strong>
          <small>{load.label}</small>
        </article>
      </div>
    </section>
  );
}
