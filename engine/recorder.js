// Synchronized 1080x1920 60fps Canvas + Web Audio MediaRecorder.
// Prefers native MP4 (H.264/AAC) for direct X upload, with clean WebM fallback.

export class VideoRecorder {
  constructor(canvas, audioEngine, onStateChange = () => {}) {
    this.canvas = canvas;
    this.audioEngine = audioEngine;
    this.onStateChange = onStateChange;

    this.mediaRecorder = null;
    this.chunks = [];
    this.isRecording = false;
    this.autoRecMode = false;
    this.mimeType = '';
    this.extension = 'webm';
    this.startTime = 0;
  }

  static pickBestMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;
    const candidates = [
      { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
      { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
      { mime: 'video/mp4', ext: 'mp4' },
      { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
      { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
      { mime: 'video/webm', ext: 'webm' },
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c.mime)) {
        return c;
      }
    }
    return { mime: '', ext: 'webm' };
  }

  start({ auto = false, label = 'overflow' } = {}) {
    if (this.isRecording) return false;
    const picked = VideoRecorder.pickBestMimeType();
    if (!picked) {
      alert('このブラウザはMediaRecorder録画に対応していません。ChromeまたはEdgeをお使いください。');
      return false;
    }

    this.mimeType = picked.mime;
    this.extension = picked.ext;
    this.autoRecMode = auto;
    this.label = label;
    this.chunks = [];

    const canvasStream = this.canvas.captureStream(60);
    const tracks = [...canvasStream.getVideoTracks()];

    const audioStream = this.audioEngine.getAudioStream();
    if (audioStream) {
      for (const t of audioStream.getAudioTracks()) {
        tracks.push(t);
      }
    }

    const combinedStream = new MediaStream(tracks);
    const options = {
      videoBitsPerSecond: 14_000_000,
      audioBitsPerSecond: 192_000,
    };
    if (this.mimeType) options.mimeType = this.mimeType;

    try {
      this.mediaRecorder = new MediaRecorder(combinedStream, options);
    } catch {
      this.mediaRecorder = new MediaRecorder(combinedStream);
    }

    this.mediaRecorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        this.chunks.push(ev.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, {
        type: this.mimeType || 'video/webm',
      });
      this._downloadBlob(blob);
      this.isRecording = false;
      this.autoRecMode = false;
      this.onStateChange({
        isRecording: false,
        autoRecMode: false,
        extension: this.extension,
      });
    };

    this.mediaRecorder.start(200);
    this.isRecording = true;
    this.startTime = performance.now();
    this.onStateChange({
      isRecording: true,
      autoRecMode: this.autoRecMode,
      extension: this.extension,
    });
    return true;
  }

  stop() {
    if (!this.isRecording || !this.mediaRecorder) return;
    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  toggle(opts = {}) {
    if (this.isRecording) {
      this.stop();
      return false;
    }
    return this.start(opts);
  }

  getElapsedSeconds() {
    if (!this.isRecording) return 0;
    return (performance.now() - this.startTime) / 1000;
  }

  _downloadBlob(blob) {
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      '_',
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('');

    const filename = `${this.label}_${stamp}.${this.extension}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
