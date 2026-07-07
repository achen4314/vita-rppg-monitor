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
  sampleRate: number;
  bpm: number | null;
  snr: SnrEstimate;
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
  const peakFrequency = spectrum.peak?.frequency ?? null;
  const snr = estimateHeartBandSnr(spectrum, peakFrequency);

  return {
    signal: filteredSignal,
    spectrum,
    sampleRate,
    bpm: spectrum.peak?.bpm ?? null,
    snr,
  };
}
