import {
  Activity,
  BarChart3,
  Camera,
  Download,
  HeartPulse,
  History,
  Home,
  Settings,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AthleteDashboard } from "./components/AthleteDashboard";
import { CameraStage } from "./components/CameraStage";
import { CinematicBackdrop } from "./components/CinematicBackdrop";
import { SpectrumChart, TrendChart, WaveChart } from "./components/Charts";
import { DataSettingsPanel } from "./components/DataSettingsPanel";
import { InsightsDashboard } from "./components/InsightsDashboard";
import { LocalRecordsPanel } from "./components/LocalRecordsPanel";
import { MeasurementComplete } from "./components/MeasurementComplete";
import { MeasurementProtocolPanel } from "./components/MeasurementProtocolPanel";
import { ProfilePanel } from "./components/ProfilePanel";
import { RecoveryStatusCard } from "./components/RecoveryStatusCard";
import { SessionReportPanel } from "./components/SessionReportPanel";
import { StatusPanel } from "./components/StatusPanel";
import { TrainingLoadPanel } from "./components/TrainingLoadPanel";
import { useLocalRecords } from "./hooks/useLocalRecords";
import { useProfile } from "./hooks/useProfile";
import { usePwaInstall } from "./hooks/usePwaInstall";
import { useRppgPipeline } from "./hooks/useRppgPipeline";
import { useTrainingLogs } from "./hooks/useTrainingLogs";
import { DEFAULT_CHECK_IN, type AthleteCheckIn, type MeasurementContext, type MeasurementSession } from "./lib/localDb";
import "./styles.css";

type AppView = "home" | "scan" | "insights" | "records" | "profile";

const AUTO_COMPLETE_SECONDS = 25;

const NAV_ITEMS: Array<{ view: AppView; label: string; icon: typeof Home }> = [
  { view: "home", label: "首页", icon: Home },
  { view: "scan", label: "测量", icon: Camera },
  { view: "insights", label: "洞察", icon: BarChart3 },
  { view: "records", label: "记录", icon: History },
  { view: "profile", label: "档案", icon: UserRound },
];

