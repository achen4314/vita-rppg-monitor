import { HeartPulse } from "lucide-react";
import { CameraStage } from "./components/CameraStage";
import { SpectrumChart, TrendChart, WaveChart } from "./components/Charts";
import { StatusPanel } from "./components/StatusPanel";
import { useRppgPipeline } from "./hooks/useRppgPipeline";
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
        <span>HEART RATE</span>
      </div>
      <div className={`heart-number ${bpm ? "heart-live" : ""}`}>
        {calibrating ? "CAL" : bpm === null ? "--" : bpm.toFixed(1)}
      </div>
      <div className="heart-unit">{calibrating ? `WARMING UP ${calibrationRemaining.toFixed(1)}s` : "BPM"}</div>
    </section>
  );
}

export default function App() {
  const { videoRef, overlayRef, state, start, startDemo, stop, refreshDevices, setSelectedDeviceId } =
    useRppgPipeline();

  return (
    <main className="app-shell">
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
        <StatusPanel state={state} />

        <section className="panel chart-panel">
          <div className="panel-title">PULSE WAVEFORM</div>
          <WaveChart values={state.pulseWave} />
        </section>

        <section className="panel chart-panel">
          <div className="panel-title">SKIN SPECTRUM</div>
          <SpectrumChart bins={state.skinSpectrum} peakBpm={state.skinPeakBpm} tone="skin" />
        </section>

        <section className="panel chart-panel">
          <div className="panel-title">BACKGROUND CONTROL</div>
          <SpectrumChart bins={state.backgroundSpectrum} peakBpm={state.backgroundPeakBpm} tone="background" />
        </section>

        <section className="panel chart-panel">
          <div className="panel-title">HISTORY TREND</div>
          <TrendChart history={state.history} />
        </section>
      </aside>
    </main>
  );
}
