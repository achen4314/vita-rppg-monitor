export interface SpectrumBin {
  frequency: number;
  bpm: number;
  magnitude: number;
  power: number;
  rawIndex: number;
}

export interface PeakEstimate extends SpectrumBin {
  interpolation: number;
  binFrequency: number;
}

export interface SpectrumAnalysis {
  bins: SpectrumBin[];
  peak: PeakEstimate | null;
  fftSize: number;
  frequencyResolution: number;
}

export interface SpectrumOptions {
  minHz?: number;
  maxHz?: number;
  fftSize?: number;
}

const DEFAULT_MIN_HZ = 0.75;
const DEFAULT_MAX_HZ = 4;

export function nextPowerOfTwo(value: number): number {
  if (value <= 1) return 1;
  return 1 << Math.ceil(Math.log2(value));
}

export function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

export function hannWindow(length: number): Float64Array {
  const window = new Float64Array(length);
  if (length === 1) {
    window[0] = 1;
    return window;
  }

  for (let i = 0; i < length; i += 1) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
  }
  return window;
}

export function fftRadix2(real: Float64Array, imag?: Float64Array): {
  real: Float64Array;
  imag: Float64Array;
} {
  const n = real.length;
  if (!isPowerOfTwo(n)) {
    throw new Error(`FFT size must be a power of two, received ${n}.`);
  }

  const outReal = new Float64Array(real);
  const outImag = imag ? new Float64Array(imag) : new Float64Array(n);

  let j = 0;
  for (let i = 1; i < n; i += 1) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;

    if (i < j) {
      const tempReal = outReal[i];
      outReal[i] = outReal[j];
      outReal[j] = tempReal;

      const tempImag = outImag[i];
      outImag[i] = outImag[j];
      outImag[j] = tempImag;
    }
  }

  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImag = Math.sin(angle);

    for (let start = 0; start < n; start += length) {
      let wReal = 1;
      let wImag = 0;
      const half = length >> 1;

      for (let offset = 0; offset < half; offset += 1) {
        const evenIndex = start + offset;
        const oddIndex = evenIndex + half;

        const oddReal = wReal * outReal[oddIndex] - wImag * outImag[oddIndex];
        const oddImag = wReal * outImag[oddIndex] + wImag * outReal[oddIndex];

        outReal[oddIndex] = outReal[evenIndex] - oddReal;
        outImag[oddIndex] = outImag[evenIndex] - oddImag;
        outReal[evenIndex] += oddReal;
        outImag[evenIndex] += oddImag;

        const nextWReal = wReal * stepReal - wImag * stepImag;
        wImag = wReal * stepImag + wImag * stepReal;
        wReal = nextWReal;
      }
    }
  }

  return { real: outReal, imag: outImag };
}

export function analyzeSpectrum(
  samples: readonly number[],
  sampleRate: number,
  options: SpectrumOptions = {},
): SpectrumAnalysis {
  const minHz = options.minHz ?? DEFAULT_MIN_HZ;
  const maxHz = options.maxHz ?? DEFAULT_MAX_HZ;
  const requestedSize = options.fftSize ?? nextPowerOfTwo(Math.max(64, samples.length));
  const fftSize = isPowerOfTwo(requestedSize) ? requestedSize : nextPowerOfTwo(requestedSize);

  if (samples.length < 8 || sampleRate <= 0) {
    return {
      bins: [],
      peak: null,
      fftSize,
      frequencyResolution: sampleRate > 0 ? sampleRate / fftSize : 0,
    };
  }

  const usableLength = Math.min(samples.length, fftSize);
  const window = hannWindow(usableLength);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const real = new Float64Array(fftSize);

  for (let i = 0; i < usableLength; i += 1) {
    real[i] = (samples[samples.length - usableLength + i] - mean) * window[i];
  }

  const { real: fftReal, imag: fftImag } = fftRadix2(real);
  const nyquistIndex = Math.floor(fftSize / 2);
  const magnitudes = new Float64Array(nyquistIndex + 1);
  const powers = new Float64Array(nyquistIndex + 1);
  const bins: SpectrumBin[] = [];

  for (let index = 1; index <= nyquistIndex; index += 1) {
    const frequency = (index * sampleRate) / fftSize;
    const magnitude = Math.hypot(fftReal[index], fftImag[index]);
    const power = magnitude * magnitude;
    magnitudes[index] = magnitude;
    powers[index] = power;

    if (frequency >= minHz && frequency <= maxHz) {
      bins.push({
        frequency,
        bpm: frequency * 60,
        magnitude,
        power,
        rawIndex: index,
      });
    }
  }

  let peak: PeakEstimate | null = null;
  for (const bin of bins) {
    if (!peak || bin.power > peak.power) {
      peak = {
        ...bin,
        interpolation: 0,
        binFrequency: bin.frequency,
      };
    }
  }

  if (peak && peak.rawIndex > 1 && peak.rawIndex < nyquistIndex) {
    const left = magnitudes[peak.rawIndex - 1];
    const center = magnitudes[peak.rawIndex];
    const right = magnitudes[peak.rawIndex + 1];
    const denominator = left - 2 * center + right;
    const rawDelta = denominator === 0 ? 0 : 0.5 * ((left - right) / denominator);
    const interpolation = Math.max(-0.5, Math.min(0.5, rawDelta));
    const refinedIndex = peak.rawIndex + interpolation;
    const refinedFrequency = (refinedIndex * sampleRate) / fftSize;
    const refinedMagnitude = Math.max(0, center - 0.25 * (left - right) * interpolation);

    if (refinedFrequency >= minHz && refinedFrequency <= maxHz) {
      peak = {
        ...peak,
        frequency: refinedFrequency,
        bpm: refinedFrequency * 60,
        magnitude: refinedMagnitude,
        power: refinedMagnitude * refinedMagnitude,
        interpolation,
        binFrequency: peak.binFrequency,
      };
    }
  }

  return {
    bins,
    peak,
    fftSize,
    frequencyResolution: sampleRate / fftSize,
  };
}
