/**
 * Builds the Layer C scene timeline from the track's energy envelope.
 * Scenes are assigned per spec (docs/mood-visual-mapping.md §2, Katman C):
 *   intro_chaos      - low energy
 *   figure_emerging  - energy rising through the mid band
 *   figure_active    - energy in the high band
 *   dissolve         - energy falling out of the high/mid band
 *
 * "Ani değişim noktaları" (onset/segment detection) are found via the sign
 * change of the smoothed energy curve's derivative crossing a noise floor,
 * which is enough to segment verse/chorus-scale dynamics without a full
 * onset-detection algorithm.
 */

const LOW_BAND = 0.33;
const HIGH_BAND = 0.66;
const RISE_THRESHOLD = 0.015; // per-frame smoothed energy delta considered a real rise
const SMOOTHING_WINDOW = 5; // frames (~1.25s at the analyzer's 0.25s hop)

export function buildSceneTimeline(energyCurve, frameHopSeconds) {
  const smoothed = movingAverage(energyCurve, SMOOTHING_WINDOW);
  const scenes = new Array(smoothed.length);

  let wasHigh = false;
  for (let i = 0; i < smoothed.length; i++) {
    const level = smoothed[i];
    const delta = i > 0 ? smoothed[i] - smoothed[i - 1] : 0;
    const band = level < LOW_BAND ? 'low' : level < HIGH_BAND ? 'mid' : 'high';

    let scene;
    if (band === 'low') {
      scene = wasHigh ? 'dissolve' : 'intro_chaos';
      if (level < LOW_BAND * 0.4) wasHigh = false;
    } else if (band === 'high') {
      scene = 'figure_active';
      wasHigh = true;
    } else {
      // mid band: rising -> emerging, falling from a high -> dissolve, else emerging
      scene = delta < -RISE_THRESHOLD && wasHigh ? 'dissolve' : 'figure_emerging';
    }
    scenes[i] = scene;
  }

  return mergeToSegments(scenes, frameHopSeconds);
}

function movingAverage(curve, windowSize) {
  const out = new Float32Array(curve.length);
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < curve.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(curve.length - 1, i + half); j++) {
      sum += curve[j];
      count++;
    }
    out[i] = sum / count;
  }
  return out;
}

function mergeToSegments(scenes, frameHopSeconds) {
  if (scenes.length === 0) return [];
  const segments = [{ time: 0, scene: scenes[0] }];
  for (let i = 1; i < scenes.length; i++) {
    if (scenes[i] !== segments[segments.length - 1].scene) {
      segments.push({ time: i * frameHopSeconds, scene: scenes[i] });
    }
  }
  return segments;
}

/** Returns the scene active at a given playback time (seconds). */
export function sceneAtTime(segments, time) {
  let current = segments[0]?.scene ?? 'intro_chaos';
  for (const seg of segments) {
    if (seg.time > time) break;
    current = seg.scene;
  }
  return current;
}
