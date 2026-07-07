import { analyzeSpectrum, nextPowerOfTwo, type SpectrumAnalysis } from "./fft";
import {
  butterworthBandpass,
  detrend,
  mean,
  resampleRgbSamples,
  standardDeviation,
  zScore,
  type RgbSample,
} from "./signal";

export interface SnrEstimate {
  snrDb: number;
  peakEnergyRatio: number;
  confidence: number;
}

export interface RppgAnalysis {
  signal: number[];
  spectrum: SpectrumAnalysis;
  respirationSignal: number[];
  respirationSpectrum: SpectrumAnalysis;
  sampleRate: number;
  bpm: number | null;
  respirationRate: number | null;
  respirationConfidence: number;
  hrv: HRVMetrics | null;
  snr: SnrEstimate;
}

export interface HRVMetrics {
  rmssd: number;
  sdnn: number;
  pnn50: number;
  stressIndex: number;
  beatCount: number;
}

export function extractPosSignal(samples: readonly RgbSample[]): number[] {
  if (samples.length < 3) return [];

  const meanR = Math.max(1e-6, mean(samples.map((sample) => sample.r)));
  const meanG = Math.max(1e-6, mean(samples.map((sample) => sample.g)));
  const meanB = Math.max(1e-6, mean(samples.map((sample) => sample.b)));
  const s1: number[] = [];
  const s2: number[] = [];

  for (const sample of samples) {
    const r = sample.r / meanR - 1;
    const g = sample.g / meanG - 1;
    const b = sample.b / meanB - 1;

    s1.push(g - b);
    s2.push(-2 * r + g + b);
  }

  const s1Std = standardDeviation(s1);
  const s2Std = standardDeviation(s2);
  const alpha = s2Std < 1e-12 ? 0 : s1Std / s2Std;
  const projected = s1.map((value, index) => value + alpha * s2[index]);

  return zScore(detrend(projected));
}

export function estimateHeartBandSnr(
  spectrum: SpectrumAnalysis,
  peakFrequency: number | null,
  peakHalfWidthHz = 0.12,
): SnrEstimate {
  if (!peakFrequency || spectrum.bins.length === 0) {
    return {
      snrDb: 0,
      peakEnergyRatio: 0,
      confidence: 0,
    };
  }

  let peakEnergy = 0;
  let noiseEnergy = 0;
  let peakBins = 0;
  let noiseBins = 0;

  for (const bin of spectrum.bins) {
    if (Math.abs(bin.frequency - peakFrequency) <= peakHalfWidthHz) {
      peakEnergy += bin.power;
      peakBins += 1;
    } else {
      noiseEnergy += bin.power;
      noiseBins += 1;
    }
  }

  const safePeakBins = Math.max(1, peakBins);
  const safeNoiseBins = Math.max(1, noiseBins);
  const peakAverage = peakEnergy / safePeakBins;
  const noiseAverage = noiseEnergy / safeNoiseBins;
  const snrLinear = noiseAverage <= 1e-12 ? 100 : peakAverage / Math.max(noiseAverage, 1e-12);
  const snrDb = 10 * Math.log10(Math.max(1e-12, snrLinear));
  const peakEnergyRatio = peakEnergy / Math.max(1e-12, peakEnergy + noiseEnergy);

  const snrScore = Math.max(0, Math.min(1, (snrDb + 3) / 15));
  const peakScore = Math.max(0, Math.min(1, (peakEnergyRatio - 0.12) / 0.38));

  return {
    snrDb,
    peakEnergyRatio,
    confidence: Math.max(0, Math.min(1, 0.5 * snrScore + 0.5 * peakScore)),
  };
}

function extractRespirationSignal(samples: readonly RgbSample[]): number[] {
  if (samples.length < 3) return [];
  const luminance = samples.map((sample) => sample.luminance);
  return zScore(detrend(luminance));
}

