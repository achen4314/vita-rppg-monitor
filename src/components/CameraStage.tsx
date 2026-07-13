import { Camera, FlaskConical, RefreshCcw, Square } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { useEffect, useRef, type RefObject } from "react";
import type { CameraDevice, PipelineState } from "../hooks/useRppgPipeline";
import { TrendChart, WaveChart } from "./Charts";

interface CameraStageProps {
  videoRef: RefObject<HTMLVideoElement>;
  overlayRef: RefObject<HTMLCanvasElement>;
  state: PipelineState;
  onStart: () => void;
  onStartDemo: () => void;
  onStop: () => void;
  devices: CameraDevice[];
  selectedDeviceId: string;
  permissionState: PermissionState | "unknown";
  onSelectDevice: (deviceId: string) => void;
  onRefreshDevices: () => void;
}

function permissionText(permissionState: PermissionState | "unknown"): string {
  switch (permissionState) {
    case "granted":
      return "摄像头已允许";
    case "denied":
      return "摄像头被阻止";
    case "prompt":
      return "等待授权";
    default:
      return "权限未知";
  }
}

export function CameraStage({
  videoRef,
  overlayRef,
  state,
  onStart,
  onStartDemo,
  onStop,
  devices,
  selectedDeviceId,
  permissionState,
  onSelectDevice,
  onRefreshDevices,
}: CameraStageProps) {
  const liveQuality = Math.round(state.signalQuality * 100);
  const lockText = state.status === "CALIBRATING" ? `${state.calibrationRemaining.toFixed(1)}s` : state.acceptedSignal ? "已锁定" : "等待";
  const countdown = state.running && state.elapsedSeconds < 3 ? 3 - Math.floor(state.elapsedSeconds) : null;
  const measurementProgress = Math.min(100, (state.elapsedSeconds / 20) * 100);
  const lockVibratedRef = useRef(false);

  useEffect(() => {
    if (!state.running) {
      lockVibratedRef.current = false;
      return;
    }

    if (state.acceptedSignal && !lockVibratedRef.current) {
      lockVibratedRef.current = true;
      if (Capacitor.isNativePlatform()) {
        void Haptics.impact({ style: ImpactStyle.Medium });
      } else {
        navigator.vibrate?.([35, 25, 35]);
      }
    }
  }, [state.acceptedSignal, state.running]);

  return (
    <section className="camera-stage">
      <div className="stage-header">
        <div>
          <div className="brand">VITA.IO</div>
          <div className="stage-subtitle">生物信号扫描 · 远程 PPG</div>
        </div>
        <div className="stage-control-stack">
          <div className="camera-picker">
            <select
              aria-label="Camera device"
              value={selectedDeviceId}
              onChange={(event) => onSelectDevice(event.target.value)}
              disabled={state.running || devices.length === 0}
            >
              {devices.length === 0 ? (
                <option value="">未检测到摄像头</option>
              ) : (
                devices.map((device) => (
                  <option value={device.deviceId} key={device.deviceId}>
                    {device.label}
                  </option>
                ))
              )}
            </select>
            <button className="icon-only-button" type="button" onClick={onRefreshDevices} disabled={state.running} title="重新检测摄像头">
              <RefreshCcw size={16} />
            </button>
            <span className={`permission-pill permission-${permissionState}`}>{permissionText(permissionState)}</span>
          </div>
          <div className="stage-actions">
            <button className="icon-button primary" type="button" onClick={onStart} disabled={state.running}>
              <Camera size={17} />
              <span>开始</span>
            </button>
            <button className="icon-button" type="button" onClick={onStartDemo} disabled={state.running}>
              <FlaskConical size={16} />
              <span>演示</span>
            </button>
            <button className="icon-button" type="button" onClick={onStop} disabled={!state.running}>
              <Square size={15} />
              <span>停止</span>
            </button>
          </div>
        </div>
      </div>

      <div className="video-shell">
        <video ref={videoRef} className="camera-video mirrored" autoPlay muted playsInline />
        <canvas ref={overlayRef} className="roi-overlay mirrored" />
        <div className="scanline" />
        <div className="corner corner-tl" />
        <div className="corner corner-tr" />
        <div className="corner corner-bl" />
        <div className="corner corner-br" />
        <div className="background-tag">背景对照</div>
        <div className="roi-tag">脸部 ROI</div>
        <div className={`scan-status-pill scan-status-${state.guidance.severity}`}>
          <i />
          <span>{state.running ? state.guidance.message : "将脸部置于椭圆中央"}</span>
        </div>
        <div className={`face-guide-ring face-guide-${state.guidance.severity}`}>
          <span>{state.guidance.message}</span>
        </div>
        {countdown !== null && <div className="countdown-overlay">{countdown}</div>}
      </div>

      <div className="scan-metrics-strip">
        <div><span>SNR</span><strong>{state.snrDb.toFixed(1)} <small>dB</small></strong></div>
        <div><span>置信度</span><strong>{Math.round(state.confidence * 100)}<small>%</small></strong></div>
        <div><span>稳定性</span><strong>{Math.round(state.qualityFactors.stability * 100)}<small>%</small></strong></div>
        <div className="scan-progress-metric">
          <span>采集进度</span>
          <i style={{ "--scan-progress": `${measurementProgress * 3.6}deg` } as React.CSSProperties}><b>{Math.round(state.elapsedSeconds)}s</b></i>
        </div>
      </div>

      <div className="live-chart-dock">
        <div className="live-card live-card-wave">
          <div className="live-card-title">
            <span>实时脉搏波</span>
            <strong>{state.bpm === null ? "--" : `${state.bpm.toFixed(1)} BPM`}</strong>
          </div>
          <WaveChart values={state.pulseWave} compact />
        </div>
        <div className="live-card live-card-trend">
          <div className="live-card-title">
            <span>趋势</span>
            <strong>{Math.round(state.elapsedSeconds)}s</strong>
          </div>
          <TrendChart history={state.history} compact />
        </div>
        <div className="live-card live-card-lock">
          <div className="live-card-title">
            <span>信号锁定</span>
            <strong>{lockText}</strong>
          </div>
          <div className="lock-meter" aria-label="Signal quality">
            <div className="lock-meter-fill" style={{ height: `${liveQuality}%` }} />
          </div>
          <div className="lock-readout">
            <span>质量</span>
            <strong>{liveQuality}%</strong>
          </div>
          <div className="lock-readout">
            <span>SNR</span>
            <strong>{state.snrDb.toFixed(1)} dB</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
