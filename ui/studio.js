// Studio UI Controller (PC + Mobile Responsive):
// Wires simulation, interactive touch/mouse BoardEditor, BackgroundLayer (paint + image/video),
// BoardStorage (local + JSON), keyboard shortcuts, and synchronized MP4/WebM recording.

import { AudioEngine } from '../engine/audio.js';
import { BackgroundLayer } from '../engine/background.js';
import { BoardEditor } from '../engine/editor.js';
import { NeonRenderer } from '../engine/renderer.js';
import { VideoRecorder, detectIOS, detectMobile } from '../engine/recorder.js';
import { OverflowSimulation } from '../engine/simulation.js';
import { BoardStorage } from '../engine/storage.js';
import {
  designFromPattern,
  createBlankDesign,
  compileDesignToPattern,
} from '../engine/boardDesign.js';
import { generateRandomBoard } from '../engine/generator.js';
import { PATTERNS, getPatternById } from '../patterns/index.js';

const canvas = document.getElementById('simCanvas');
const audio = new AudioEngine();
const background = new BackgroundLayer();

let currentBasePattern = PATTERNS[0];
let currentDesign = designFromPattern(currentBasePattern);
let currentSavedId = null;

// Editor (bound to canvas pointer events)
const editor = new BoardEditor({
  canvas,
  background,
  onDesignChange: (design) => {
    currentDesign = design;
    if (editor.active) {
      const compiled = compileDesignToPattern(currentDesign, currentBasePattern);
      sim.applyLayoutPreview(compiled);
    }
  },
});

const renderer = new NeonRenderer(canvas, { background, editor });

