import { Activity, Download, Film, HeartPulse, Sparkles } from "lucide-react";
import { useState } from "react";
import { CameraStage } from "./components/CameraStage";
import { CinematicBackdrop } from "./components/CinematicBackdrop";
import { SpectrumChart, TrendChart, WaveChart } from "./components/Charts";
import { LocalRecordsPanel } from "./components/LocalRecordsPanel";
import { MeasurementProtocolPanel } from "./components/MeasurementProtocolPanel";
import { ProfilePanel } from "./components/ProfilePanel";
import { RecoveryStatusCard } from "./components/RecoveryStatusCard";
import { SessionReportPanel } from "./components/SessionReportPanel";
import { StatusPanel } from "./components/StatusPanel";
import { useCinematicMotion } from "./hooks/useCinematicMotion";
import { useLocalRecords } from "./hooks/useLocalRecords";
import { useProfile } from "./hooks/useProfile";
import { usePwaInstall } from "./hooks/usePwaInstall";
import { useRppgPipeline } from "./hooks/useRppgPipeline";
import { DEFAULT_CHECK_IN, type AthleteCheckIn, type MeasurementContext } from "./lib/localDb";
import "./styles.css";

function HeartReadout({
  bpm,
  status,
  calibrationRemaining,
}: {
  bpm: number | null;
  status: string;
  calibrationRemaining: number;
}) {
  const calibrating = status === "CALIBRATING";

  return (
    <section className="panel heart-panel">
      <div className="panel-title">
        <HeartPulse size={17} />
        <span>实时心率</span>
      </div>
      <div className={`heart-number ${bpm ? "heart-live" : ""}`}>
        {calibrating ? "CAL" : bpm === null ? "--" : bpm.toFixed(1)}
      </div>
      <div className="heart-unit">{calibrating ? `WARMING UP ${calibrationRemaining.toFixed(1)}s` : "BPM"}</div>
    </section>
  );
}

