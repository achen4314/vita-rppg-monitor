import { Moon, Sunrise, Dumbbell, Gauge } from "lucide-react";
import type { AthleteCheckIn, MeasurementContext } from "../lib/localDb";

interface MeasurementProtocolPanelProps {
  context: MeasurementContext;
  checkIn: AthleteCheckIn;
  disabled?: boolean;
  onContextChange: (context: MeasurementContext) => void;
  onCheckInChange: (checkIn: AthleteCheckIn) => void;
}

const CONTEXTS: Array<{ value: MeasurementContext; label: string; detail: string; icon: typeof Gauge }> = [
  { value: "general", label: "普通测量", detail: "日常状态", icon: Gauge },
  { value: "morning", label: "晨起静息", detail: "训练准备度", icon: Sunrise },
  { value: "post_exercise", label: "运动后恢复", detail: "恢复心率", icon: Dumbbell },
  { value: "sleep_prep", label: "睡前状态", detail: "睡眠准备", icon: Moon },
];

const willingnessOptions: Array<{ value: AthleteCheckIn["willingness"]; label: string }> = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];

export function MeasurementProtocolPanel({
  context,
  checkIn,
  disabled = false,
  onContextChange,
  onCheckInChange,
}: MeasurementProtocolPanelProps) {
  return (
    <section className="panel protocol-panel">
      <div className="panel-title">
        <Gauge size={16} />
        <span>测量场景与自评</span>
      </div>

      <div className="protocol-grid">
        {CONTEXTS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={`protocol-option ${context === item.value ? "protocol-active" : ""}`}
              type="button"
              key={item.value}
              disabled={disabled}
              onClick={() => onContextChange(item.value)}
            >
              <Icon size={16} />
              <span>{item.label}</span>
              <small>{item.detail}</small>
            </button>
          );
        })}
      </div>

      <div className="checkin-grid">
        <label>
          <span>RPE</span>
          <input
            type="range"
            min="1"
            max="10"
            value={checkIn.rpe ?? 5}
            disabled={disabled}
            onChange={(event) => onCheckInChange({ ...checkIn, rpe: Number(event.target.value) })}
          />
          <strong>{checkIn.rpe ?? "--"}/10</strong>
        </label>
        <label>
          <span>睡眠质量</span>
          <input
            type="range"
            min="1"
            max="5"
            value={checkIn.sleepQuality ?? 3}
            disabled={disabled}
            onChange={(event) => onCheckInChange({ ...checkIn, sleepQuality: Number(event.target.value) })}
          />
          <strong>{checkIn.sleepQuality ?? "--"}/5</strong>
        </label>
      </div>

      <div className="willingness-row">
        <span>今日训练意愿</span>
        <div>
          {willingnessOptions.map((option) => (
            <button
              className={checkIn.willingness === option.value ? "mini-choice mini-choice-active" : "mini-choice"}
              type="button"
              disabled={disabled}
              key={option.value}
              onClick={() => onCheckInChange({ ...checkIn, willingness: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        className="checkin-note"
        value={checkIn.note}
        disabled={disabled}
        onChange={(event) => onCheckInChange({ ...checkIn, note: event.target.value })}
        placeholder="可选：睡眠、疲劳、疼痛、训练备注"
      />
    </section>
  );
}