// DOM elements
const els = {
  studioPanel: document.getElementById('studioPanel'),
  floatingShowPanelBtn: document.getElementById('floatingShowPanelBtn'),
  btnCloseDrawer: document.getElementById('btnCloseDrawer'),
  mobilePlayBar: document.getElementById('mobilePlayBar'),
  mobileEditBar: document.getElementById('mobileEditBar'),
  mBtnPause: document.getElementById('mBtnPause'),
  mBtnMirror: document.getElementById('mBtnMirror'),

  startOverlay: document.getElementById('startOverlay'),
  btnCenterStart: document.getElementById('btnCenterStart'),
  centerStartIcon: document.getElementById('centerStartIcon'),
  centerStartTitle: document.getElementById('centerStartTitle'),
  centerStartSub: document.getElementById('centerStartSub'),
  btnCancelPendingRec: document.getElementById('btnCancelPendingRec'),

  floatingRecBar: document.getElementById('floatingRecBar'),
  floatingRecText: document.getElementById('floatingRecText'),
  btnFloatingStopRec: document.getElementById('btnFloatingStopRec'),

  saveModal: document.getElementById('saveModal'),
  btnCloseSaveModal: document.getElementById('btnCloseSaveModal'),
  savePreviewVideo: document.getElementById('savePreviewVideo'),
  saveFileInfo: document.getElementById('saveFileInfo'),
  btnShareVideo: document.getElementById('btnShareVideo'),
  btnDownloadVideo: document.getElementById('btnDownloadVideo'),

  recBadge: document.getElementById('recBadge'),
  recBadgeText: document.getElementById('recBadgeText'),
  codecInfo: document.getElementById('codecInfo'),

  statBalls: document.getElementById('statBalls'),
  statCatches: document.getElementById('statCatches'),
  statTime: document.getElementById('statTime'),
  statSpill: document.getElementById('statSpill'),
  statOverflowPct: document.getElementById('statOverflowPct'),
  statOverflowFill: document.getElementById('statOverflowFill'),

  btnGenerateRandom: document.getElementById('btnGenerateRandom'),
  selGenFilter: document.getElementById('selGenFilter'),
  btnAutoRec: document.getElementById('btnAutoRec'),
  btnToggleEditMain: document.getElementById('btnToggleEditMain'),
  btnToggleEditMainLabel: document.getElementById('btnToggleEditMainLabel'),
  btnEditModeToggle: document.getElementById('btnEditModeToggle'),
  btnEditModeToggleLabel: document.getElementById('btnEditModeToggleLabel'),
  btnRecord: document.getElementById('btnRecord'),
  btnRecordLabel: document.getElementById('btnRecordLabel'),
  btnRestart: document.getElementById('btnRestart'),
  btnPause: document.getElementById('btnPause'),
  btnPauseLabel: document.getElementById('btnPauseLabel'),
  btnMute: document.getElementById('btnMute'),
  btnMuteLabel: document.getElementById('btnMuteLabel'),
  btnHud: document.getElementById('btnHud'),
  btnHudLabel: document.getElementById('btnHudLabel'),
  btnLiteMode: document.getElementById('btnLiteMode'),
  btnLiteModeLabel: document.getElementById('btnLiteModeLabel'),
  btnHidePanel: document.getElementById('btnHidePanel'),

  patternList: document.getElementById('patternList'),
  savedBoardList: document.getElementById('savedBoardList'),
  savedCountBadge: document.getElementById('savedCountBadge'),

  btnResetParams: document.getElementById('btnResetParams'),
  slGravity: document.getElementById('slGravity'),
  slBounce: document.getElementById('slBounce'),
  slCatcherSpeed: document.getElementById('slCatcherSpeed'),
  slCatcherWidth: document.getElementById('slCatcherWidth'),
  slCatchBonus: document.getElementById('slCatchBonus'),
  valGravity: document.getElementById('valGravity'),
  valBounce: document.getElementById('valBounce'),
  valCatcherSpeed: document.getElementById('valCatcherSpeed'),
  valCatcherWidth: document.getElementById('valCatcherWidth'),
  valCatchBonus: document.getElementById('valCatchBonus'),

  seedInput: document.getElementById('seedInput'),
  btnReplaySeed: document.getElementById('btnReplaySeed'),

  // Editor controls
  btnSmoothWalls: document.getElementById('btnSmoothWalls'),
  btnToggleMirror: document.getElementById('btnToggleMirror'),
  btnMirrorLabel: document.getElementById('btnMirrorLabel'),
  btnBlankBoard: document.getElementById('btnBlankBoard'),
  btnUndo: document.getElementById('btnUndo'),
  btnRedo: document.getElementById('btnRedo'),
  selAutoPinStyle: document.getElementById('selAutoPinStyle'),
  chkKeepBumpers: document.getElementById('chkKeepBumpers'),
  slAutoPinSpacing: document.getElementById('slAutoPinSpacing'),
  valAutoPinSpacing: document.getElementById('valAutoPinSpacing'),
  btnAutoFillPins: document.getElementById('btnAutoFillPins'),
  btnClearPins: document.getElementById('btnClearPins'),
  btnTraceFromBg: document.getElementById('btnTraceFromBg'),
  btnTraceFromBgTab: document.getElementById('btnTraceFromBgTab'),
  traceStatusText: document.getElementById('traceStatusText'),

  boardNameInput: document.getElementById('boardNameInput'),
  btnSaveBoard: document.getElementById('btnSaveBoard'),
  btnExportJson: document.getElementById('btnExportJson'),
  btnImportJson: document.getElementById('btnImportJson'),
  inputImportJson: document.getElementById('inputImportJson'),

  // Background controls
  inpBrushColor: document.getElementById('inpBrushColor'),
  slBrushSize: document.getElementById('slBrushSize'),
  valBrushSize: document.getElementById('valBrushSize'),
  slBrushOpacity: document.getElementById('slBrushOpacity'),
  valBrushOpacity: document.getElementById('valBrushOpacity'),
  btnUndoPaint: document.getElementById('btnUndoPaint'),
  btnClearPaint: document.getElementById('btnClearPaint'),
  inpBgTop: document.getElementById('inpBgTop'),
  inpBgBottom: document.getElementById('inpBgBottom'),
  btnResetBgColors: document.getElementById('btnResetBgColors'),
  chkShowGrid: document.getElementById('chkShowGrid'),

  btnPickMedia: document.getElementById('btnPickMedia'),
  btnClearMedia: document.getElementById('btnClearMedia'),
  inputMediaFile: document.getElementById('inputMediaFile'),
  mediaStatusText: document.getElementById('mediaStatusText'),
  selMediaFit: document.getElementById('selMediaFit'),
  slMediaOpacity: document.getElementById('slMediaOpacity'),
  valMediaOpacity: document.getElementById('valMediaOpacity'),
  slMediaScale: document.getElementById('slMediaScale'),
  valMediaScale: document.getElementById('valMediaScale'),
  slMediaX: document.getElementById('slMediaX'),
  valMediaX: document.getElementById('valMediaX'),
  slMediaY: document.getElementById('slMediaY'),
  valMediaY: document.getElementById('valMediaY'),
};

const isMobileDevice = detectMobile() || window.innerWidth <= 900;
const isIOSDevice = detectIOS();
let pendingStartMode = null; // null | 'normal' | 'record' | 'auto'
let lastRecordedMedia = null;

// Save/Share modal helper for mobile & iOS (desktop downloads directly)
function openSaveModal({ blob, filename, mimeType }) {
  if (lastRecordedMedia?.url) {
    URL.revokeObjectURL(lastRecordedMedia.url);
  }
  const url = URL.createObjectURL(blob);
  lastRecordedMedia = { blob, filename, mimeType, url };

  els.savePreviewVideo.src = url;
  const mb = (blob.size / (1024 * 1024)).toFixed(2);
  els.saveFileInfo.textContent = `${filename} (${mb} MB)`;

  // Show native Share button if Web Share API supports file sharing (iOS Safari / Android Chrome)
  let canShareFile = false;
  try {
    if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
      const testFile = new File([blob], filename, { type: mimeType || 'video/mp4' });
      canShareFile = navigator.canShare({ files: [testFile] });
    }
  } catch {
    canShareFile = false;
  }
  els.btnShareVideo.classList.toggle('hidden', !canShareFile);
  els.saveModal.classList.remove('hidden');
  sim.setSuspended(true);
}

