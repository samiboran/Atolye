import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';
import Essentia from 'essentia.js/dist/essentia.js-core.es.js';

/**
 * Decodes an audio file and runs it through Essentia.js to extract the
 * low-level features Essentia computes directly (energy, tempo, spectral
 * centroid, danceability, dynamic complexity).
 *
 * The five `mood_*` scores are NOT produced by a bundled Essentia model
 * here — the real MusiCNN mood classifiers ship as separate multi-MB
 * TensorFlow.js weight files per mood (https://essentia.upf.edu/models.html)
 * and are out of scope for a "cost near zero" browser app to download by
 * default. Instead they are derived heuristically from the low-level
 * features below (see deriveMoodScores). Swapping in the real classifiers
 * later only requires replacing deriveMoodScores with actual inference.
 */
export class AudioAnalyzer {
  constructor() {
    this.essentia = null;
  }

  async init() {
    if (this.essentia) return;
    this.essentia = new Essentia(EssentiaWASM);
  }

  /**
   * @param {File|Blob} file
   * @param {(progress: number, label: string) => void} [onProgress]
   * @returns {Promise<{features: object, decoded: {duration:number, sampleRate:number}, energyCurve: Float32Array, frameHopSeconds: number}>}
   */
  async analyzeFile(file, onProgress = () => {}) {
    await this.init();
    onProgress(0.05, 'dosya çözümleniyor');

    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    // Essentia's models/algorithms expect mono @ 44.1kHz (or whatever the
    // WASM build was compiled for) - downmix to mono here.
    const mono = downmixToMono(audioBuffer);
    await audioCtx.close();

    const vector = this.essentia.arrayToVector(mono);
    const sampleRate = audioBuffer.sampleRate;

    // Every step below yields back to the browser between calls (via
    // `yieldToUI()`) so the progress bar actually repaints and the tab
    // doesn't look frozen on a long track - without it, a full song's
    // worth of analysis runs as one uninterrupted synchronous block and
    // the UI appears stuck (no player ever shows up) until it's all done.

    onProgress(0.15, 'tempo tespit ediliyor');
    await yieldToUI();
    // --- Rhythm / tempo ---
    const rhythm = this.essentia.RhythmExtractor2013(vector, 208, 'multifeature', 40);
    const tempo = rhythm.bpm;

    onProgress(0.3, 'enerji zaman çizelgesi hesaplanıyor');
    await yieldToUI();
    // RMS-per-frame envelope, reused both as the scalar "energy" feature
    // (mean RMS) and, max-normalized, as the timeline's energy curve.
    // (Essentia's own `Loudness` algorithm sums over the *entire* signal
    // rather than per-frame, so its raw output scales with track length -
    // unsuitable as a bounded 0..1 "energy" feature. Frame RMS avoids that.)
    const { rawRmsCurve, energyCurve, frameHopSeconds } = this.computeEnergyCurve(mono, sampleRate);
    const meanRms = rawRmsCurve.reduce((a, b) => a + b, 0) / Math.max(1, rawRmsCurve.length);
    // Typical mastered music sits around 0.1-0.3 RMS; scale so that range
    // maps to roughly 0.3-1.0 energy, with quieter material trailing below.
    const energy = clamp01(meanRms / 0.3);

    onProgress(0.45, 'dinamik karmaşıklık hesaplanıyor');
    await yieldToUI();
    // --- Dynamic complexity ---
    const dynComplexity = this.essentia.DynamicComplexity(vector, undefined, sampleRate);
    const complexity = clamp01(dynComplexity.dynamicComplexity / 4);

    // --- Spectral centroid (time-averaged across a bounded, evenly spaced
    // sample of frames - see computeMeanSpectralCentroid for why not every
    // frame in the track is visited) ---
    const spectralCentroid = await this.computeMeanSpectralCentroid(mono, sampleRate, (p) =>
      onProgress(0.55 + p * 0.3, 'tını rengi analiz ediliyor')
    );

    onProgress(0.9, 'dans edilebilirlik hesaplanıyor');
    await yieldToUI();
    // --- Danceability ---
    const dance = this.essentia.Danceability(vector, undefined, undefined, sampleRate);
    // Essentia's danceability is unbounded (DFA based), squash to 0..1.
    const danceability = clamp01(dance.danceability / 3);

    vector.delete();

    const moods = deriveMoodScores({ energy, complexity, danceability, spectralCentroid, tempo });

    onProgress(1, 'tamamlandı');

    return {
      features: {
        energy,
        tempo,
        spectral_centroid: spectralCentroid,
        complexity,
        danceability,
        ...moods,
      },
      decoded: { duration: audioBuffer.duration, sampleRate },
      energyCurve,
      frameHopSeconds,
    };
  }