export default function App() {
  useCinematicMotion();
  const [measurementContext, setMeasurementContext] = useState<MeasurementContext>("morning");
  const [checkIn, setCheckIn] = useState<AthleteCheckIn>(DEFAULT_CHECK_IN);
  const { videoRef, overlayRef, state, start, startDemo, stop, refreshDevices, setSelectedDeviceId } =
    useRppgPipeline();
  const { sessions, storageError, clearAll, exportJson, exportCsv } = useLocalRecords(
    state,
    measurementContext,
    checkIn,
  );
  const { profile, profileError, updateProfile } = useProfile();
  const { canInstall, installed, install } = usePwaInstall();

  return (
    <div className="cinematic-app">
      <CinematicBackdrop />
      <div className="letterbox letterbox-top" />
      <div className="letterbox letterbox-bottom" />

      <header className="app-command-bar">
        <div className="command-brand">
          <Film size={17} />
          <span>VITA.IO 生命监护实验室</span>
        </div>
        <nav className="command-nav" aria-label="应用导航">
          <a href="#monitor">采样舱</a>
          <a href="#report">报告舱</a>
          <a href="#science">方法</a>
          <button className="install-button" type="button" onClick={install} disabled={!canInstall || installed}>
            <Download size={15} />
            <span>{installed ? "已安装" : canInstall ? "安装 App" : "可添加到主屏幕"}</span>
          </button>
        </nav>
      </header>

      <main className="storyboard">
        <section className="story-panel hero-scene" data-cinematic-scene>
          <div className="scene-content hero-content" data-scene-content>
            <div className="scene-kicker">
              <Sparkles size={16} />
              <span>远程 PPG · 电影级本地生命仪表</span>
            </div>
            <h1>用摄像头读出皮肤下的心跳。</h1>
            <p>
              本应用在本机浏览器内完成脸部 ROI、POS 信号提取、频谱寻峰、质量门控、趋势记录和运动科学报告。
              数据默认只保存在你的设备内。
            </p>
            <div className="hero-metrics">
              <div>
                <span>算法</span>
                <strong>POS + FFT</strong>
              </div>
              <div>
                <span>报告</span>
                <strong>本地档案</strong>
              </div>
              <div>
                <span>形态</span>
                <strong>PWA App</strong>
              </div>
            </div>
            <div className="hero-actions">
              <a className="cinema-button primary" href="#monitor">
                进入采样舱
              </a>
              <a className="cinema-button" href="#report">
                查看报告框架
              </a>
            </div>
          </div>
        </section>

        <section id="monitor" className="story-panel monitor-scene" data-cinematic-scene>
          <div className="scene-content monitor-content" data-scene-content>
            <div className="scene-heading">
              <span>SCENE 01</span>
              <h2>实时采样舱</h2>
              <p>面对摄像头，保持静止。校准结束后质量门控会锁定可信读数。</p>
            </div>
            <div className="app-shell cinematic-shell">
              <CameraStage
                videoRef={videoRef}
                overlayRef={overlayRef}
                state={state}
                onStart={start}
                onStartDemo={startDemo}
                onStop={stop}
                devices={state.devices}
                selectedDeviceId={state.selectedDeviceId}
                permissionState={state.permissionState}
                onSelectDevice={setSelectedDeviceId}
                onRefreshDevices={refreshDevices}
              />

              <aside className="data-stack">
                <HeartReadout bpm={state.bpm} status={state.status} calibrationRemaining={state.calibrationRemaining} />
                <MeasurementProtocolPanel
                  context={measurementContext}
                  checkIn={checkIn}
                  disabled={state.running}
                  onContextChange={setMeasurementContext}
                  onCheckInChange={setCheckIn}
                />
                <StatusPanel state={state} />

                <section className="panel chart-panel">
                  <div className="panel-title">脉搏波形</div>
                  <WaveChart values={state.pulseWave} />
                </section>

                <section className="panel chart-panel">
                  <div className="panel-title">皮肤频谱</div>
                  <SpectrumChart bins={state.skinSpectrum} peakBpm={state.skinPeakBpm} tone="skin" />
                </section>

                <section className="panel chart-panel">
                  <div className="panel-title">背景对照频谱</div>
                  <SpectrumChart bins={state.backgroundSpectrum} peakBpm={state.backgroundPeakBpm} tone="background" />
                </section>
              </aside>
            </div>
          </div>
        </section>

        <section id="report" className="story-panel report-scene" data-cinematic-scene>
          <div className="scene-content report-content" data-scene-content>
            <div className="scene-heading">
              <span>SCENE 02</span>
              <h2>个人档案与运动科学报告</h2>
              <p>测量结束后自动生成本次报告、近期趋势和训练调整建议。</p>
            </div>
            <div className="report-stage-grid">
              <RecoveryStatusCard profile={profile} sessions={sessions} />
              <ProfilePanel profile={profile} error={profileError} onSave={updateProfile} />
              <SessionReportPanel profile={profile} sessions={sessions} />
              <section className="panel chart-panel history-panel-wide">
                <div className="panel-title">
                  <Activity size={16} />
                  <span>本次历史趋势</span>
                </div>
                <TrendChart history={state.history} />
              </section>
              <LocalRecordsPanel
                sessions={sessions}
                error={storageError}
                onExport={exportJson}
                onExportCsv={exportCsv}
                onClear={clearAll}
              />
            </div>
          </div>
        </section>

        <section id="science" className="story-panel science-scene" data-cinematic-scene>
          <div className="scene-content science-content" data-scene-content>
            <div className="scene-heading">
              <span>SCENE 03</span>
              <h2>方法与边界</h2>
              <p>这是一套本地计算的训练辅助仪表，不是医疗器械。</p>
            </div>
            <div className="science-grid">
              <div className="science-card" data-parallax="0.06">
                <span>01</span>
                <strong>POS 信号</strong>
                <p>从额头和双颊 ROI 提取 RGB 时间序列，投影出与肤色正交的 rPPG 波形。</p>
              </div>
              <div className="science-card" data-parallax="0.1">
                <span>02</span>
                <strong>频谱寻峰</strong>
                <p>带通滤波、汉宁窗、radix-2 FFT 与抛物线插值，定位 45–240 BPM 的主峰。</p>
              </div>
              <div className="science-card" data-parallax="0.14">
                <span>03</span>
                <strong>质量门控</strong>
                <p>同时评估 SNR、背景对照、亮度、采样抖动和心率连续性，降低误判。</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