function closeSaveModal() {
  els.saveModal.classList.add('hidden');
  els.savePreviewVideo.pause();
  els.savePreviewVideo.removeAttribute('src');
  els.savePreviewVideo.load();
  if (!els.studioPanel.classList.contains('drawer-open')) {
    sim.setSuspended(false);
  }
}

// Recorder setup
const recorder = new VideoRecorder(canvas, audio, {
  onStateChange: (recState) => {
    if (recState.isRecording) {
      els.recBadge.classList.add('recording');
      els.floatingRecBar.classList.remove('hidden');
      els.btnFloatingStopRec.disabled = !!recState.isStopping;
      els.btnFloatingStopRec.textContent = recState.isStopping ? '保存中...' : '■ 停止';
      els.btnRecordLabel.textContent = recState.isStopping ? '保存中...' : '■ 録画停止';
      els.btnAutoRec.classList.toggle('is-active', recState.autoRecMode);
    } else {
      els.recBadge.classList.remove('recording');
      els.recBadgeText.textContent = 'STANDBY';
      els.floatingRecBar.classList.add('hidden');
      els.btnFloatingStopRec.disabled = false;
      els.btnFloatingStopRec.textContent = '■ 停止';
      els.btnRecordLabel.textContent = '● 録画開始';
      els.btnAutoRec.classList.remove('is-active');
    }
  },
  onComplete: (result) => {
    if (isMobileDevice || isIOSDevice) {
      openSaveModal(result);
    } else {
      VideoRecorder.triggerDownload(result.blob, result.filename);
    }
  },
});

function updateCodecInfoText() {
  const bestCodec = VideoRecorder.pickBestMimeType();
  const resText = sim.liteMode ? '720×1280 30fps 軽量' : '1080×1920 60fps';
  if (bestCodec) {
    els.codecInfo.textContent =
      bestCodec.ext === 'mp4'
        ? `出力: MP4 (${resText}) — X直接投稿OK`
        : `出力: ${bestCodec.ext.toUpperCase()} (${resText} / 音声込み)`;
  } else {
    els.codecInfo.textContent = '※ このブラウザは直接録画に未対応です';
  }
}

// Simulation setup
const sim = new OverflowSimulation({
  renderer,
  audio,
  onStateUpdate: (st) => {
    els.statBalls.textContent = st.totalBalls;
    els.statCatches.textContent = st.catches;
    els.statSpill.textContent = st.spilledBalls || 0;

    const mins = Math.floor(st.elapsed / 60);
    const secs = (st.elapsed % 60).toFixed(1).padStart(4, '0');
    els.statTime.textContent = `${String(mins).padStart(2, '0')}:${secs}`;

    const pct = Math.round(st.overflowMeter * 100);
    els.statOverflowPct.textContent = `${pct}%`;
    els.statOverflowFill.style.width = `${pct}%`;
    els.seedInput.value = String(st.seed);

    if (recorder.isRecording) {
      const recSec = recorder.getElapsedSeconds().toFixed(1);
      const text = `${recorder.autoRecMode ? 'AUTO ' : ''}REC ${recSec}s`;
      els.recBadgeText.textContent = text;
      els.floatingRecText.textContent = text;
    }
  },
  onOverflowEnd: () => {
    if (recorder.isRecording && recorder.autoRecMode) {
      recorder.stop();
    }
  },
});

