export interface RgbSample {
  t: number;
  r: number;
  g: number;
  b: number;
  luminance: number;
}

export interface FilterConfig {
  sampleRate: number;
  lowHz: number;
  highHz: number;
  q?: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

export function zScore(values: readonly number[]): number[] {
  const avg = mean(values);
  const sd = standardDeviation(values);
  if (sd < 1e-12) return values.map(() => 0);
  return values.map((value) => (value - avg) / sd);
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function detrend(values: readonly number[]): number[] {
  const n = values.length;
  if (n < 3) return [...values];

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;

  for (let i = 0; i < n; i += 1) {
    sumX += i;
    sumY += values[i];
    sumXX += i * i;
    sumXY += i * values[i];
  }

  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return values.map((value, index) => value - (slope * index + intercept));
}

type FilterKind = "lowpass" | "highpass";

class BiquadFilter {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;

  constructor(kind: FilterKind, sampleRate: number, cutoffHz: number, q = Math.SQRT1_2) {
    this.configure(kind, sampleRate, cutoffHz, q);
  }

  configure(kind: FilterKind, sampleRate: number, cutoffHz: number, q = Math.SQRT1_2): void {
    const safeCutoff = clamp(cutoffHz, 0.001, sampleRate / 2 - 0.001);
    const omega = (2 * Math.PI * safeCutoff) / sampleRate;
    const alpha = Math.sin(omega) / (2 * q);
    const cosOmega = Math.cos(omega);

    let b0: number;
    let b1: number;
    let b2: number;
    const a0 = 1 + alpha;
    const a1 = -2 * cosOmega;
    const a2 = 1 - alpha;

    if (kind === "lowpass") {
      b0 = (1 - cosOmega) / 2;
      b1 = 1 - cosOmega;
      b2 = (1 - cosOmega) / 2;
    } else {
      b0 = (1 + cosOmega) / 2;
      b1 = -(1 + cosOmega);
      b2 = (1 + cosOmega) / 2;
    }

    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  process(input: number): number {
    const output = this.b0 * input + this.z1;
    this.z1 = this.b1 * input - this.a1 * output + this.z2;
    this.z2 = this.b2 * input - this.a2 * output;
    return output;
  }

  reset(): void {
    this.z1 = 0;
    this.z2 = 0;
  }
}

export class ButterworthBandpass {
  private highpass: BiquadFilter;
  private lowpass: BiquadFilter;
  private config: FilterConfig;

  constructor(config: FilterConfig) {
    this.config = {
      ...config,
      q: config.q ?? Math.SQRT1_2,
    };
    this.highpass = new BiquadFilter("highpass", this.config.sampleRate, this.config.lowHz, this.config.q);
    this.lowpass = new BiquadFilter("lowpass", this.config.sampleRate, this.config.highHz, this.config.q);
  }

  process(value: number): number {
    return this.lowpass.process(this.highpass.process(value));
  }

  processSeries(values: readonly number[]): number[] {
    this.reset();
    return values.map((value) => this.process(value));
  }

  reset(): void {
    this.highpass.reset();
    this.lowpass.reset();
  }
}

export function butterworthBandpass(
  values: readonly number[],
  sampleRate: number,
  lowHz = 0.75,
  highHz = 4,
): number[] {
  const filtered = new ButterworthBandpass({ sampleRate, lowHz, highHz }).processSeries(detrend(values));
  return zScore(filtered);
}

export function estimateSampleRate(samples: readonly RgbSample[]): number {
  if (samples.length < 2) return 30;
  const first = samples[0].t;
  const last = samples[samples.length - 1].t;
  const durationSeconds = (last - first) / 1000;
  if (durationSeconds <= 0) return 30;
  return clamp((samples.length - 1) / durationSeconds, 12, 60);
}

function interpolateChannel(before: number, after: number, ratio: number): number {
  return before + (after - before) * ratio;
}

export function resampleRgbSamples(samples: readonly RgbSample[]): {
  samples: RgbSample[];
  sampleRate: number;
} {
  if (samples.length < 2) {
    return {
      samples: [...samples],
      sampleRate: estimateSampleRate(samples),
    };
  }

  const sourceRate = estimateSampleRate(samples);
  const targetRate = clamp(Math.min(30, Math.max(15, sourceRate)), 12, 30);
  const firstTime = samples[0].t;
  const lastTime = samples[samples.length - 1].t;
  const durationSeconds = Math.max(0, (lastTime - firstTime) / 1000);
  const outputLength = Math.max(2, Math.floor(durationSeconds * targetRate) + 1);
  const output: RgbSample[] = [];
  let sourceIndex = 0;

  for (let index = 0; index < outputLength; index += 1) {
    const targetTime = Math.min(lastTime, firstTime + (index * 1000) / targetRate);

    while (sourceIndex < samples.length - 2 && samples[sourceIndex + 1].t < targetTime) {
      sourceIndex += 1;
    }

    const before = samples[sourceIndex];
    const after = samples[Math.min(sourceIndex + 1, samples.length - 1)];
    const span = Math.max(1e-6, after.t - before.t);
    const ratio = clamp((targetTime - before.t) / span, 0, 1);

    output.push({
      t: targetTime,
      r: interpolateChannel(before.r, after.r, ratio),
      g: interpolateChannel(before.g, after.g, ratio),
      b: interpolateChannel(before.b, after.b, ratio),
      luminance: interpolateChannel(before.luminance, after.luminance, ratio),
    });
  }

  return {
    samples: output,
    sampleRate: targetRate,
  };
}

export function estimateTimingQuality(samples: readonly RgbSample[]): number {
  if (samples.length < 5) return 1;

  const intervals: number[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const interval = samples[index].t - samples[index - 1].t;
    if (interval > 0) intervals.push(interval);
  }

  if (intervals.length < 4) return 1;

  const center = median(intervals);
  if (center <= 0) return 0;

  const absoluteDeviations = intervals.map((interval) => Math.abs(interval - center));
  const mad = median(absoluteDeviations);
  const jitterRatio = mad / center;
  return clamp(1 - jitterRatio * 7, 0, 1);
}