function HeartReadout({ bpm, status, calibrationRemaining }: { bpm: number | null; status: string; calibrationRemaining: number }) {
  const calibrating = status === "CALIBRATING";
  return (
    <section className="panel heart-panel">
      <div className="panel-title"><HeartPulse size={17} /><span>实时心率</span></div>
      <div className={`heart-number ${bpm ? "heart-live" : ""}`}>{calibrating ? "CAL" : bpm === null ? "--" : bpm.toFixed(1)}</div>
      <div className="heart-unit">{calibrating ? `校准中 ${calibrationRemaining.toFixed(1)}s` : "BPM"}</div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="section-heading">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>("home");
  const [measurementContext, setMeasurementContext] = useState<MeasurementContext>("morning");
  const [checkIn, setCheckIn] = useState<AthleteCheckIn>(DEFAULT_CHECK_IN);
  const [completedSession, setCompletedSession] = useState<MeasurementSession | null>(null);
  const previousRunningRef = useRef(false);
  const runStartedAtRef = useRef(0);
  const awaitingCompletionRef = useRef(false);
  const autoStoppedRef = useRef(false);

  const { videoRef, overlayRef, state, start, startDemo, stop, refreshDevices, setSelectedDeviceId } = useRppgPipeline();
  const { sessions, storageError, clearAll, exportJson, exportCsv } = useLocalRecords(state, measurementContext, checkIn);
  const { profile, profileError, updateProfile } = useProfile();
  const { logs: trainingLogs, error: trainingError, addLog, removeLog } = useTrainingLogs();
  const { canInstall, installed, install } = usePwaInstall();
  const latestSession = sessions.find((session) => session.endedAt !== null && session.avgBpm !== null) ?? null;

  const openView = useCallback((view: AppView) => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const beginMeasurement = useCallback(() => {
    setCompletedSession(null);
    setActiveView("scan");
    window.setTimeout(() => void start(), 80);
  }, [start]);

  const beginDemo = useCallback(() => {
    setCompletedSession(null);
    setActiveView("scan");
    void startDemo();
  }, [startDemo]);

  useEffect(() => {
    if (state.running && !previousRunningRef.current) {
      runStartedAtRef.current = Date.now();
      awaitingCompletionRef.current = false;
      autoStoppedRef.current = false;
    }

    if (!state.running && previousRunningRef.current && state.history.length > 0) {
      awaitingCompletionRef.current = true;
    }

    previousRunningRef.current = state.running;
  }, [state.history.length, state.running]);

  useEffect(() => {
    const latest = sessions[0];
    if (!awaitingCompletionRef.current || !latest?.endedAt) return;
    if (latest.startedAt < runStartedAtRef.current - 2_000) return;
    awaitingCompletionRef.current = false;
    setCompletedSession(latest);
  }, [sessions]);

  useEffect(() => {
    if (!state.running) return;
    if (autoStoppedRef.current) return;
    if (state.elapsedSeconds < AUTO_COMPLETE_SECONDS || !state.acceptedSignal || state.history.length < 10) return;
    autoStoppedRef.current = true;
    stop();
  }, [state.acceptedSignal, state.elapsedSeconds, state.history.length, state.running, stop]);

  useEffect(() => {
    if (!state.running) return undefined;
    const wakeLockApi = (navigator as Navigator & {
      wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> };
    }).wakeLock;
    if (!wakeLockApi) return undefined;

    let released = false;
    let lock: { release(): Promise<void> } | null = null;
    void wakeLockApi.request("screen").then((value) => {
      if (released) void value.release();
      else lock = value;
    }).catch(() => undefined);

    return () => {
      released = true;
      if (lock) void lock.release();
    };
  }, [state.running]);

  return (
    <div className={`native-app view-${activeView} ${state.running ? "measurement-running" : ""}`}>
      <CinematicBackdrop active={!state.running} />

      <header className="native-topbar">
        <button className="topbar-brand" type="button" onClick={() => openView("home")} aria-label="返回首页">
          <span>VITA.IO</span>
          <small>ATHLETE COMMAND</small>
        </button>
        <div className="topbar-status"><i /> 系统就绪</div>
        <button className="topbar-icon" type="button" onClick={() => openView("profile")} aria-label="打开设置" title="档案与设置">
          <Settings size={20} />
        </button>
      </header>

      <main className="native-content">
        {activeView === "home" && (
          <div className="app-view app-home-view">
            <AthleteDashboard
              profile={profile}
              sessions={sessions}
              trainingLogs={trainingLogs}
              running={state.running}
              onStart={beginMeasurement}
              onOpenInsights={() => openView("insights")}
            />
            <RecoveryStatusCard profile={profile} sessions={sessions} />
            <section className="home-quick-actions">
              <button type="button" onClick={beginMeasurement}><Camera size={18} /><span><strong>晨起准备度</strong><small>摄像头测量</small></span></button>
              <button type="button" onClick={() => openView("insights")}><Activity size={18} /><span><strong>恢复洞察</strong><small>趋势与训练负荷</small></span></button>
              <button type="button" onClick={() => openView("records")}><History size={18} /><span><strong>历史报告</strong><small>本地记录</small></span></button>
            </section>
          </div>
        )}

        {activeView === "scan" && (
          <div className="app-view app-scan-view">
            <SectionHeading eyebrow="BIOMETRIC SCAN" title="生物信号扫描" description="保持正面均匀光照与自然呼吸，系统会选取最佳 10 秒窗口。" />
            <div className="app-shell native-monitor-shell">
              <CameraStage
                videoRef={videoRef}
                overlayRef={overlayRef}
                state={state}
                onStart={beginMeasurement}
                onStartDemo={beginDemo}
                onStop={stop}
                devices={state.devices}
                selectedDeviceId={state.selectedDeviceId}
                permissionState={state.permissionState}
                onSelectDevice={setSelectedDeviceId}
                onRefreshDevices={refreshDevices}
              />

              <aside className="data-stack">
                <HeartReadout bpm={state.bpm} status={state.status} calibrationRemaining={state.calibrationRemaining} />
                <MeasurementProtocolPanel context={measurementContext} checkIn={checkIn} disabled={state.running} onContextChange={setMeasurementContext} onCheckInChange={setCheckIn} />
                <StatusPanel state={state} />
                <section className="panel chart-panel"><div className="panel-title">脉搏波形</div><WaveChart values={state.pulseWave} /></section>
                <section className="panel chart-panel"><div className="panel-title">皮肤频谱</div><SpectrumChart bins={state.skinSpectrum} peakBpm={state.skinPeakBpm} tone="skin" /></section>
                <section className="panel chart-panel"><div className="panel-title">背景对照频谱</div><SpectrumChart bins={state.backgroundSpectrum} peakBpm={state.backgroundPeakBpm} tone="background" /></section>
              </aside>
            </div>
          </div>
        )}

        {activeView === "insights" && (
          <div className="app-view app-insights-view">
            <InsightsDashboard profile={profile} sessions={sessions} />
            <TrainingLoadPanel logs={trainingLogs} error={trainingError} onAdd={addLog} onRemove={removeLog} />
            <SessionReportPanel profile={profile} sessions={sessions} />
          </div>
        )}

        {activeView === "records" && (
          <div className="app-view app-records-view">
            <SectionHeading eyebrow="LOCAL RECORDS" title="测量记录" description="所有报告默认仅保存在当前设备，可随时导出。" />
            <div className="records-layout">
              <LocalRecordsPanel sessions={sessions} error={storageError} onExport={exportJson} onExportCsv={exportCsv} onClear={clearAll} />
              <section className="panel chart-panel records-trend-panel"><div className="panel-title"><Activity size={16} /><span>当前采样趋势</span></div><TrendChart history={state.history} /></section>
              <SessionReportPanel profile={profile} sessions={sessions} />
            </div>
          </div>
        )}

        {activeView === "profile" && (
          <div className="app-view app-profile-view">
            <SectionHeading eyebrow="ATHLETE PROFILE" title="档案与应用" description="个人基线、训练目标与数据控制都在这里管理。" />
            <div className="profile-layout">
              <ProfilePanel profile={profile} error={profileError} onSave={updateProfile} />
              <DataSettingsPanel canInstall={canInstall} installed={installed} onInstall={install} onExportJson={exportJson} onExportCsv={exportCsv} hasRecords={sessions.length > 0 || trainingLogs.length > 0} latestSession={latestSession} />
              <section className="science-boundary panel">
                <strong>测量边界</strong>
                <p>VITA.IO 是训练与恢复趋势工具，不是医疗器械。心率异常或持续不适时，请以专业医疗设备和医生评估为准。</p>
              </section>
            </div>
          </div>
        )}
      </main>

      <nav className="native-bottom-nav" aria-label="应用主导航">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.view} type="button" className={`${activeView === item.view ? "active" : ""} ${item.view === "scan" ? "scan-nav-button" : ""}`} onClick={() => openView(item.view)}>
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {!installed && canInstall && (
        <button className="floating-install" type="button" onClick={install}><Download size={16} /><span>安装 App</span></button>
      )}

      {completedSession && (
        <MeasurementComplete
          session={completedSession}
          profile={profile}
          sessions={sessions}
          onClose={() => { setCompletedSession(null); openView("home"); }}
          onViewReport={() => { setCompletedSession(null); openView("insights"); }}
        />
      )}
    </div>
  );
}
