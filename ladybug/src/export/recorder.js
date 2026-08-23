/**
 * Export pipeline: captures the composited output canvas as a video stream,
 * merges in the track's audio, and records it via MediaRecorder.
 */

const PREFERRED_MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4', // Safari
];

export function pickSupportedMimeType() {
  for (const type of PREFERRED_MIME_TYPES) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export class ClipRecorder {
  /**
   * @param {HTMLCanvasElement} outputCanvas - composited canvas (already
   *   drawing Butterchurn + particles + figure layers each frame)
   * @param {AudioNode} audioSourceNode
   * @param {AudioContext} audioCtx
   * @param {{fps?: number, maxDurationSeconds?: number}} [options]
   */
  constructor(outputCanvas, audioSourceNode, audioCtx, options = {}) {
    this.canvas = outputCanvas;
    this.audioCtx = audioCtx;
    this.fps = options.fps ?? 30;
    this.maxDurationSeconds = options.maxDurationSeconds ?? 90;

    const canvasStream = outputCanvas.captureStream(this.fps);
    const audioDestination = audioCtx.createMediaStreamDestination();
    audioSourceNode.connect(audioDestination);

    this.stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
    this.mimeType = pickSupportedMimeType();
    this.chunks = [];
    this.recorder = null;
  }

  /** @returns {Promise<Blob>} resolves with the recorded clip when stopped or maxDuration is hit. */
  start() {
    return new Promise((resolve, reject) => {
      try {
        this.recorder = new MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
      } catch (err) {
        reject(err);
        return;
      }

      this.chunks = [];
      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };
      this.recorder.onstop = () => {
        resolve(new Blob(this.chunks, { type: this.mimeType || 'video/webm' }));
      };
      this.recorder.onerror = (e) => reject(e.error || e);

      this.recorder.start();
      this.stopTimer = setTimeout(() => this.stop(), this.maxDurationSeconds * 1000);
    });
  }

  stop() {
    clearTimeout(this.stopTimer);
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