function unlockAudio() {
  audio.unlockSync();
}
window.addEventListener('touchend', unlockAudio, { passive: true });
window.addEventListener('click', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// --- Center START / REC-START Overlay Flow ---
function showStartStandby(mode = 'normal', { seed = null } = {}) {
  if (recorder.isRecording) recorder.stop();
  if (editor.active) {
    editor.setActive(false);
    els.btnToggleEditMainLabel.textContent = '✏️ この盤面を編集する';
    els.btnEditModeToggleLabel.textContent = '✏️ 編集モードを ON にする';
    els.mobilePlayBar.classList.remove('hidden');
    els.mobileEditBar.classList.add('hidden');
  }

  closeDrawer();
  sim.setSuspended(false);

  const compiled = compileDesignToPattern(currentDesign, currentBasePattern);
  sim.loadPattern(compiled, { seed, overrides: sim.overrides });
  sim.paused = true;
  renderer.render(sim); // Paint clean initial frame behind the START button

  pendingStartMode = mode;
  const isRec = mode === 'record' || mode === 'auto';
  els.btnCenterStart.classList.toggle('rec-mode', isRec);
  els.btnCancelPendingRec.classList.toggle('hidden', !isRec);

  if (mode === 'auto') {
    els.centerStartIcon.textContent = '🎬';
    els.centerStartTitle.textContent = 'AUTO REC START';
    els.centerStartSub.textContent = '押すと録画開始→溢れ後に自動保存';
  } else if (mode === 'record') {
    els.centerStartIcon.textContent = '●';
    els.centerStartTitle.textContent = 'REC & START';
    els.centerStartSub.textContent = '押すと録画と落下を同時スタート';
  } else {
    els.centerStartIcon.textContent = '▶';
    els.centerStartTitle.textContent = 'START';
    els.centerStartSub.textContent = '押すと落下スタート（サウンドON）';
  }

  els.startOverlay.classList.remove('hidden');
  els.btnPauseLabel.textContent = '▶ 再開';
  els.mBtnPause.textContent = '▶ 再開';
}

function hideStartStandby() {
  pendingStartMode = null;
  els.startOverlay.classList.add('hidden');
}

function launchFromStandby({ forceNormal = false } = {}) {
  // Synchronous iOS audio unlock inside button tap!
  audio.unlockSync();
  const mode = forceNormal ? 'normal' : (pendingStartMode || 'normal');
  hideStartStandby();

  sim.setSuspended(false);
  sim.paused = false;
  els.btnPauseLabel.textContent = '⏸ 一時停止';
  els.mBtnPause.textContent = '⏸ 停止';

  if (mode === 'auto' || mode === 'record') {
    recorder.start({
      auto: mode === 'auto',
      label: `overflow_${currentDesign.id || 'custom'}`,
      liteMode: sim.liteMode,
    });
  }
}

function setLiteMode(enabled) {
  sim.setLiteMode(enabled);
  els.btnLiteMode.classList.toggle('is-active', sim.liteMode);
  els.btnLiteModeLabel.textContent = sim.liteMode ? '⚡ 軽量モード ON' : '⚡ 軽量モード OFF';
  updateCodecInfoText();
}

// --- Tabs & Mobile Drawer ---
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-pane').forEach((p) => {
    p.classList.toggle('active', p.id === `tab-${tabName}`);
  });
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function openDrawer(tabName = null) {
  if (tabName) switchTab(tabName);
  els.studioPanel.classList.add('drawer-open');
  // Suspend background physics & canvas rendering while mobile drawer is open -> instant UI speed!
  if (window.innerWidth <= 900 && !recorder.isRecording) {
    sim.setSuspended(true);
  }
}

function closeDrawer() {
  els.studioPanel.classList.remove('drawer-open');
  if (els.saveModal.classList.contains('hidden')) {
    sim.setSuspended(false);
  }
}

els.btnCloseDrawer.addEventListener('click', closeDrawer);

// --- Edit Mode Toggle ---
function setEditMode(on, { openTab = true } = {}) {
  const enable = !!on;
  if (enable) {
    hideStartStandby();
    if (recorder.isRecording) recorder.stop();
    sim.paused = true;
    editor.setActive(true);
    const compiled = compileDesignToPattern(currentDesign, currentBasePattern);
    sim.applyLayoutPreview(compiled);
    if (openTab) switchTab('edit');
  } else {
    editor.setActive(false);
    sim.paused = false;
    const compiled = compileDesignToPattern(currentDesign, currentBasePattern);
    sim.loadPattern(compiled, { overrides: sim.overrides });
    els.btnPauseLabel.textContent = '⏸ 一時停止';
    els.mBtnPause.textContent = '⏸ 停止';
  }

  els.btnToggleEditMainLabel.textContent = enable ? '▶ 編集終了して再生！' : '✏️ この盤面を編集する';
  els.btnEditModeToggleLabel.textContent = enable ? '▶ 編集終了してテスト再生！' : '✏️ 編集モードを ON にする';
  els.mobilePlayBar.classList.toggle('hidden', enable);
  els.mobileEditBar.classList.toggle('hidden', !enable);
}

function selectTool(tool) {
  editor.setTool(tool);
  if (!editor.active) {
    setEditMode(true, { openTab: false });
  }
  document.querySelectorAll('[data-tool]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === tool);
  });
}

document.querySelectorAll('[data-tool]').forEach((btn) => {
  btn.addEventListener('click', () => {
    selectTool(btn.dataset.tool);
    if (window.innerWidth <= 900 && btn.closest('.studio-panel')) {
      closeDrawer();
    }
  });
});

// --- Pattern & Saved Board Management ---
function syncSlidersFromPattern(pat) {
  els.slGravity.value = pat.physics.gravity;
  els.valGravity.textContent = pat.physics.gravity;
  els.slBounce.value = pat.physics.pinRestitution;
  els.valBounce.textContent = pat.physics.pinRestitution.toFixed(2);
  els.slCatcherSpeed.value = pat.catcher.speed;
  els.valCatcherSpeed.textContent = pat.catcher.speed;
  els.slCatcherWidth.value = pat.catcher.width;
  els.valCatcherWidth.textContent = pat.catcher.width;
  els.slCatchBonus.value = pat.spawn.catchBonus;
  els.valCatchBonus.textContent = `+${pat.spawn.catchBonus}`;
  if (!background.useCustomColors) {
    els.inpBgTop.value = pat.theme.bgTop;
    els.inpBgBottom.value = pat.theme.bgBottom;
  }
}

