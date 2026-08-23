/**
 * Layer B - custom particle system (Canvas 2D).
 * Renders bespoke elements (circles/lines/fragments/dots) on top of the
 * Butterchurn texture, entirely driven by the mood-mapping parameters
 * defined in docs/mood-visual-mapping.md.
 */

const PALETTES = {
  warm: ['#ffb703', '#fb8500', '#ff006e', '#ffd166'],
  cold_neon: ['#00f5ff', '#7b2ff7', '#00ffa3', '#3a86ff'],
  melancholy: ['#5c6b8a', '#2b2d42', '#8d99ae', '#4361ee'],
  mono: ['#e0e0e0', '#9e9e9e', '#616161', '#ffffff'],
};

export class ParticleSystem {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.params = defaultParams();
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * Recomputes layer parameters from mood features. Called once per
   * analysis (parameters are then held constant across the render loop;
   * a live/per-scene variant could call this per timeline segment too).
   * @param {object} features - see docs/mood-visual-mapping.md feature table
   */
  applyMood(features) {
    const {
      energy = 0,
      tempo = 120,
      mood_aggressive = 0,
      mood_sad = 0,
      mood_happy = 0,
      spectral_centroid = 0.5,
      complexity = 0,
      danceability = 0,
      lyrics_valence = null,
    } = features;

    const particleDensity = Math.round(lerp(50, 800, energy));
    const tempoNorm = clamp01((tempo - 60) / 140);
    const particleSpeed = lerp(0.2, 4.0, clamp01(0.5 * tempoNorm + 0.5 * mood_aggressive));
    const frictionSlope = clamp01(spectral_centroid); // bright/experimental -> slippery ground
    const explosionThreshold = clamp01(0.5 * mood_aggressive + 0.5 * complexity);

    // mood_sad pulls down, mood_happy pushes up - net vector along Y,
    // range roughly -1..1, positive = downward pull.
    const gravityY = mood_sad - mood_happy;

    const shapeType = pickShapeType(complexity, danceability);
    const colorPalette = pickPalette(mood_happy, mood_sad, lyrics_valence);

    this.params = {
      particleDensity,
      particleSpeed,
      gravity: { x: 0, y: gravityY * 0.06 },
      frictionSlope,
      explosionThreshold,
      shapeType,
      colorPalette,
    };

    this.syncParticleCount();
  }

  syncParticleCount() {
    const target = this.params.particleDensity;
    while (this.particles.length < target) this.particles.push(this.spawnParticle());
    if (this.particles.length > target) this.particles.length = target;
  }

  spawnParticle() {
    const w = this.canvas.width || 1;
    const h = this.canvas.height || 1;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * this.params.particleSpeed,
      vy: (Math.random() - 0.5) * this.params.particleSpeed,
      size: 2 + Math.random() * 4,
      life: 1,
    };
  }

  /**
   * @param {number} dt seconds since last frame
   * @param {number} beatEnergy 0..1 instantaneous energy (drives explosions)
   */
  update(dt, beatEnergy = 0) {
    const w = this.canvas.width || 1;
    const h = this.canvas.height || 1;
    const { gravity, frictionSlope, particleSpeed, explosionThreshold } = this.params;
    const friction = 1 - frictionSlope * 0.5; // higher frictionSlope -> slipperier -> less damping

    for (const p of this.particles) {
      p.vx += gravity.x * dt * 60;
      p.vy += gravity.y * dt * 60;

      if (beatEnergy > explosionThreshold) {
        const angle = Math.atan2(p.y - h / 2, p.x - w / 2) + (Math.random() - 0.5) * 0.6;
        const force = (beatEnergy - explosionThreshold) * particleSpeed * 3;
        p.vx += Math.cos(angle) * force;
        p.vy += Math.sin(angle) * force;
      }

      p.vx *= friction;
      p.vy *= friction;
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;

      if (p.x < 0) p.x += w;
      if (p.x > w) p.x -= w;
      if (p.y < 0) p.y += h;
      if (p.y > h) p.y -= h;
    }
  }

  render() {
    const ctx = this.ctx;
    const palette = PALETTES[this.params.colorPalette] || PALETTES.mono;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const color = palette[i % palette.length];
      drawShape(ctx, this.params.shapeType, p, color);
    }
    ctx.restore();
  }
}

function drawShape(ctx, shapeType, p, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  switch (shapeType) {
    case 'line': {
      ctx.beginPath();
      ctx.lineWidth = Math.max(1, p.size * 0.4);
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 4, p.y - p.vy * 4);
      ctx.stroke();
      break;
    }
    case 'fragment': {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
      break;
    }
    case 'dot': {
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, p.size * 0.35), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'circle':
    default: {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

function pickShapeType(complexity, danceability) {
  if (complexity > 0.65) return 'fragment';
  if (danceability > 0.6) return 'circle';
  if (complexity > 0.35) return 'line';
  return 'dot';
}

function pickPalette(moodHappy, moodSad, lyricsValence) {
  if (typeof lyricsValence === 'number') {
    if (lyricsValence > 0.3) return 'warm';
    if (lyricsValence < -0.3) return 'melancholy';
  }
  if (moodHappy > moodSad && moodHappy > 0.5) return 'warm';
  if (moodSad > 0.5) return 'melancholy';
  return 'mono';
}

function defaultParams() {
  return {
    particleDensity: 200,
    particleSpeed: 1,
    gravity: { x: 0, y: 0 },
    frictionSlope: 0.5,
    explosionThreshold: 0.6,
    shapeType: 'dot',
    colorPalette: 'mono',
  };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function lerp(a, b, t) {
  return a + (b - a) * clamp01(t);
}

export { PALETTES };
