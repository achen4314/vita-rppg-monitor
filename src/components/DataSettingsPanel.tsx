import { Apple, Database, Download, ShieldCheck, Smartphone } from "lucide-react";

interface DataSettingsPanelProps {
  canInstall: boolean;
  installed: boolean;
  onInstall: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  hasRecords: boolean;
}

export function DataSettingsPanel({
  canInstall,
  installed,
  onInstall,
  onExportJson,
  onExportCsv,
  hasRecords,
}: DataSettingsPanelProps) {
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
          <div><strong>Apple Health / Health Connect</strong><span>网页和 PWA 无权直接写入系统健康库；当前可以 CSV/JSON 导出，原生版再接入系统授权。</span></div>
          <span className="native-badge">需原生 App</span>
        </article>
      </div>
    </section>
  );
}
