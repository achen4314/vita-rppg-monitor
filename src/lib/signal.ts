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
