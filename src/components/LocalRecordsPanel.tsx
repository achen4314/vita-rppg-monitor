import { Database, Download, Trash2 } from "lucide-react";
import type { MeasurementSession } from "../lib/localDb";

interface LocalRecordsPanelProps {
  sessions: readonly MeasurementSession[];
  error: string | null;
  onExport: () => void;
  onExportCsv: () => void;
  onClear: () => void;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function contextText(context: MeasurementSession["context"] | undefined): string {
  switch (context) {
    case "morning":
      return "晨起";
    case "post_exercise":
      return "运动后";
    case "sleep_prep":
      return "睡前";
    default:
      return "普通";
  }
}

export function LocalRecordsPanel({ sessions, error, onExport, onExportCsv, onClear }: LocalRecordsPanelProps) {
  const latest = sessions[0];

  return (
    <section className="panel records-panel">
      <div className="panel-title">
        <Database size={16} />
        <span>LOCAL RECORDS</span>
      </div>

      <div className="records-summary">
        <div>
          <span>SESSIONS</span>
          <strong>{sessions.length}</strong>
        </div>
        <div>
          <span>LATEST AVG</span>
          <strong>{latest?.avgBpm ? `${latest.avgBpm} BPM` : "--"}</strong>
        </div>
      </div>

      <div className="record-actions">
        <button className="small-action" type="button" onClick={onExport} disabled={sessions.length === 0}>
          <Download size={14} />
          <span>JSON</span>
        </button>
        <button className="small-action" type="button" onClick={onExportCsv} disabled={sessions.length === 0}>
          <Download size={14} />
          <span>CSV</span>
        </button>
        <button className="small-action danger" type="button" onClick={onClear} disabled={sessions.length === 0}>
          <Trash2 size={14} />
          <span>CLEAR</span>
        </button>
      </div>

      <div className="record-list">
        {sessions.slice(0, 5).map((session) => (
          <div className="record-row" key={session.id}>
            <div>
              <strong>{session.avgBpm ? `${session.avgBpm} BPM` : "-- BPM"}</strong>
              <span>
                {formatTime(session.startedAt)} · {contextText(session.context)} · {session.durationSeconds}s
              </span>
            </div>
            <div>
              <strong>{session.hrv ? `${session.hrv.rmssd}ms` : `${Math.round(session.avgConfidence * 100)}%`}</strong>
              <span>{session.avgRespirationRate ? `${session.avgRespirationRate}/min` : `${session.pointCount} pts`}</span>
            </div>
          </div>
        ))}
        {sessions.length === 0 && <div className="records-empty">本机暂无测量记录</div>}
      </div>

      {error && <div className="error-text">{error}</div>}
    </section>
  );
}
