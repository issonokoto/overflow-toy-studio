// Cross-platform Canvas + Web Audio MediaRecorder (Desktop Chrome/Edge, Android, and iOS Safari).
// Avoids iOS Safari MediaRecorder hang bugs (no timeslice on iOS, clean track release, 2.5s stop failsafe),
// and supports both direct desktop download and mobile share/save preview modal!

export function detectIOS() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function detectMobile() {
  if (typeof navigator === 'undefined') return false;
  return detectIOS() || /Android|webOS|Mobile/i.test(navigator.userAgent);
}

export class VideoRecorder {
  constructor(canvas, audioEngine, { onStateChange = () => {}, onComplete = null } = {}) {
    this.canvas = canvas;
    this.audioEngine = audioEngine;
    this.onStateChange = onStateChange;
    this.onComplete = onComplete;

    this.mediaRecorder = null;
    this.canvasStream = null;
    this.chunks = [];
    this.isRecording = false;
    this.isStopping = false;
    this.autoRecMode = false;
    this.mimeType = '';
    this.extension = 'mp4';
    this.startTime = 0;
    this.label = 'overflow';
    this._stopFailsafeTimer = null;
    this._finalized = false;
  }

  static pickBestMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;

    // iOS Safari is sensitive to codec strings; prefer plain 'video/mp4'
    if (detectIOS()) {
      if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/mp4')) {
        return { mime: 'video/mp4', ext: 'mp4' };
      }
      return { mime: '', ext: 'mp4' };
    }

    const candidates = [
      { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
      { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
      { mime: 'video/mp4', ext: 'mp4' },
      { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
      { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
      { mime: 'video/webm', ext: 'webm' },
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(c.mime)) {
        return c;
      }
    }
    return { mime: '', ext: 'webm' };
  }

  start({ auto = false, label = 'overflow', liteMode = false } = {}) {
    if (this.isRecording || this.isStopping) return false;
    const picked = VideoRecorder.pickBestMimeType();
    if (!picked) {
      alert('このブラウザはMediaRecorder録画に対応していません。');
      return false;
    }

    const isIOS = detectIOS();
    const isMobile = detectMobile();
    const fps = liteMode || isMobile ? 30 : 60;

    this.mimeType = picked.mime;
    this.extension = picked.ext;
    this.autoRecMode = auto;
    this.label = label;
    this.chunks = [];
    this._finalized = false;
    this.isStopping = false;

    try {
      this.canvasStream = this.canvas.captureStream(fps);
    } catch {
      alert('画面キャプチャの開始に失敗しました。');
      return false;
    }

    const tracks = [...this.canvasStream.getVideoTracks()];

    // Attach isolated Web Audio tap. Note: on iOS Safari, mixing a silent/live WebAudio track
    // into a canvas MediaRecorder can occasionally cause hang on stop on older iOS versions,
    // so we isolate the tap and gracefully fall back to video-only if needed.
    const audioStream = this.audioEngine.createRecordingAudioTap();
    if (audioStream) {
      for (const t of audioStream.getAudioTracks()) {
        tracks.push(t);
      }
    }

    let combinedStream = new MediaStream(tracks);
    const options = {};
    if (this.mimeType) options.mimeType = this.mimeType;
    if (!isIOS) {
      options.videoBitsPerSecond = liteMode || isMobile ? 5_500_000 : 14_000_000;
      options.audioBitsPerSecond = 128_000;
    } else {
      options.videoBitsPerSecond = 5_000_000;
    }

    const createRecorder = (stream, opts) => {
      try {
        return new MediaRecorder(stream, opts);
      } catch {
        return new MediaRecorder(stream);
      }
    };

    try {
      this.mediaRecorder = createRecorder(combinedStream, options);
    } catch {
      // Fallback: video-only stream
      this.audioEngine.releaseRecordingAudioTap();
      combinedStream = new MediaStream(this.canvasStream.getVideoTracks());
      this.mediaRecorder = createRecorder(combinedStream, {});
    }

    this.mediaRecorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        this.chunks.push(ev.data);
      }
    };

    this.mediaRecorder.onerror = () => {
      this._finalizeRecording(true);
    };

    this.mediaRecorder.onstop = () => {
      this._finalizeRecording(false);
    };

    try {
      // Crucial for iOS Safari: do NOT pass a timeslice argument (causes stop() hangs on iOS!)
      if (isIOS) {
        this.mediaRecorder.start();
      } else {
        this.mediaRecorder.start(250);
      }
    } catch {
      this._cleanupStreams();
      this.mediaRecorder = null;
      return false;
    }

    this.isRecording = true;
    this.startTime = performance.now();
    this.onStateChange({
      isRecording: true,
      isStopping: false,
      autoRecMode: this.autoRecMode,
      extension: this.extension,
    });
    return true;
  }

  stop() {
    if (!this.isRecording || this.isStopping) return;
    this.isStopping = true;
    this.onStateChange({
      isRecording: true,
      isStopping: true,
      autoRecMode: this.autoRecMode,
      extension: this.extension,
    });

    // 2.5s failsafe: guarantees recording NEVER stays stuck on iOS/mobile!
    clearTimeout(this._stopFailsafeTimer);
    this._stopFailsafeTimer = setTimeout(() => {
      if (!this._finalized) {
        this._finalizeRecording(false);
      }
    }, 2500);

    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try {
          if (typeof this.mediaRecorder.requestData === 'function') {
            this.mediaRecorder.requestData();
          }
        } catch {
          // ignore
        }
        this.mediaRecorder.stop();
      } else {
        this._finalizeRecording(false);
      }
    } catch {
      this._finalizeRecording(false);
    }

    // Stop canvas capture tracks cleanly so iOS Safari flushes the final frame immediately
    if (this.canvasStream) {
      for (const t of this.canvasStream.getTracks()) {
        try {
          t.stop();
        } catch {
          // ignore
        }
      }
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

  _cleanupStreams() {
    clearTimeout(this._stopFailsafeTimer);
    this._stopFailsafeTimer = null;
    if (this.canvasStream) {
      for (const t of this.canvasStream.getTracks()) {
        try {
          t.stop();
        } catch {
          // ignore
        }
      }
      this.canvasStream = null;
    }
    this.audioEngine.releaseRecordingAudioTap();
  }

  _finalizeRecording(hadError) {
    if (this._finalized) return;
    this._finalized = true;
    this._cleanupStreams();

    const finalMime =
      (this.mediaRecorder && this.mediaRecorder.mimeType) ||
      this.mimeType ||
      (this.extension === 'mp4' ? 'video/mp4' : 'video/webm');
    const ext = finalMime.includes('mp4') ? 'mp4' : 'webm';
    const chunks = this.chunks.slice();

    this.chunks = [];
    this.mediaRecorder = null;
    this.isRecording = false;
    this.isStopping = false;
    this.autoRecMode = false;

    this.onStateChange({
      isRecording: false,
      isStopping: false,
      autoRecMode: false,
      extension: ext,
    });

    if (hadError || chunks.length === 0) return;

    const blob = new Blob(chunks, { type: finalMime });
    if (blob.size === 0) return;

    const filename = this._makeFilename(ext);
    if (this.onComplete) {
      this.onComplete({ blob, filename, mimeType: finalMime });
    } else {
      VideoRecorder.triggerDownload(blob, filename);
    }
  }

  _makeFilename(ext) {
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
    return `${this.label}_${stamp}.${ext}`;
  }

  static triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
}