  /**
   * Averages spectral centroid over a bounded, evenly-spaced sample of
   * frames across the whole track (at most MAX_FRAMES), rather than every
   * hop of the track - a dense frame-by-frame pass over a multi-minute
   * song makes thousands of individual WASM calls and blocks the main
   * thread for many seconds to over a minute with no way to yield mid-call.
   * A few hundred evenly spread samples give an equally representative
   * average for a single track-level scalar feature, in a fraction of the
   * time, and the loop yields periodically so the tab stays responsive.
   */
  async computeMeanSpectralCentroid(mono, sampleRate, onProgress = () => {}) {
    const frameSize = 2048;
    const MAX_FRAMES = 300;
    const YIELD_EVERY = 25;

    const maxStart = mono.length - frameSize;
    if (maxStart <= 0) return 0;
    const frameCount = Math.min(MAX_FRAMES, Math.max(1, Math.floor(maxStart / frameSize) + 1));
    const step = frameCount > 1 ? maxStart / (frameCount - 1) : 0;

    let sum = 0;
    for (let f = 0; f < frameCount; f++) {
      const start = Math.round(f * step);
      const frame = mono.subarray(start, start + frameSize);
      const frameVec = this.essentia.arrayToVector(applyHann(frame));
      const spectrum = this.essentia.Spectrum(frameVec);
      const centroid = this.essentia.Centroid(spectrum.spectrum, sampleRate / 2);
      sum += centroid.centroid;
      frameVec.delete();
      spectrum.spectrum.delete();

      if (f % YIELD_EVERY === 0) {
        onProgress(f / frameCount);
        await yieldToUI();
      }
    }
    // Centroid comes back normalized 0..1 (fraction of Nyquist) from Essentia's
    // Centroid algorithm given range=sampleRate/2; keep as 0..1.
    return clamp01(sum / frameCount);
  }

  /**
   * Coarse energy envelope used for onset/segment detection in the timeline
   * builder - RMS per ~0.25s frame, normalized to 0..1 against the track max.
   */
  computeEnergyCurve(mono, sampleRate) {
    const hop = Math.round(sampleRate * 0.25);
    const frames = Math.ceil(mono.length / hop);
    const rawRmsCurve = new Float32Array(frames);
    let max = 1e-6;
    for (let f = 0; f < frames; f++) {
      const start = f * hop;
      const end = Math.min(start + hop, mono.length);
      let sumSq = 0;
      for (let i = start; i < end; i++) sumSq += mono[i] * mono[i];
      const rms = Math.sqrt(sumSq / Math.max(1, end - start));
      rawRmsCurve[f] = rms;
      if (rms > max) max = rms;
    }
    const energyCurve = new Float32Array(frames);
    for (let f = 0; f < frames; f++) energyCurve[f] = rawRmsCurve[f] / max;
    return { rawRmsCurve, energyCurve, frameHopSeconds: hop / sampleRate };
  }
}

function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function downmixToMono(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const out = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) out[i] += data[i] / channels;
  }
  return out;
}

function applyHann(frame) {
  const n = frame.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = frame[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return out;
}

function clamp01(x) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Heuristic proxy for the mood_* scores that real Essentia MusiCNN models
 * would otherwise produce. Documented explicitly as an approximation (see
 * module docstring above) - tuned so the example presets in the mapping
 * doc (e.g. "kaygan_zemin": mood_aggressive > 0.4, danceability < 0.4,
 * complexity > 0.6) trigger on plausible IDM/experimental input.
 */
function deriveMoodScores({ energy, complexity, danceability, spectralCentroid, tempo }) {
  const tempoNorm = clamp01((tempo - 60) / 120); // ~60-180bpm -> 0..1

  const mood_aggressive = clamp01(0.45 * energy + 0.35 * complexity + 0.2 * spectralCentroid);
  const mood_relaxed = clamp01(1 - (0.5 * energy + 0.3 * tempoNorm + 0.2 * complexity));
  const mood_party = clamp01(0.5 * danceability + 0.3 * tempoNorm + 0.2 * energy);
  const mood_happy = clamp01(0.4 * danceability + 0.3 * (1 - complexity) + 0.3 * spectralCentroid);
  const mood_sad = clamp01(1 - (0.5 * mood_happy + 0.5 * energy));

  return { mood_aggressive, mood_relaxed, mood_happy, mood_sad, mood_party };
}
