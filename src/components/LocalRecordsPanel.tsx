import { Database, Download, Trash2 } from "lucide-react";
import type { MeasurementSession } from "../lib/localDb";

interface LocalRecordsPanelProps {
  sessions: readonly MeasurementSession[];
  error: string | null;
  onExport: () => void;
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

export function LocalRecordsPanel({ sessions, error, onExport, onClear }: LocalRecordsPanelProps) {
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
          <span>EXPORT</span>
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
                {formatTime(session.startedAt)} · {session.mode.toUpperCase()} · {session.durationSeconds}s
              </span>
            </div>
            <div>
              <strong>{Math.round(session.avgConfidence * 100)}%</strong>
              <span>{session.pointCount} pts</span>
            </div>
          </div>
        ))}
        {sessions.length === 0 && <div className="records-empty">本机暂无测量记录</div>}
      </div>

      {error && <div className="error-text">{error}</div>}
    </section>
  );
}
