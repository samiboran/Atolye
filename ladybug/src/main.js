import { getStoredApiKey, setStoredApiKey, analyzeLyricsValence } from './audio-analysis/lyrics-valence.js';
import { ButterchurnLayer } from './layer-a-butterchurn/butterchurn-layer.js';
import { ParticleSystem } from './layer-b-particles/particle-system.js';
import { FigureSystem } from './layer-c-figure/figure-system.js';
import { buildSceneTimeline, sceneAtTime } from './layer-c-figure/timeline.js';
import { pickPreset } from './preset-selector.js';
import { ClipRecorder, downloadBlob } from './export/recorder.js';
import { canExport, recordExport, exportsUsedToday, MAX_EXPORTS_PER_DAY, MAX_CLIP_SECONDS } from './export/export-limit.js';

const els = {
  fileInput: document.getElementById('audio-input'),
  fileDropLabel: document.getElementById('file-drop-label'),
  statusPanel: document.getElementById('analysis-status'),
  progressFill: document.getElementById('progress-fill'),
  progressLabel: document.getElementById('progress-label'),
  stagePanel: document.getElementById('stage-panel'),
  stage: document.getElementById('stage'),
  butterchurnCanvas: document.getElementById('layer-butterchurn'),
  particlesCanvas: document.getElementById('layer-particles'),
  figureCanvas: document.getElementById('layer-figure'),
  audioEl: document.getElementById('audio-el'),
  exportBtn: document.getElementById('export-btn'),
  exportStatus: document.getElementById('export-status'),
  moodList: document.getElementById('mood-list'),
  lyricsInput: document.getElementById('lyrics-input'),
  apiKeyInput: document.getElementById('api-key-input'),
  analyzeLyricsBtn: document.getElementById('analyze-lyrics-btn'),
  lyricsStatus: document.getElementById('lyrics-status'),
};

els.apiKeyInput.value = getStoredApiKey();
els.apiKeyInput.addEventListener('change', () => setStoredApiKey(els.apiKeyInput.value.trim()));

const state = {
  audioCtx: null,
  sourceNode: null,
  analysis: null,
  timeline: null,
  layers: null,
  lastFrameTime: 0,
  animHandle: null,
};

els.fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handleFile(file);
});

window.addEventListener('resize', resizeAllLayers);
els.audioEl.addEventListener('play', () => {
  state.audioCtx?.resume();
  startAnimation();
});
els.audioEl.addEventListener('pause', stopAnimation);
els.audioEl.addEventListener('ended', stopAnimation);

async function handleFile(file) {
  els.fileDropLabel.textContent = file.name;
  els.statusPanel.hidden = false;
  setProgress(0, 'analiz motoru yükleniyor…');

  // Lazy-loaded: essentia.js bundles a multi-MB WASM binary that should
  // only be fetched once the user actually has something to analyze.
  const { AudioAnalyzer } = await import('./audio-analysis/essentia-analysis.js');
  const analyzer = new AudioAnalyzer();
  let result;
  try {
    result = await analyzer.analyzeFile(file, setProgress);
  } catch (err) {
    console.error(err);
    setProgress(0, `Analiz hatası: ${err.message}`);
    return;
  }

  state.analysis = result;
  state.timeline = buildSceneTimeline(result.energyCurve, result.frameHopSeconds);

  renderMoodList(result.features);
  setupPlaybackAndLayers(file);
  els.stagePanel.hidden = false;
}

function setProgress(fraction, label) {
  els.progressFill.style.width = `${Math.round(fraction * 100)}%`;
  els.progressLabel.textContent = label;
}

function renderMoodList(features) {
  els.moodList.innerHTML = '';
  const preset = pickPreset(features);
  const rows = [
    ['energy', features.energy],
    ['tempo', `${Math.round(features.tempo)} BPM`],
    ['danceability', features.danceability],
    ['complexity', features.complexity],
    ['spectral_centroid', features.spectral_centroid],
    ['mood_aggressive', features.mood_aggressive],
    ['mood_relaxed', features.mood_relaxed],
    ['mood_happy', features.mood_happy],
    ['mood_sad', features.mood_sad],
    ['mood_party', features.mood_party],
    ['en yakın preset', preset ? `${preset.preset.name} (${Math.round(preset.score * 100)}%)` : '—'],
  ];
  for (const [key, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = typeof value === 'number' ? value.toFixed(2) : value;
    els.moodList.append(dt, dd);
  }
}

function setupPlaybackAndLayers(file) {
  stopAnimation();

  const objectUrl = URL.createObjectURL(file);
  els.audioEl.src = objectUrl;
  els.audioEl.crossOrigin = 'anonymous';

  // A <audio> element can only ever be wired to ONE MediaElementSourceNode
  // for its whole lifetime (the Web Audio spec throws InvalidStateError on
  // a second createMediaElementSource call) - so the context/source node
  // are created once and reused across every subsequent file upload.
  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    state.sourceNode = state.audioCtx.createMediaElementSource(els.audioEl);
    state.sourceNode.connect(state.audioCtx.destination);
  }
  const sourceNode = state.sourceNode;

  const butterchurn = new ButterchurnLayer(els.butterchurnCanvas, state.audioCtx, sourceNode);
  const particles = new ParticleSystem(els.particlesCanvas);
  const figure = new FigureSystem(els.figureCanvas);

  butterchurn.applyMood(state.analysis.features);
  particles.applyMood(state.analysis.features);

  state.layers = { butterchurn, particles, figure };
  state.stageCtx = els.stage.getContext('2d');

  resizeAllLayers();
}