function renderPatternButtons() {
  els.patternList.innerHTML = '';
  PATTERNS.forEach((pat, idx) => {
    const active = !currentSavedId && currentDesign.id === pat.id;
    const btn = document.createElement('button');
    btn.className = `pattern-item ${active ? 'active' : ''}`;
    btn.innerHTML = `
      <div>
        <span class="p-name">${pat.name}</span>
        <span class="p-sub">${pat.subtitle}</span>
      </div>
      <kbd>${pat.shortcut || idx + 1}</kbd>
    `;
    btn.addEventListener('click', () => {
      hideStartStandby();
      selectPresetPattern(idx);
      closeDrawer();
    });
    els.patternList.appendChild(btn);
  });
}

function renderSavedBoards() {
  const list = BoardStorage.list();
  els.savedCountBadge.textContent = `${list.length}件`;
  els.savedBoardList.innerHTML = '';
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'hint-text';
    p.style.marginTop = '0';
    p.textContent = '「✏️ 盤面編集」タブから保存した盤面がここに並びます。';
    els.savedBoardList.appendChild(p);
    return;
  }

  for (const item of list) {
    const row = document.createElement('div');
    row.className = 'saved-row';

    const btn = document.createElement('button');
    btn.className = `pattern-item ${currentSavedId === item.id ? 'active' : ''}`;
    btn.innerHTML = `
      <div>
        <span class="p-name">${item.name}</span>
        <span class="p-sub">壁 ${item.design.polylines?.length || 0}本 / 釘 ${item.design.pins?.length || 0}個</span>
      </div>
    `;
    btn.addEventListener('click', () => {
      hideStartStandby();
      loadCustomDesign(item.design, item.id);
      closeDrawer();
    });

    const del = document.createElement('button');
    del.className = 'btn-mini';
    del.textContent = '🗑';
    del.title = '削除';
    del.addEventListener('click', () => {
      BoardStorage.remove(item.id);
      if (currentSavedId === item.id) currentSavedId = null;
      renderSavedBoards();
    });

    row.appendChild(btn);
    row.appendChild(del);
    els.savedBoardList.appendChild(row);
  }
}

function selectPresetPattern(idx, seed = null) {
  if (idx < 0 || idx >= PATTERNS.length) return;
  currentBasePattern = PATTERNS[idx];
  currentSavedId = null;
  currentDesign = designFromPattern(currentBasePattern);
  editor.setDesign(currentDesign, { resetHistory: true });
  els.boardNameInput.value = `${currentBasePattern.name} CUSTOM`;

  syncSlidersFromPattern(currentBasePattern);
  const compiled = compileDesignToPattern(currentDesign, currentBasePattern);

  if (editor.active) {
    sim.applyLayoutPreview(compiled);
  } else {
    sim.paused = false;
    els.btnPauseLabel.textContent = '⏸ 一時停止';
    els.mBtnPause.textContent = '⏸ 停止';
    sim.loadPattern(compiled, { seed });
  }
  renderPatternButtons();
  renderSavedBoards();
}

function loadCustomDesign(design, savedId = null) {
  currentBasePattern = getPatternById(design.basePatternId || 'classic');
  currentSavedId = savedId;
  currentDesign = design;
  if (design.bg) {
    background.importConfig(design.bg);
    syncBgUiFromState();
  }
  editor.setDesign(currentDesign, { resetHistory: true });
  els.boardNameInput.value = design.name || 'CUSTOM BOARD';
  syncSlidersFromPattern(currentBasePattern);

  const compiled = compileDesignToPattern(currentDesign, currentBasePattern);
  if (editor.active) {
    sim.applyLayoutPreview(compiled);
  } else {
    sim.paused = false;
    sim.loadPattern(compiled);
  }
  renderPatternButtons();
  renderSavedBoards();
}

function generateAndLoadRandomBoard() {
  unlockAudio();
  const filter = els.selGenFilter ? els.selGenFilter.value : 'any';
  const base = PATTERNS[0];
  const { design } = generateRandomBoard({ basePattern: base, filter });

  currentBasePattern = base;
  currentSavedId = null;
  currentDesign = design;
  editor.setDesign(currentDesign, { resetHistory: true });
  els.boardNameInput.value = design.name;

  const compiled = compileDesignToPattern(currentDesign, currentBasePattern);
  syncSlidersFromPattern(compiled);

  if (editor.active) {
    sim.applyLayoutPreview(compiled);
  } else {
    sim.paused = false;
    els.btnPauseLabel.textContent = '⏸ 一時停止';
    els.mBtnPause.textContent = '⏸ 停止';
    sim.loadPattern(compiled);
  }
  renderPatternButtons();
  renderSavedBoards();
}

// --- Core Actions ---
function startAutoRecord() {
  unlockAudio();
  if (recorder.isRecording) {
    recorder.stop();
    return;
  }
  showStartStandby('auto');
}

function toggleRecord() {
  unlockAudio();
  if (recorder.isRecording) {
    recorder.stop();
    return;
  }
  showStartStandby('record');
}

function triggerRestartStandby(seed = null) {
  unlockAudio();
  showStartStandby('normal', { seed });
}

