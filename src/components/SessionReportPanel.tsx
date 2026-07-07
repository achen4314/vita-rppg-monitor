import { ClipboardList, Target, TrendingUp } from "lucide-react";
import type { MeasurementSession, PersonalProfile, SavedTrendPoint } from "../lib/localDb";
import { buildSessionReport } from "../lib/report";

interface SessionReportPanelProps {
  profile: PersonalProfile;
  sessions: readonly MeasurementSession[];
}

function formatDelta(delta: number | null): string {
  if (delta === null) return "--";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)} BPM`;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function pointsPath(points: readonly SavedTrendPoint[], width: number, height: number): string {
  if (points.length === 0) return "";
  const padding = 14;
  const bpms = points.map((point) => point.bpm);
  const minBpm = Math.min(...bpms) - 3;
  const maxBpm = Math.max(...bpms) + 3;
  const span = Math.max(6, maxBpm - minBpm);
  const maxOffset = Math.max(1, points[points.length - 1].offsetSeconds);
  return points
    .map((point) => {
      const x = padding + (point.offsetSeconds / maxOffset) * (width - padding * 2);
      const y = height - padding - ((point.bpm - minBpm) / span) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function sessionsPath(sessions: readonly MeasurementSession[], width: number, height: number): string {
  const valid = sessions
    .filter((session) => session.avgBpm !== null && session.pointCount > 0)
    .slice(0, 14)
    .reverse();
  if (valid.length === 0) return "";
  const padding = 14;
  const bpms = valid.map((session) => session.avgBpm ?? 0);
  const minBpm = Math.min(...bpms) - 4;
  const maxBpm = Math.max(...bpms) + 4;
  const span = Math.max(8, maxBpm - minBpm);
  return valid
    .map((session, index) => {
      const x = padding + (index / Math.max(1, valid.length - 1)) * (width - padding * 2);
      const y = height - padding - (((session.avgBpm ?? 0) - minBpm) / span) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function MiniReportChart({
  points,
  emptyText,
}: {
  points: string;
  emptyText: string;
}) {
  const width = 420;
  const height = 112;
  return (
    <svg className="chart report-mini-chart" viewBox={`0 0 ${width} ${height}`} role="img">
      <path className="chart-grid" d="M14 28 H406 M14 56 H406 M14 84 H406" />
      {points ? (
        <>
          <polyline className="trend-fill-line" points={points} />
          <polyline className="trend-line" points={points} />
        </>
      ) : (
        <text className="chart-empty" x="210" y="60" textAnchor="middle">
          {emptyText}
        </text>
      )}
    </svg>
  );
}

export function SessionReportPanel({ profile, sessions }: SessionReportPanelProps) {
  const report = buildSessionReport(profile, sessions);
  const latest = report.latest;
  const displayName = profile.displayName || "默认档案";

  return (
    <section className="panel report-panel">
      <div className="panel-title">
        <ClipboardList size={16} />
        <span>SESSION REPORT</span>
      </div>

      <div className="report-hero">
        <div>
          <span>ATHLETE</span>
          <strong>{displayName}</strong>
        </div>
        <div>
          <span>READINESS</span>
          <strong>{report.readinessScore === null ? "--" : report.readinessScore}</strong>
        </div>
        <div>
          <span>STATUS</span>
          <strong>{report.readinessLabel}</strong>
        </div>
      </div>

      <div className="report-kpi-grid">
        <div>
          <span>本次均值</span>
          <strong>{latest?.avgBpm ? `${latest.avgBpm} BPM` : "--"}</strong>
        </div>
        <div>
          <span>个人基线</span>
          <strong>{report.baselineBpm ? `${report.baselineBpm} BPM` : "--"}</strong>
        </div>
        <div>
          <span>基线差值</span>
          <strong>{formatDelta(report.deltaFromBaseline)}</strong>
        </div>
        <div>
          <span>可信度</span>
          <strong>{report.qualityLabel}</strong>
        </div>
      </div>

      <div className="report-chart-grid">
        <div className="report-chart-card">
          <div className="report-card-title">
            <TrendingUp size={14} />
            <span>本次测量曲线</span>
            <strong>{latest ? formatDate(latest.startedAt) : "--"}</strong>
          </div>
          <MiniReportChart points={latest ? pointsPath(latest.points, 420, 112) : ""} emptyText="完成测量后生成报告" />
        </div>
        <div className="report-chart-card">
          <div className="report-card-title">
            <TrendingUp size={14} />
            <span>近期趋势</span>
            <strong>{sessions.length} 次</strong>
          </div>
          <MiniReportChart points={sessionsPath(sessions, 420, 112)} emptyText="需要至少 1 次有效记录" />
        </div>
      </div>

      {report.zones && (
        <div className="zone-card">
          <div className="report-card-title">
            <Target size={14} />
            <span>训练心率区间参考</span>
            <strong>MAX {report.zones.maxHr}</strong>
          </div>
          <div className="zone-grid">
            <div>
              <span>MODERATE</span>
              <strong>
                {report.zones.moderateLow}-{report.zones.moderateHigh}
              </strong>
            </div>
            <div>
              <span>VIGOROUS</span>
              <strong>
                {report.zones.vigorousLow}-{report.zones.vigorousHigh}
              </strong>
            </div>
          </div>
        </div>
      )}

      <div className="suggestion-list">
        {report.suggestions.map((suggestion) => (
          <div className={`suggestion suggestion-${suggestion.severity}`} key={`${suggestion.title}-${suggestion.body}`}>
            <strong>{suggestion.title}</strong>
            <span>{suggestion.body}</span>
          </div>
        ))}
      </div>

      <div className="report-disclaimer">仅用于训练与恢复趋势参考，不作为诊断或医疗设备读数。</div>
    </section>
  );
}
