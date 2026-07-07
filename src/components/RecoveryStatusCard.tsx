import { ShieldCheck } from "lucide-react";
import type { MeasurementSession, PersonalProfile } from "../lib/localDb";
import { buildSessionReport } from "../lib/report";

interface RecoveryStatusCardProps {
  profile: PersonalProfile;
  sessions: readonly MeasurementSession[];
}

function lightClass(score: number | null): string {
  if (score === null) return "recovery-neutral";
  if (score >= 78) return "recovery-green";
  if (score >= 50) return "recovery-yellow";
  return "recovery-red";
}

function contextLabel(context: MeasurementSession["context"] | undefined): string {
  switch (context) {
    case "morning":
      return "晨起静息";
    case "post_exercise":
      return "运动后恢复";
    case "sleep_prep":
      return "睡前状态";
    default:
      return "普通测量";
  }
}

export function RecoveryStatusCard({ profile, sessions }: RecoveryStatusCardProps) {
  const report = buildSessionReport(profile, sessions);
  const latest = report.latest;

  return (
    <section className={`panel recovery-card ${lightClass(report.readinessScore)}`}>
      <div className="panel-title">
        <ShieldCheck size={16} />
        <span>运动员恢复状态</span>
      </div>
      <div className="recovery-hero">
        <div className="recovery-light" />
        <div>
          <strong>{report.readinessScore === null ? "--" : report.readinessScore}</strong>
          <span>{report.readinessLabel}</span>
        </div>
      </div>
      <div className="recovery-metrics">
        <div>
          <span>场景</span>
          <strong>{contextLabel(latest?.context)}</strong>
        </div>
        <div>
          <span>RMSSD</span>
          <strong>{latest?.hrv ? `${latest.hrv.rmssd} ms` : "--"}</strong>
        </div>
        <div>
          <span>呼吸</span>
          <strong>{latest?.avgRespirationRate ? `${latest.avgRespirationRate}/min` : "--"}</strong>
        </div>
      </div>
      <div className="recovery-note">
        {report.readinessScore === null
          ? "完成晨起测量和自评后，这里会给出当天训练准备度。"
          : report.readinessScore < 50
            ? "建议调整今日训练，优先恢复、技术或低强度内容。"
            : report.readinessScore < 78
              ? "可以训练，但建议控制总量并观察热身反馈。"
              : "状态良好，可按计划训练。"}
      </div>
    </section>
  );
}
