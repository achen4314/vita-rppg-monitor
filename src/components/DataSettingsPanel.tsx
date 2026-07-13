import { useEffect, useMemo, useState } from "react";
import { Apple, Database, Download, ExternalLink, HeartPulse, ShieldCheck, Smartphone } from "lucide-react";
import type { MeasurementSession } from "../lib/localDb";
import {
  getNativeHealthPlatform,
  getNativeHealthStatus,
  requestNativeHealthPermissions,
  writeNativeHealthMeasurement,
  type NativeHealthStatus,
} from "../lib/nativeHealth";

interface DataSettingsPanelProps {
  canInstall: boolean;
  installed: boolean;
  onInstall: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  hasRecords: boolean;
  latestSession: MeasurementSession | null;
}

export function DataSettingsPanel({
  canInstall,
  installed,
  onInstall,
  onExportJson,
  onExportCsv,
  hasRecords,
  latestSession,
}: DataSettingsPanelProps) {
  const platform = useMemo(() => getNativeHealthPlatform(), []);
  const [healthStatus, setHealthStatus] = useState<NativeHealthStatus | null>(null);
  const [healthMessage, setHealthMessage] = useState("");
  const [healthBusy, setHealthBusy] = useState(false);
  const canSync = Boolean(latestSession?.avgBpm && latestSession.avgConfidence >= 0.6);

  useEffect(() => {
    if (platform !== "android") return;
    getNativeHealthStatus().then(setHealthStatus).catch(() => setHealthMessage("无法读取 Health Connect 状态"));
  }, [platform]);

  async function connectHealth() {
    setHealthBusy(true);
    setHealthMessage("");
    try {
      const nextStatus = await requestNativeHealthPermissions();
      setHealthStatus(nextStatus);
      setHealthMessage(nextStatus.authorized ? "Health Connect 已授权" : "权限未完整授予");
    } catch (error) {
      setHealthMessage(error instanceof Error ? error.message : "授权失败");
    } finally {
      setHealthBusy(false);
    }
  }

  async function syncLatestMeasurement() {
    if (!latestSession?.avgBpm) return;
    setHealthBusy(true);
    setHealthMessage("");
    try {
      const written = await writeNativeHealthMeasurement({
        bpm: latestSession.avgBpm,
        timestamp: latestSession.endedAt ?? latestSession.updatedAt,
        rmssd: latestSession.hrv?.rmssd,
        respiratoryRate: latestSession.avgRespirationRate ?? undefined,
      });
      setHealthMessage(`已写入 ${written} 项系统健康指标`);
    } catch (error) {
      setHealthMessage(error instanceof Error ? error.message : "同步失败");
    } finally {
      setHealthBusy(false);
    }
  }

  return (
    <section className="data-settings-panel">
      <div className="section-heading compact-heading">
        <div><span>PRIVACY & APP</span><h2>应用与数据</h2></div>
        <div className="privacy-lock"><ShieldCheck size={16} /> 原始视频不离开设备</div>
      </div>

      <div className="settings-card-grid">
        <article>
          <Smartphone size={22} />
          <div><strong>安装 VITA.IO</strong><span>以独立 PWA 应用运行，支持主屏幕图标与离线外壳。</span></div>
          <button type="button" onClick={onInstall} disabled={!canInstall || installed}>{installed ? "已安装" : canInstall ? "安装 App" : "添加到主屏幕"}</button>
        </article>
        <article>
          <Database size={22} />
          <div><strong>本地数据库</strong><span>个人档案、测量记录与训练日志保存在当前设备。</span></div>
          <div className="settings-export-actions">
            <button type="button" onClick={onExportJson} disabled={!hasRecords}><Download size={14} /> JSON</button>
            <button type="button" onClick={onExportCsv} disabled={!hasRecords}><Download size={14} /> CSV</button>
          </div>
        </article>
        <article className="native-health-card">
          <Apple size={22} />
          <div>
            <strong>Apple Health / Health Connect</strong>
            <span>
              {platform === "android"
                ? healthStatus?.authorized
                  ? "已授权最小写入权限，可同步最近一次合格测量。"
                  : healthStatus?.available === false
                    ? "当前设备未提供可用的 Health Connect。"
                    : "授权后可写入心率、HRV 与呼吸率，不写入视频。"
                : platform === "ios"
                  ? "HealthKit capability 已配置，需完成 Apple 签名和真机权限验证。"
                  : "网页和 PWA 无权直接写入系统健康库，请使用原生 App。"}
              {healthMessage ? ` ${healthMessage}` : ""}
            </span>
          </div>
          {platform === "android" ? (
            <div className="settings-export-actions">
              <button type="button" onClick={connectHealth} disabled={healthBusy || healthStatus?.available === false}>
                <ShieldCheck size={14} /> {healthStatus?.authorized ? "重新授权" : "连接"}
              </button>
              <button type="button" onClick={syncLatestMeasurement} disabled={healthBusy || !healthStatus?.authorized || !canSync}>
                <HeartPulse size={14} /> 同步最近测量
              </button>
            </div>
          ) : (
            <span className="native-badge">{platform === "ios" ? "待签名" : "需原生 App"}</span>
          )}
        </article>
        <article>
          <ShieldCheck size={22} />
          <div><strong>隐私政策</strong><span>查看摄像头、本地指标和系统健康库的数据处理说明。</span></div>
          <button type="button" onClick={() => window.open(new URL("privacy.html", document.baseURI), "_blank", "noopener,noreferrer")}>
            <ExternalLink size={14} /> 查看政策
          </button>
        </article>
      </div>
    </section>
  );
}
