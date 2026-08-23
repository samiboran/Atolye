/**
 * Preset library + nearest-preset scoring, per docs/mood-visual-mapping.md.
 * A preset bundles ready-made layerB parameter overrides for a recognizable
 * mood archetype; `pickPreset` scores every preset's trigger conditions
 * against the extracted features and returns the closest match (or null,
 * meaning "use the plain feature->parameter mapping in particle-system.js
 * directly" - presets are a curated shortcut, not the only path).
 */

export const PRESETS = [
  {
    name: 'kaygan_zemin',
    description: 'Aphex Twin tarzı deneysel/IDM - yokuş aşağı kayan/patlayan baloncuklar',
    triggerConditions: { mood_aggressive: (v) => v > 0.4, danceability: (v) => v < 0.4, complexity: (v) => v > 0.6 },
    layerB: { shapeType: 'circle', gravityDirection: 'diagonal-down', frictionSlope: 0.15, particleSpeed: 2.5, explosionThreshold: 0.5, colorPalette: 'cold_neon' },
  },
  {
    name: 'gunesli_meydan',
    description: 'Neşeli, dans edilebilir pop/house',
    triggerConditions: { mood_happy: (v) => v > 0.5, danceability: (v) => v > 0.5, mood_aggressive: (v) => v < 0.4 },
    layerB: { shapeType: 'circle', gravityDirection: 'up', frictionSlope: 0.4, particleSpeed: 2.0, explosionThreshold: 0.6, colorPalette: 'warm' },
  },
  {
    name: 'agir_melankoli',
    description: 'Yavaş, hüzünlü balad',
    triggerConditions: { mood_sad: (v) => v > 0.5, energy: (v) => v < 0.4, tempo: (v) => v < 100 },
    layerB: { shapeType: 'dot', gravityDirection: 'down', frictionSlope: 0.6, particleSpeed: 0.5, explosionThreshold: 0.9, colorPalette: 'melancholy' },
  },
  {
    name: 'ofke_nobeti',
    description: 'Agresif metal/hardcore patlaması',
    triggerConditions: { mood_aggressive: (v) => v > 0.65, energy: (v) => v > 0.6 },
    layerB: { shapeType: 'fragment', gravityDirection: 'diagonal-down', frictionSlope: 0.2, particleSpeed: 3.5, explosionThreshold: 0.3, colorPalette: 'cold_neon' },
  },
  {
    name: 'parti_zirvesi',
    description: 'Yüksek tempolu dans/party enerjisi',
    triggerConditions: { mood_party: (v) => v > 0.6, danceability: (v) => v > 0.5 },
    layerB: { shapeType: 'circle', gravityDirection: 'up', frictionSlope: 0.35, particleSpeed: 3.0, explosionThreshold: 0.45, colorPalette: 'warm' },
  },
  {
    name: 'sakin_sular',
    description: 'Ambient/relax, düşük enerji, akışkan hareket',
    triggerConditions: { mood_relaxed: (v) => v > 0.6, energy: (v) => v < 0.35 },
    layerB: { shapeType: 'dot', gravityDirection: 'up', frictionSlope: 0.75, particleSpeed: 0.3, explosionThreshold: 0.95, colorPalette: 'mono' },
  },
];

/**
 * @param {object} features - full mood/audio feature set
 * @returns {{preset: object, score: number}|null} best match if it clears
 *   the minimum score threshold, else null.
 */
export function pickPreset(features) {
  let best = null;
  let bestScore = -Infinity;

  for (const preset of PRESETS) {
    const score = scorePreset(preset, features);
    if (score > bestScore) {
      bestScore = score;
      best = preset;
    }
  }

  if (!best || bestScore <= 0) return null;
  return { preset: best, score: bestScore };
}

function scorePreset(preset, features) {
  const entries = Object.entries(preset.triggerConditions);
  let matched = 0;
  for (const [feature, test] of entries) {
    const value = features[feature];
    if (typeof value === 'number' && test(value)) matched++;
  }
  return matched / entries.length; // 0..1, fraction of conditions satisfied
}
