import { BadgeCheck, ClipboardList, HeartPulse, X } from "lucide-react";
import type { MeasurementSession, PersonalProfile } from "../lib/localDb";
import { buildSessionReport } from "../lib/report";

interface MeasurementCompleteProps {
  session: MeasurementSession;
  profile: PersonalProfile;
  sessions: readonly MeasurementSession[];
  onClose: () => void;
  onViewReport: () => void;
}

function sessionPolyline(session: MeasurementSession): string {
  if (session.points.length < 2) return "";
  const width = 520;
  const height = 104;
  const values = session.points.map((point) => point.bpm);
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const span = Math.max(6, max - min);
  const end = Math.max(1, session.points[session.points.length - 1]?.offsetSeconds ?? 1);
  return session.points
    .map((point) => {
      const x = 10 + (point.offsetSeconds / end) * (width - 20);
      const y = height - 10 - ((point.bpm - min) / span) * (height - 20);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function MeasurementComplete({ session, profile, sessions, onClose, onViewReport }: MeasurementCompleteProps) {
  const report = buildSessionReport(profile, sessions);
  const line = sessionPolyline(session);

  return (
    <div className="completion-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="completion-sheet" role="dialog" aria-modal="true" aria-labelledby="completion-title">
        <button className="completion-close" type="button" onClick={onClose} aria-label="关闭测量结果">
          <X size={20} />
        </button>
        <div className="completion-kicker">
          <BadgeCheck size={18} />
          <span>测量已完成 · 本地已保存</span>
        </div>
        <h2 id="completion-title">{profile.displayName ? `${profile.displayName}，本次状态已生成` : "本次状态已生成"}</h2>

        <div className="completion-heart">
          <HeartPulse size={32} />
          <strong>{session.avgBpm?.toFixed(1) ?? "--"}</strong>
          <span>BPM</span>
          <small>{report.qualityLabel}</small>
        </div>

        <div className="completion-metrics">
          <div><span>HRV · RMSSD</span><strong>{session.hrv ? `${session.hrv.rmssd} ms` : "--"}</strong></div>
          <div><span>呼吸率</span><strong>{session.avgRespirationRate ? `${session.avgRespirationRate}/min` : "--"}</strong></div>
          <div><span>准备度</span><strong>{report.readinessScore ?? "--"}</strong></div>
          <div><span>最佳窗口</span><strong>{session.bestWindowSeconds ? `${session.bestWindowSeconds}s` : "--"}</strong></div>
        </div>

        <div className="completion-wave">
          <span>本次心率趋势</span>
          <svg viewBox="0 0 520 104" role="img" aria-label="本次心率趋势">
            <path d="M10 26H510 M10 52H510 M10 78H510" />
            {line && <polyline points={line} />}
          </svg>
        </div>

        <button className="completion-primary" type="button" onClick={onViewReport}>
          <ClipboardList size={18} />
          <span>查看完整报告</span>
        </button>
        <button className="completion-secondary" type="button" onClick={onClose}>返回首页</button>
      </section>
    </div>
  );
}