function togglePause() {
  if (pendingStartMode) {
    launchFromStandby();
    return;
  }
  if (editor.active) {
    setEditMode(false);
    return;
  }
  const paused = sim.togglePause();
  els.btnPauseLabel.textContent = paused ? '▶ 再開' : '⏸ 一時停止';
  els.mBtnPause.textContent = paused ? '▶ 再開' : '⏸ 停止';
}

function toggleMute() {
  unlockAudio();
  const muted = audio.toggleMute();
  els.btnMuteLabel.textContent = muted ? '🔇 ミュート中' : '🔊 サウンド ON';
}

function toggleHud() {
  renderer.showHud = !renderer.showHud;
  els.btnHudLabel.textContent = renderer.showHud ? '📊 HUD 表示' : '📊 HUD 非表示';
}

function togglePanel() {
  const hidden = els.studioPanel.classList.toggle('hidden');
  els.floatingShowPanelBtn.classList.toggle('hidden', !hidden);
}

function toggleMirror() {
  editor.mirror = !editor.mirror;
  els.btnToggleMirror.classList.toggle('is-active', editor.mirror);
  els.btnMirrorLabel.textContent = editor.mirror ? '🪞 左右対称 ON' : '🪞 左右対称 OFF';
  els.mBtnMirror.textContent = editor.mirror ? '🪞 対称ON' : '🪞 対称OFF';
}

function runTraceSilhouette() {
  const res = editor.traceCurrentBackgroundImage({
    style: els.selAutoPinStyle.value,
    spacing: Number(els.slAutoPinSpacing.value),
  });
  if (!res.ok) {
    els.traceStatusText.textContent =
      res.reason === 'no_media'
        ? '※ 先に「🎨 背景・動画」タブで画像を選んでください'
        : '※ 輪郭を抽出できませんでした（背景と色の差がある画像をお試しください）';
    return;
  }
  els.traceStatusText.textContent = `✅ 輪郭から壁＆釘(${res.pins}本)を生成しました！自由に微調整できます`;
  setEditMode(true, { openTab: true });
  selectTool('select');
  closeDrawer();
}

// --- Button & Slider Bindings ---
els.btnCenterStart.addEventListener('click', () => launchFromStandby());
els.btnCancelPendingRec.addEventListener('click', () => launchFromStandby({ forceNormal: true }));
els.btnFloatingStopRec.addEventListener('click', () => recorder.stop());

els.btnCloseSaveModal.addEventListener('click', closeSaveModal);
els.btnDownloadVideo.addEventListener('click', () => {
  if (lastRecordedMedia) {
    VideoRecorder.triggerDownload(lastRecordedMedia.blob, lastRecordedMedia.filename);
  }
});
els.btnShareVideo.addEventListener('click', async () => {
  if (!lastRecordedMedia) return;
  try {
    const file = new File([lastRecordedMedia.blob], lastRecordedMedia.filename, {
      type: lastRecordedMedia.mimeType || 'video/mp4',
    });
    await navigator.share({ files: [file], title: 'OVERFLOW TOY STUDIO' });
  } catch {
    // user cancelled share sheet
  }
});

els.btnGenerateRandom.addEventListener('click', () => {
  hideStartStandby();
  generateAndLoadRandomBoard();
  closeDrawer();
});
els.btnAutoRec.addEventListener('click', startAutoRecord);
els.btnToggleEditMain.addEventListener('click', () => setEditMode(!editor.active));
els.btnEditModeToggle.addEventListener('click', () => {
  setEditMode(!editor.active);
  closeDrawer();
});
els.btnRecord.addEventListener('click', toggleRecord);
els.btnRestart.addEventListener('click', () => triggerRestartStandby());
els.btnPause.addEventListener('click', togglePause);
els.btnMute.addEventListener('click', toggleMute);
els.btnHud.addEventListener('click', toggleHud);
els.btnLiteMode.addEventListener('click', () => setLiteMode(!sim.liteMode));
els.btnHidePanel.addEventListener('click', togglePanel);
els.floatingShowPanelBtn.addEventListener('click', togglePanel);
els.btnResetParams.addEventListener('click', () => {
  syncSlidersFromPattern(currentBasePattern);
  sim.setOverride('gravity', currentBasePattern.physics.gravity);
  sim.setOverride('pinRestitution', currentBasePattern.physics.pinRestitution);
  sim.setOverride('catcherSpeed', currentBasePattern.catcher.speed);
  sim.setOverride('catcherWidth', currentBasePattern.catcher.width);
  sim.setOverride('catchBonus', currentBasePattern.spawn.catchBonus);
});
els.btnReplaySeed.addEventListener('click', () => {
  const s = Number(els.seedInput.value);
  if (!Number.isNaN(s)) triggerRestartStandby(s);
});

