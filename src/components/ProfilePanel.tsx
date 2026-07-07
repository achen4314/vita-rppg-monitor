import { Save, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { PersonalProfile } from "../lib/localDb";

interface ProfilePanelProps {
  profile: PersonalProfile;
  error: string | null;
  onSave: (profile: PersonalProfile) => void;
}

const GOALS: Array<{ value: PersonalProfile["trainingGoal"]; label: string }> = [
  { value: "general", label: "通用健康" },
  { value: "fat_loss", label: "减脂" },
  { value: "endurance", label: "耐力" },
  { value: "performance", label: "表现提升" },
  { value: "recovery", label: "恢复管理" },
];

export function ProfilePanel({ profile, error, onSave }: ProfilePanelProps) {
  const [draft, setDraft] = useState(profile);

  useEffect(() => {
    setDraft(profile);
  }, [profile]);

  const save = () => {
    onSave({
      ...draft,
      displayName: draft.displayName.trim(),
      primarySport: draft.primarySport.trim(),
      notes: draft.notes.trim(),
    });
  };

  return (
    <section className="panel profile-panel">
      <div className="panel-title">
        <UserRound size={16} />
        <span>ATHLETE PROFILE</span>
      </div>

      <div className="profile-grid">
        <label>
          <span>姓名</span>
          <input
            value={draft.displayName}
            onChange={(event) => setDraft((previous) => ({ ...previous, displayName: event.target.value }))}
            placeholder="可选"
          />
        </label>
        <label>
          <span>年龄</span>
          <input
            inputMode="numeric"
            value={draft.age ?? ""}
            onChange={(event) => {
              const value = Number(event.target.value);
              setDraft((previous) => ({
                ...previous,
                age: event.target.value === "" || Number.isNaN(value) ? null : Math.max(10, Math.min(100, value)),
              }));
            }}
            placeholder="用于训练区间"
          />
        </label>
        <label>
          <span>项目</span>
          <input
            value={draft.primarySport}
            onChange={(event) => setDraft((previous) => ({ ...previous, primarySport: event.target.value }))}
            placeholder="跑步 / 足球 / 健身"
          />
        </label>
        <label>
          <span>每周训练</span>
          <input
            inputMode="numeric"
            value={draft.weeklySessions ?? ""}
            onChange={(event) => {
              const value = Number(event.target.value);
              setDraft((previous) => ({
                ...previous,
                weeklySessions: event.target.value === "" || Number.isNaN(value) ? null : Math.max(0, Math.min(14, value)),
              }));
            }}
            placeholder="次数"
          />
        </label>
        <label>
          <span>目标</span>
          <select
            value={draft.trainingGoal}
            onChange={(event) =>
              setDraft((previous) => ({
                ...previous,
                trainingGoal: event.target.value as PersonalProfile["trainingGoal"],
              }))
            }
          >
            {GOALS.map((goal) => (
              <option key={goal.value} value={goal.value}>
                {goal.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>性别</span>
          <select
            value={draft.sex}
            onChange={(event) =>
              setDraft((previous) => ({
                ...previous,
                sex: event.target.value as PersonalProfile["sex"],
              }))
            }
          >
            <option value="unspecified">不指定</option>
            <option value="female">女性</option>
            <option value="male">男性</option>
            <option value="other">其他</option>
          </select>
        </label>
      </div>

      <label className="profile-notes">
        <span>备注</span>
        <textarea
          value={draft.notes}
          onChange={(event) => setDraft((previous) => ({ ...previous, notes: event.target.value }))}
          placeholder="例如：晨起测量、近期训练周期、睡眠情况"
        />
      </label>

      <button className="small-action profile-save" type="button" onClick={save}>
        <Save size={14} />
        <span>SAVE PROFILE</span>
      </button>
      {error && <div className="error-text">{error}</div>}
    </section>
  );
}