function resizeAllLayers() {
  const width = els.stage.width;
  const height = els.stage.height;
  if (!state.layers) return;
  state.layers.butterchurn.resize(width, height);
  state.layers.particles.resize(width, height);
  state.layers.figure.resize(width, height);
}

function startAnimation() {
  if (state.animHandle) return; // already running
  state.lastFrameTime = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - state.lastFrameTime) / 1000);
    state.lastFrameTime = now;
    tick(dt);
    state.animHandle = requestAnimationFrame(loop);
  };
  state.animHandle = requestAnimationFrame(loop);
}

function stopAnimation() {
  if (state.animHandle) cancelAnimationFrame(state.animHandle);
  state.animHandle = null;
}

function tick(dt) {
  const { butterchurn, particles, figure } = state.layers;
  const { energyCurve, frameHopSeconds, features } = state.analysis;

  const t = els.audioEl.currentTime;
  const frameIndex = Math.min(energyCurve.length - 1, Math.max(0, Math.round(t / frameHopSeconds)));
  const instantEnergy = energyCurve[frameIndex] ?? 0;

  const scene = sceneAtTime(state.timeline, t);
  figure.setScene(scene);

  butterchurn.applyMood(features);
  particles.update(dt, instantEnergy);
  figure.update(dt, instantEnergy);

  butterchurn.render();
  figure.render();
  particles.render();

  compositeStage();
}

function compositeStage() {
  const ctx = state.stageCtx;
  const { width, height } = els.stage;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(els.butterchurnCanvas, 0, 0, width, height);
  ctx.drawImage(els.particlesCanvas, 0, 0, width, height);
  ctx.drawImage(els.figureCanvas, 0, 0, width, height);
}

els.exportBtn.addEventListener('click', async () => {
  if (!state.sourceNode) return;

  if (!canExport()) {
    els.exportStatus.textContent = `Günlük export limitine ulaşıldı (${MAX_EXPORTS_PER_DAY}/gün). Yarın tekrar dene.`;
    return;
  }

  els.exportBtn.disabled = true;
  els.exportStatus.textContent = 'Kaydediliyor…';

  const wasPaused = els.audioEl.paused;
  els.audioEl.currentTime = 0;
  await els.audioEl.play();

  const recorder = new ClipRecorder(els.stage, state.sourceNode, state.audioCtx, {
    maxDurationSeconds: Math.min(MAX_CLIP_SECONDS, els.audioEl.duration || MAX_CLIP_SECONDS),
  });

  const clipPromise = recorder.start();

  const stopWhenEnded = () => recorder.stop();
  els.audioEl.addEventListener('ended', stopWhenEnded, { once: true });

  try {
    const blob = await clipPromise;
    recordExport();
    downloadBlob(blob, `music-visual-${Date.now()}.webm`);
    els.exportStatus.textContent = `Klip indirildi. (${exportsUsedToday()}/${MAX_EXPORTS_PER_DAY} bugün kullanıldı)`;
  } catch (err) {
    console.error(err);
    els.exportStatus.textContent = `Export hatası: ${err.message || err}`;
  } finally {
    els.audioEl.removeEventListener('ended', stopWhenEnded);
    els.exportBtn.disabled = false;
    if (wasPaused) els.audioEl.pause();
  }
});

els.analyzeLyricsBtn.addEventListener('click', async () => {
  const lyrics = els.lyricsInput.value;
  const apiKey = els.apiKeyInput.value.trim();
  els.lyricsStatus.textContent = 'Analiz ediliyor…';
  els.analyzeLyricsBtn.disabled = true;
  try {
    const valence = await analyzeLyricsValence(lyrics, apiKey);
    if (state.analysis) {
      state.analysis.features.lyrics_valence = valence;
      renderMoodList(state.analysis.features);
      state.layers?.particles.applyMood(state.analysis.features);
    }
    els.lyricsStatus.textContent = `lyrics_valence = ${valence.toFixed(2)}`;
  } catch (err) {
    els.lyricsStatus.textContent = err.message;
  } finally {
    els.analyzeLyricsBtn.disabled = false;
  }
});