// Physics sliders
els.slGravity.addEventListener('input', (e) => {
  const v = Number(e.target.value);
  els.valGravity.textContent = v;
  sim.setOverride('gravity', v);
});
els.slBounce.addEventListener('input', (e) => {
  const v = Number(e.target.value);
  els.valBounce.textContent = v.toFixed(2);
  sim.setOverride('pinRestitution', v);
});
els.slCatcherSpeed.addEventListener('input', (e) => {
  const v = Number(e.target.value);
  els.valCatcherSpeed.textContent = v;
  sim.setOverride('catcherSpeed', v);
});
els.slCatcherWidth.addEventListener('input', (e) => {
  const v = Number(e.target.value);
  els.valCatcherWidth.textContent = v;
  sim.setOverride('catcherWidth', v);
});
els.slCatchBonus.addEventListener('input', (e) => {
  const v = Number(e.target.value);
  els.valCatchBonus.textContent = `+${v}`;
  sim.setOverride('catchBonus', v);
  if (sim.world?.catcher) sim.world.catcher.bonusLabel = v;
});

// Editor buttons
els.btnSmoothWalls.addEventListener('click', () => {
  if (!editor.active) setEditMode(true, { openTab: false });
  editor.smoothWalls();
});
els.btnToggleMirror.addEventListener('click', toggleMirror);
els.btnBlankBoard.addEventListener('click', () => {
  editor.pushUndo();
  currentSavedId = null;
  currentDesign = createBlankDesign(currentBasePattern);
  editor.setDesign(currentDesign, { resetHistory: false });
  els.boardNameInput.value = 'MY CUSTOM BOARD';
  setEditMode(true, { openTab: false });
  selectTool('wall_free');
  closeDrawer();
});
els.btnUndo.addEventListener('click', () => editor.undo());
els.btnRedo.addEventListener('click', () => editor.redo());

els.slAutoPinSpacing.addEventListener('input', (e) => {
  els.valAutoPinSpacing.textContent = `${e.target.value}px`;
});
els.btnAutoFillPins.addEventListener('click', () => {
  if (!editor.active) setEditMode(true, { openTab: false });
  editor.runAutoFillPins({
    style: els.selAutoPinStyle.value,
    spacing: Number(els.slAutoPinSpacing.value),
    keepBumpers: els.chkKeepBumpers.checked,
  });
});
els.btnClearPins.addEventListener('click', () => {
  if (!editor.active) setEditMode(true, { openTab: false });
  editor.clearPinsOnly({ keepBumpers: els.chkKeepBumpers.checked });
});
els.btnTraceFromBg.addEventListener('click', runTraceSilhouette);
els.btnTraceFromBgTab.addEventListener('click', runTraceSilhouette);

// Save / Export / Import
els.btnSaveBoard.addEventListener('click', () => {
  const name = els.boardNameInput.value.trim() || 'MY CUSTOM BOARD';
  const payload = { ...currentDesign, name, bg: background.exportConfig() };
  const saved = BoardStorage.save(name, payload);
  currentSavedId = saved.id;
  currentDesign = saved.design;
  renderSavedBoards();
  renderPatternButtons();
});
els.btnExportJson.addEventListener('click', () => {
  const name = els.boardNameInput.value.trim() || currentDesign.name || 'custom_board';
  BoardStorage.exportJsonFile({ ...currentDesign, name, bg: background.exportConfig() });
});
els.btnImportJson.addEventListener('click', () => els.inputImportJson.click());
els.inputImportJson.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const imported = await BoardStorage.importJsonFile(file);
    loadCustomDesign(imported, null);
  } catch (err) {
    alert(err.message || '読み込みに失敗しました');
  }
  e.target.value = '';
});

// Background controls
function syncBgUiFromState() {
  els.inpBgTop.value = background.bgTop;
  els.inpBgBottom.value = background.bgBottom;
  els.chkShowGrid.checked = background.showGrid;
  els.selMediaFit.value = background.mediaFit;
  els.slMediaOpacity.value = Math.round(background.mediaOpacity * 100);
  els.valMediaOpacity.textContent = `${Math.round(background.mediaOpacity * 100)}%`;
  els.slMediaScale.value = Math.round(background.mediaScale * 100);
  els.valMediaScale.textContent = `${Math.round(background.mediaScale * 100)}%`;
  els.slMediaX.value = background.mediaOffsetX;
  els.valMediaX.textContent = background.mediaOffsetX;
  els.slMediaY.value = background.mediaOffsetY;
  els.valMediaY.textContent = background.mediaOffsetY;
}

els.inpBrushColor.addEventListener('input', (e) => {
  background.brushColor = e.target.value;
});
document.querySelectorAll('.swatch').forEach((sw) => {
  sw.addEventListener('click', () => {
    background.brushColor = sw.dataset.color;
    els.inpBrushColor.value = sw.dataset.color;
    selectTool('bg_paint');
  });
});
els.slBrushSize.addEventListener('input', (e) => {
  background.brushSize = Number(e.target.value);
  els.valBrushSize.textContent = `${background.brushSize}px`;
});
els.slBrushOpacity.addEventListener('input', (e) => {
  background.brushOpacity = Number(e.target.value) / 100;
  els.valBrushOpacity.textContent = `${e.target.value}%`;
});
els.btnUndoPaint.addEventListener('click', () => background.undoPaint());
els.btnClearPaint.addEventListener('click', () => background.clearPaint());

