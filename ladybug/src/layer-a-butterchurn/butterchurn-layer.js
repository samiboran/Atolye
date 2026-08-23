import butterchurn from 'butterchurn';
import butterchurnPresets from 'butterchurn-presets';

/**
 * Layer A - MilkDrop/Butterchurn texture background.
 *
 * Presets are bucketed once at load time into the four mood categories the
 * spec defines (calm/energetic/chaotic/dark) using simple name-based
 * heuristics, since butterchurn-presets ships no official mood metadata.
 */

const CATEGORY_KEYWORDS = {
  chaotic: ['chaos', 'fractal', 'noise', 'glitch', 'insane', 'psycho', 'acid', 'trip'],
  dark: ['dark', 'evil', 'black', 'shadow', 'night', 'horror', 'skull', 'blood'],
  energetic: ['fast', 'energy', 'party', 'dance', 'rave', 'beat', 'pulse', 'fire', 'explo'],
  calm: ['calm', 'soft', 'slow', 'dream', 'gentle', 'smooth', 'water', 'cloud', 'ambient'],
};

function categorizePresetName(name) {
  const lower = name.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return null;
}

function buildPresetBuckets(presets) {
  const buckets = { calm: [], energetic: [], chaotic: [], dark: [], uncategorized: [] };
  for (const name of Object.keys(presets)) {
    const category = categorizePresetName(name);
    (category ? buckets[category] : buckets.uncategorized).push(name);
  }
  // Any bucket left empty (small preset sets) falls back to the full pool
  // so preset selection never dead-ends.
  const allNames = Object.keys(presets);
  for (const key of Object.keys(buckets)) {
    if (key !== 'uncategorized' && buckets[key].length === 0) buckets[key] = allNames;
  }
  return buckets;
}

/**
 * Maps the mood feature set onto one of the four preset categories from
 * the spec: presetCategory driven by energy / mood_aggressive / mood_relaxed.
 */
export function pickPresetCategory({ energy, mood_aggressive, mood_relaxed }) {
  if (mood_aggressive > 0.6 && energy > 0.5) return 'chaotic';
  if (mood_aggressive > 0.5 && mood_relaxed < 0.3) return 'dark';
  if (energy > 0.55) return 'energetic';
  return 'calm';
}

export class ButterchurnLayer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {AudioContext} audioCtx
   * @param {AudioNode} audioSourceNode - node to visualize (e.g. MediaElementAudioSourceNode)
   */
  constructor(canvas, audioCtx, audioSourceNode) {
    this.canvas = canvas;
    this.audioCtx = audioCtx;
    this.presets = butterchurnPresets.getPresets();
    this.buckets = buildPresetBuckets(this.presets);
    this.visualizer = butterchurn.createVisualizer(audioCtx, canvas, {
      width: canvas.width,
      height: canvas.height,
      pixelRatio: window.devicePixelRatio || 1,
      textureRatio: 1,
    });
    this.visualizer.connectAudio(audioSourceNode);
    this.currentCategory = null;
    this.lastPresetSwitch = 0;
  }

  /**
   * Applies live mood parameters. Call once per analysis (or once per
   * detected scene change) - the visualizer itself renders every frame via
   * render().
   * @param {{energy:number, tempo:number, mood_aggressive:number, mood_relaxed:number, mood_party:number}} features
   */
  applyMood(features) {
    const category = pickPresetCategory(features);
    const blendDuration = tempoToBlendDuration(features.tempo);

    if (category !== this.currentCategory) {
      this.currentCategory = category;
      this.switchToRandomPresetInCategory(category, blendDuration);
    }

    // cycleSpeed: how often we rotate to a *new* preset within the same
    // category, driven by mood_party (higher party -> faster cycling).
    const cycleIntervalMs = 30000 - features.mood_party * 24000; // 6s..30s
    const now = performance.now();
    if (now - this.lastPresetSwitch > cycleIntervalMs) {
      this.switchToRandomPresetInCategory(category, blendDuration);
    }
  }

  switchToRandomPresetInCategory(category, blendDuration) {
    const pool = this.buckets[category];
    const name = pool[Math.floor(Math.random() * pool.length)];
    this.visualizer.loadPreset(this.presets[name], blendDuration);
    this.lastPresetSwitch = performance.now();
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.visualizer.setRendererSize(width, height);
  }

  render() {
    this.visualizer.render();
  }
}

function tempoToBlendDuration(tempo) {
  // Spec: blendDuration 2-15s, higher tempo -> faster (shorter) transition.
  const t = clamp01((tempo - 60) / 140); // ~60-200bpm
  return 15 - t * 13;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