function detectHrv(signal: readonly number[], sampleRate: number): HRVMetrics | null {
  if (signal.length < sampleRate * 8) return null;

  const avg = mean(signal);
  const sd = standardDeviation(signal);
  const threshold = avg + sd * 0.35;
  const minDistance = Math.max(1, Math.round(sampleRate * 0.32));
  const peakIndexes: number[] = [];

  for (let index = 1; index < signal.length - 1; index += 1) {
    const value = signal[index];
    if (value <= threshold || value <= signal[index - 1] || value <= signal[index + 1]) continue;

    const previousPeak = peakIndexes[peakIndexes.length - 1];
    if (previousPeak === undefined || index - previousPeak >= minDistance) {
      peakIndexes.push(index);
    } else if (value > signal[previousPeak]) {
      peakIndexes[peakIndexes.length - 1] = index;
    }
  }

  const intervals: number[] = [];
  for (let index = 1; index < peakIndexes.length; index += 1) {
    const intervalMs = ((peakIndexes[index] - peakIndexes[index - 1]) / sampleRate) * 1000;
    if (intervalMs >= 300 && intervalMs <= 2000) {
      intervals.push(intervalMs);
    }
  }

  if (intervals.length < 4) return null;

  const intervalMean = mean(intervals);
  const sdnn = standardDeviation(intervals);
  const diffs: number[] = [];
  for (let index = 1; index < intervals.length; index += 1) {
    diffs.push(intervals[index] - intervals[index - 1]);
  }

  const rmssd = Math.sqrt(mean(diffs.map((diff) => diff * diff)));
  const pnn50 = diffs.filter((diff) => Math.abs(diff) > 50).length / Math.max(1, diffs.length);
  const normalizedRmssd = Math.max(0, Math.min(1, (rmssd - 12) / 58));
  const intervalStabilityPenalty = Math.max(0, Math.min(20, Math.abs(intervalMean - mean(intervals.slice(-4))) / 8));
  const stressIndex = Math.max(0, Math.min(100, 100 - normalizedRmssd * 82 + intervalStabilityPenalty));

  return {
    rmssd: Number(rmssd.toFixed(1)),
    sdnn: Number(sdnn.toFixed(1)),
    pnn50: Number((pnn50 * 100).toFixed(1)),
    stressIndex: Number(stressIndex.toFixed(0)),
    beatCount: peakIndexes.length,
  };
}

export function analyzeRppgWindow(samples: readonly RgbSample[]): RppgAnalysis {
  const resampled = resampleRgbSamples(samples);
  const sampleRate = resampled.sampleRate;
  const posSignal = extractPosSignal(resampled.samples);
  const filteredSignal = butterworthBandpass(posSignal, sampleRate, 0.75, 4);
  const fftSize = nextPowerOfTwo(Math.max(1024, Math.min(2048, filteredSignal.length * 4)));
  const spectrum = analyzeSpectrum(filteredSignal, sampleRate, {
    minHz: 0.75,
    maxHz: 4,
    fftSize,
  });
  const respirationSignal = butterworthBandpass(extractRespirationSignal(resampled.samples), sampleRate, 0.1, 0.5);
  const respirationFftSize = nextPowerOfTwo(Math.max(1024, Math.min(2048, respirationSignal.length * 4)));
  const respirationSpectrum = analyzeSpectrum(respirationSignal, sampleRate, {
    minHz: 0.1,
    maxHz: 0.5,
    fftSize: respirationFftSize,
  });
  const peakFrequency = spectrum.peak?.frequency ?? null;
  const snr = estimateHeartBandSnr(spectrum, peakFrequency);
  const respirationPeakFrequency = respirationSpectrum.peak?.frequency ?? null;
  const respirationSnr = estimateHeartBandSnr(respirationSpectrum, respirationPeakFrequency, 0.035);

  return {
    signal: filteredSignal,
    spectrum,
    respirationSignal,
    respirationSpectrum,
    sampleRate,
    bpm: spectrum.peak?.bpm ?? null,
    respirationRate: respirationSpectrum.peak?.bpm ?? null,
    respirationConfidence: respirationSnr.confidence,
    hrv: detectHrv(filteredSignal, sampleRate),
    snr,
  };
}