els.inpBgTop.addEventListener('input', () => background.setColors(els.inpBgTop.value, els.inpBgBottom.value, true));
els.inpBgBottom.addEventListener('input', () => background.setColors(els.inpBgTop.value, els.inpBgBottom.value, true));
els.btnResetBgColors.addEventListener('click', () => {
  background.resetColors();
  els.inpBgTop.value = currentBasePattern.theme.bgTop;
  els.inpBgBottom.value = currentBasePattern.theme.bgBottom;
});
els.chkShowGrid.addEventListener('change', (e) => {
  background.showGrid = e.target.checked;
});

els.btnPickMedia.addEventListener('click', () => els.inputMediaFile.click());
els.inputMediaFile.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const info = await background.loadMediaFile(file);
    els.mediaStatusText.textContent = `✅ 読込済 (${info.type === 'video' ? 'ループ動画' : '画像'}): ${info.name}`;
    els.traceStatusText.textContent = '';
  } catch {
    els.mediaStatusText.textContent = '※ メディアの読み込みに失敗しました';
  }
  e.target.value = '';
});
els.btnClearMedia.addEventListener('click', () => {
  background.clearMedia();
  els.mediaStatusText.textContent = '未設定（PNG / JPG / MP4 / WebM 対応）';
});
els.selMediaFit.addEventListener('change', (e) => {
  background.mediaFit = e.target.value;
});
els.slMediaOpacity.addEventListener('input', (e) => {
  background.mediaOpacity = Number(e.target.value) / 100;
  els.valMediaOpacity.textContent = `${e.target.value}%`;
});
els.slMediaScale.addEventListener('input', (e) => {
  background.mediaScale = Number(e.target.value) / 100;
  els.valMediaScale.textContent = `${e.target.value}%`;
});
els.slMediaX.addEventListener('input', (e) => {
  background.mediaOffsetX = Number(e.target.value);
  els.valMediaX.textContent = e.target.value;
});
els.slMediaY.addEventListener('input', (e) => {
  background.mediaOffsetY = Number(e.target.value);
  els.valMediaY.textContent = e.target.value;
});

// Mobile dock actions
document.querySelectorAll('[data-action]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const act = btn.dataset.action;
    if (act === 'generateRandom') {
      hideStartStandby();
      generateAndLoadRandomBoard();
    } else if (act === 'toggleEdit') setEditMode(!editor.active, { openTab: false });
    else if (act === 'restart') triggerRestartStandby();
    else if (act === 'pause') togglePause();
    else if (act === 'openBgTab') openDrawer('bg');
    else if (act === 'openDrawer') openDrawer(editor.active ? 'edit' : 'play');
    else if (act === 'smoothWalls') editor.smoothWalls();
    else if (act === 'toggleMirror') toggleMirror();
    else if (act === 'undo') editor.undo();
  });
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
    if (e.target.type !== 'range' && e.target.type !== 'checkbox') return;
  }

  // Undo / Redo in Edit Mode
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (editor.active) {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    if (editor.active) {
      e.preventDefault();
      editor.redo();
    }
    return;
  }

  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const key = e.key.toLowerCase();
  if (key === 'n') {
    e.preventDefault();
    hideStartStandby();
    generateAndLoadRandomBoard();
  } else if (key === 'e') {
    e.preventDefault();
    setEditMode(!editor.active);
  } else if (key === 'r') {
    e.preventDefault();
    triggerRestartStandby();
  } else if (e.code === 'Space') {
    e.preventDefault();
    togglePause();
  } else if (key === 'v') {
    e.preventDefault();
    toggleRecord();
  } else if (key === 'a') {
    e.preventDefault();
    startAutoRecord();
  } else if (key === 'm') {
    e.preventDefault();
    toggleMute();
  } else if (key === 'l') {
    e.preventDefault();
    setLiteMode(!sim.liteMode);
  } else if (key === 'h') {
    e.preventDefault();
    togglePanel();
  } else if (key === 'g') {
    e.preventDefault();
    toggleHud();
  } else if (key >= '1' && key <= '9') {
    const idx = Number(key) - 1;
    if (idx < PATTERNS.length) {
      e.preventDefault();
      hideStartStandby();
      selectPresetPattern(idx);
    }
  }
});

// Debug handle
window.__overflowStudio = {
  sim,
  renderer,
  audio,
  recorder,
  background,
  editor,
  selectPresetPattern,
  setEditMode,
  setLiteMode,
  showStartStandby,
  PATTERNS,
};

// Boot! Enable Lite Mode automatically on mobile/touch devices for smooth performance & recording
setLiteMode(isMobileDevice);
selectPresetPattern(0);
sim.startLoop();
if (isMobileDevice) {
  // On mobile/iOS, start in clean START-button standby so the first tap unlocks Web Audio cleanly!
  showStartStandby('normal');
}
