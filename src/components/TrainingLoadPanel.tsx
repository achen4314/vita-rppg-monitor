import { Activity, Dumbbell, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { TrainingLog, TrainingZone } from "../lib/localDb";
import type { TrainingLogInput } from "../hooks/useTrainingLogs";
import { buildTrainingLoadSummary } from "../lib/training";

const ZONES: Array<{ value: TrainingZone; label: string; description: string }> = [
  { value: "z1", label: "Z1", description: "恢复" },
  { value: "z2", label: "Z2", description: "有氧基础" },
  { value: "z3", label: "Z3", description: "节奏" },
  { value: "z4", label: "Z4", description: "阈值" },
  { value: "z5", label: "Z5", description: "无氧" },
];

interface TrainingLoadPanelProps {
  logs: readonly TrainingLog[];
  error: string | null;
  onAdd: (input: TrainingLogInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

function localDateValue(timestamp = Date.now()): string {
  const date = new Date(timestamp - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 10);
}

export function TrainingLoadPanel({ logs, error, onAdd, onRemove }: TrainingLoadPanelProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [date, setDate] = useState(localDateValue());
  const [duration, setDuration] = useState(45);
  const [rpe, setRpe] = useState(5);
  const [zone, setZone] = useState<TrainingZone>("z2");
  const [activity, setActivity] = useState("跑步");
  const [note, setNote] = useState("");
  const summary = useMemo(() => buildTrainingLoadSummary(logs), [logs]);
  const chartMax = Math.max(1, ...summary.dailyLoads);
  const zoneTotal = Math.max(1, Object.values(summary.zoneLoads).reduce((sum, value) => sum + value, 0));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onAdd({
      performedAt: new Date(`${date}T12:00:00`).getTime(),
      durationMinutes: duration,
      rpe,
      zone,
      activity,
      note,
    });
    setNote("");
    setFormOpen(false);
  };

  return (
    <section className="training-load-panel">
      <div className="section-heading compact-heading">
        <div>
          <span>TRAINING LOAD</span>
          <h2>训练负荷与新鲜度</h2>
        </div>
        <button className="small-action" type="button" onClick={() => setFormOpen((value) => !value)}>
          <Plus size={15} />
          <span>记录训练</span>
        </button>
      </div>

      {formOpen && (
        <form className="training-log-form" onSubmit={submit}>
          <label><span>日期</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
          <label><span>项目</span><input value={activity} onChange={(event) => setActivity(event.target.value)} placeholder="跑步 / 力量 / 足球" required /></label>
          <label><span>时长</span><input type="number" min="1" max="600" value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
          <label><span>RPE</span><input type="number" min="1" max="10" value={rpe} onChange={(event) => setRpe(Number(event.target.value))} /></label>
          <div className="zone-picker" role="radiogroup" aria-label="训练强度区间">
            {ZONES.map((item) => (
              <button key={item.value} type="button" className={zone === item.value ? "active" : ""} onClick={() => setZone(item.value)}>
                <strong>{item.label}</strong><small>{item.description}</small>
              </button>
            ))}
          </div>
          <label className="training-note"><span>备注</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="可选" /></label>
          <button className="scan-cta training-submit" type="submit"><Dumbbell size={17} /><span>保存训练</span></button>
        </form>
      )}

      <div className="load-kpi-grid">
        <article><span>新鲜度 TSB</span><strong>{logs.length ? `${summary.freshness > 0 ? "+" : ""}${summary.freshness}` : "--"}</strong><small>{summary.label}</small></article>
        <article><span>长期适应 CTL</span><strong>{logs.length ? summary.fitness : "--"}</strong><small>28 天指数加权</small></article>
        <article><span>短期疲劳 ATL</span><strong>{logs.length ? summary.fatigue : "--"}</strong><small>7 天指数加权</small></article>
      </div>

      <div className="load-detail-grid">
        <article className="load-chart-card">
          <div className="load-card-title"><Activity size={15} /><span>28 天负荷动态</span></div>
          <div className="load-bars">
            {summary.dailyLoads.map((value, index) => (
              <span key={index} className={index >= 21 ? "recent" : ""} style={{ height: `${Math.max(3, (value / chartMax) * 100)}%` }} title={`${value} AU`} />
            ))}
          </div>
          <div className="load-axis"><span>28 天前</span><span>今天</span></div>
        </article>

        <article className="zone-distribution-card">
          <div className="load-card-title"><Dumbbell size={15} /><span>本周强度分布</span></div>
          {ZONES.map((item) => (
            <div className="zone-row" key={item.value}>
              <span>{item.label} · {item.description}</span>
              <strong>{summary.zoneLoads[item.value]} AU</strong>
              <i><b style={{ width: `${(summary.zoneLoads[item.value] / zoneTotal) * 100}%` }} /></i>
            </div>
          ))}
        </article>
      </div>

      <div className="training-log-list">
        {logs.slice(0, 5).map((log) => (
          <div key={log.id}>
            <span><strong>{log.activity}</strong><small>{new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(log.performedAt)} · {log.durationMinutes}min · RPE {log.rpe} · {log.zone.toUpperCase()}</small></span>
            <em>{log.load} AU</em>
            <button type="button" onClick={() => void onRemove(log.id)} aria-label={`删除 ${log.activity} 训练记录`}><Trash2 size={15} /></button>
          </div>
        ))}
        {logs.length === 0 && <p>暂无训练日志。记录时长和 RPE 后，这里会计算 CTL、ATL 与 TSB。</p>}
      </div>
      {error && <div className="error-text">{error}</div>}
    </section>
  );
}
