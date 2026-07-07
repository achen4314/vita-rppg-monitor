import type { SpectrumBin } from "../lib/fft";
import type { HistoryPoint } from "../hooks/useRppgPipeline";

interface WaveChartProps {
  values: readonly number[];
  compact?: boolean;
}

interface SpectrumChartProps {
  bins: readonly SpectrumBin[];
  peakBpm: number | null;
  tone: "skin" | "background";
}

interface TrendChartProps {
  history: readonly HistoryPoint[];
  compact?: boolean;
}

function linePoints(values: readonly number[], width: number, height: number, padding = 12): string {
  if (values.length === 0) return "";
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return values
    .map((value, index) => {
      const x = padding + (index / Math.max(1, values.length - 1)) * usableWidth;
      const y = padding + (1 - (value + 1) / 2) * usableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function spectrumPoints(bins: readonly SpectrumBin[], width: number, height: number): string {
  if (bins.length === 0) return "";
  const minHz = 0.75;
  const maxHz = 4;
  const padding = 14;
  const maxMagnitude = bins.reduce((max, bin) => Math.max(max, bin.magnitude), 1e-6);
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return bins
    .map((bin) => {
      const x = padding + ((bin.frequency - minHz) / (maxHz - minHz)) * usableWidth;
      const normalized = Math.sqrt(bin.magnitude / maxMagnitude);
      const y = height - padding - normalized * usableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function trendPoints(history: readonly HistoryPoint[], width: number, height: number): string {
  if (history.length === 0) return "";
  const padding = 14;
  const bpms = history.map((point) => point.bpm);
  const minBpm = Math.min(...bpms) - 4;
  const maxBpm = Math.max(...bpms) + 4;
  const span = Math.max(8, maxBpm - minBpm);
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return history
    .map((point, index) => {
      const x = padding + (index / Math.max(1, history.length - 1)) * usableWidth;
      const y = height - padding - ((point.bpm - minBpm) / span) * usableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function WaveChart({ values, compact = false }: WaveChartProps) {
  const width = 420;
  const height = compact ? 94 : 128;
  const points = linePoints(values, width, height);

  return (
    <svg
      className={`chart chart-wave ${compact ? "chart-compact" : ""}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Pulse waveform"
    >
      <path className="chart-grid" d={compact ? "M12 24 H408 M12 47 H408 M12 70 H408" : "M12 32 H408 M12 64 H408 M12 96 H408"} />
      <path className="chart-midline" d={`M12 ${height / 2} H408`} />
      {points ? (
        <>
          <polyline className="wave-glow" points={points} />
          <polyline className="wave-line" points={points} />
        </>
      ) : (
        <text className="chart-empty" x="210" y="68" textAnchor="middle">
          SIGNAL ACQUIRING
        </text>
      )}
    </svg>
  );
}

export function SpectrumChart({ bins, peakBpm, tone }: SpectrumChartProps) {
  const width = 420;
  const height = 126;
  const points = spectrumPoints(bins, width, height);
  const peakX =
    peakBpm === null ? null : 14 + (((peakBpm / 60 - 0.75) / (4 - 0.75)) * (width - 28));

  return (
    <svg
      className={`chart chart-spectrum chart-spectrum-${tone}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={tone === "skin" ? "Skin frequency spectrum" : "Background frequency spectrum"}
    >
      <path className="chart-grid" d="M14 32 H406 M14 63 H406 M14 94 H406" />
      <text className="axis-label" x="14" y="116">
        45
      </text>
      <text className="axis-label" x="202" y="116" textAnchor="middle">
        BPM
      </text>
      <text className="axis-label" x="406" y="116" textAnchor="end">
        240
      </text>
      {points && <polyline className="spectrum-line" points={points} />}
      {peakX !== null && Number.isFinite(peakX) && (
        <>
          <line className="peak-line" x1={peakX} y1="14" x2={peakX} y2="105" />
          <text className="peak-label" x={Math.min(354, Math.max(46, peakX + 8))} y="24">
            {peakBpm?.toFixed(1)} BPM
          </text>
        </>
      )}
      {!points && (
        <text className="chart-empty" x="210" y="68" textAnchor="middle">
          WAITING FOR WINDOW
        </text>
      )}
    </svg>
  );
}

export function TrendChart({ history, compact = false }: TrendChartProps) {
  const width = 420;
  const height = compact ? 94 : 126;
  const points = trendPoints(history, width, height);

  return (
    <svg
      className={`chart chart-trend ${compact ? "chart-compact" : ""}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Heart rate trend"
    >
      <path className="chart-grid" d={compact ? "M14 24 H406 M14 47 H406 M14 70 H406" : "M14 32 H406 M14 63 H406 M14 94 H406"} />
      {points ? (
        <>
          <polyline className="trend-fill-line" points={points} />
          <polyline className="trend-line" points={points} />
        </>
      ) : (
        <text className="chart-empty" x="210" y="68" textAnchor="middle">
          HISTORY STARTS AFTER CAL
        </text>
      )}
    </svg>
  );
}
