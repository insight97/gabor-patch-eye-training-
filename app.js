let targetCanvas;
let targetCtx;
let optionsCanvas;
let optionsCtx;
let startBtn;
let statusText;
let hintText;
let feedbackText;
let candidateLabel;
let progressText;
let progressFill;
let progressWrap;
let celebrationPopup;
let resultPanel;
let resultList;
let historyList;

const CONFIG = {
  blocks: 1,
  trialsPerBlock: 10,
  optionsCount: 16,
  optionSize: 86,
  optionGapX: 120,
  optionGapY: 110,
};

const STORE_KEY = 'gabor-match-training-history-v3';
const ORIENTATIONS = [-60, -30, 0, 30, 60];
const FREQUENCIES = [0.028, 0.04, 0.052];
const DIFFICULTY_PROFILES = [
  {
    label: '簡單',
    orientationOffsets: [-60, -30, 30, 60],
    frequencyOffsets: [-0.024, -0.012, 0.012, 0.024],
    fastRtThreshold: 2300,
    slowRtThreshold: 4000,
  },
  {
    label: '普通',
    orientationOffsets: [-30, -15, 15, 30],
    frequencyOffsets: [-0.012, -0.006, 0.006, 0.012],
    fastRtThreshold: 1800,
    slowRtThreshold: 3300,
  },
  {
    label: '困難',
    orientationOffsets: [-20, -10, 10, 20],
    frequencyOffsets: [-0.008, -0.004, 0.004, 0.008],
    fastRtThreshold: 1500,
    slowRtThreshold: 2600,
  },
  {
    label: '專家',
    orientationOffsets: [-12, -6, 6, 12],
    frequencyOffsets: [-0.005, -0.002, 0.002, 0.005],
    fastRtThreshold: 1200,
    slowRtThreshold: 2200,
  },
];

const game = {
  running: false,
  block: 0,
  trial: 0,
  awaitingResponse: false,
  trialStart: 0,
  sessionTrials: [],
  optionHitboxes: [],
  selectedIndices: new Set(),
  answerIndices: new Set(),
  currentTarget: null,
  currentOptions: [],
  requiredMatchCount: null,
  trialClickCount: 0,
  trialMistakeClickCount: 0,
  difficultyLevel: 1,
};

function setFatalStatus(message) {
  const statusNode = document.getElementById('statusText');
  const hintNode = document.getElementById('hintText');
  const startNode = document.getElementById('startBtn');

  if (statusNode) {
    statusNode.textContent = message;
  }
  if (hintNode) {
    hintNode.textContent = '請重新整理頁面，或改用最新版 Chrome / Edge / Firefox / Safari。';
  }
  if (startNode) {
    startNode.disabled = true;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setStatus(text, hint = '') {
  statusText.textContent = text;
  hintText.textContent = hint;
}

function setFeedback(text = '', type = '') {
  feedbackText.textContent = text;
  feedbackText.className = '';
  if (type) {
    feedbackText.classList.add(`feedback-${type}`);
  }
}

function getTotalTrials() {
  return CONFIG.blocks * CONFIG.trialsPerBlock;
}

function getCompletedTrialsCount() {
  return (game.block - 1) * CONFIG.trialsPerBlock + game.trial;
}

function updateProgress() {
  const totalTrials = getTotalTrials();
  const completedTrials = game.running ? getCompletedTrialsCount() : 0;
  progressText.textContent = `${completedTrials} / ${totalTrials}`;
  const percentage = totalTrials === 0 ? 0 : Math.min(100, Math.round((completedTrials / totalTrials) * 100));
  progressFill.style.width = `${percentage}%`;
}

function updateSessionControls() {
  if (!startBtn || !progressWrap) {
    return;
  }

  if (game.running) {
    startBtn.hidden = true;
    progressWrap.hidden = false;
    return;
  }

  startBtn.hidden = false;
  progressWrap.hidden = true;
}

function updateCandidateLabel() {
  if (!Number.isInteger(game.requiredMatchCount) || game.requiredMatchCount <= 0) {
    candidateLabel.textContent = '候選符號（尚未開始）';
    return;
  }
  candidateLabel.textContent = `候選符號（請選出 ${game.requiredMatchCount} 個相同）`;
}

async function showCelebrationPopup() {
  celebrationPopup.hidden = false;

  await new Promise((resolve) => {
    let settled = false;
    let timerId;
    let keydownHandler;

    const closePopup = () => {
      if (settled) {
        return;
      }
      settled = true;
      celebrationPopup.hidden = true;
      celebrationPopup.removeEventListener('pointerdown', handlePointerDown);
      celebrationPopup.removeEventListener('click', handlePointerDown);
      celebrationPopup.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', keydownHandler);
      clearTimeout(timerId);
      resolve();
    };

    const handlePointerDown = () => {
      closePopup();
    };

    keydownHandler = (event) => {
      if (event.key === 'Escape') {
        closePopup();
      }
    };

    celebrationPopup.addEventListener('pointerdown', handlePointerDown);
    celebrationPopup.addEventListener('click', handlePointerDown);
    celebrationPopup.addEventListener('touchstart', handlePointerDown, { passive: true });
    window.addEventListener('keydown', keydownHandler);
    timerId = setTimeout(closePopup, 900);
  });
}

function clearCanvas(ctx, canvas) {
  ctx.fillStyle = '#9ca3af';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawGaborPatch(ctx, cx, cy, size, patch, selected = false) {
  const half = Math.floor(size / 2);
  const imageData = ctx.createImageData(size, size);
  const theta = (patch.orientation * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const sigma = size * 0.26;
  const sigma2 = sigma * sigma;
  const contrast = 0.9;

  for (let y = -half; y < half; y += 1) {
    for (let x = -half; x < half; x += 1) {
      const xr = x * cosT + y * sinT;
      const yr = -x * sinT + y * cosT;
      const gaussian = Math.exp(-(xr * xr + yr * yr) / (2 * sigma2));
      const sinusoid = Math.cos(2 * Math.PI * patch.frequency * xr);
      const luminance = 0.5 + 0.5 * contrast * gaussian * sinusoid;
      const gray = Math.max(0, Math.min(255, Math.round(luminance * 255)));

      const px = x + half;
      const py = y + half;
      const idx = (py * size + px) * 4;
      imageData.data[idx] = gray;
      imageData.data[idx + 1] = gray;
      imageData.data[idx + 2] = gray;
      imageData.data[idx + 3] = 255;
    }
  }

  const drawX = Math.round(cx - half);
  const drawY = Math.round(cy - half);

  ctx.save();
  ctx.putImageData(imageData, drawX, drawY);

  if (!selected) {
    ctx.restore();
    return;
  }

  const outlinePadding = 6;
  const outlineSize = size + outlinePadding * 2;
  const outlineX = Math.round(cx - outlineSize / 2);
  const outlineY = Math.round(cy - outlineSize / 2);

  ctx.lineWidth = 4;
  ctx.strokeStyle = '#22c55e';
  ctx.strokeRect(outlineX, outlineY, outlineSize, outlineSize);
  ctx.restore();
}

function patchEquals(a, b) {
  return a.orientation === b.orientation && a.frequency === b.frequency;
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPatch() {
  return {
    orientation: randomFrom(ORIENTATIONS),
    frequency: randomFrom(FREQUENCIES),
  };
}

function getDifficultyProfile() {
  return DIFFICULTY_PROFILES[Math.max(0, Math.min(DIFFICULTY_PROFILES.length - 1, game.difficultyLevel))];
}

function clampByRange(value, values) {
  return Math.max(Math.min(...values), Math.min(Math.max(...values), value));
}

function createDistractorFromTarget(target, profile) {
  const useOrientationOnly = Math.random() < 0.5;
  const orientationShift = randomFrom(profile.orientationOffsets);
  const frequencyShift = randomFrom(profile.frequencyOffsets);
  const candidate = {
    orientation: target.orientation,
    frequency: target.frequency,
  };

  if (useOrientationOnly) {
    candidate.orientation = clampByRange(target.orientation + orientationShift, ORIENTATIONS);
  } else {
    candidate.frequency = clampByRange(target.frequency + frequencyShift, FREQUENCIES);
  }

  if (patchEquals(candidate, target)) {
    if (useOrientationOnly) {
      candidate.orientation = randomFrom(ORIENTATIONS.filter((value) => value !== target.orientation));
    } else {
      candidate.frequency = randomFrom(FREQUENCIES.filter((value) => value !== target.frequency));
    }
  }

  return candidate;
}

function generateTrialPatches() {
  const target = randomPatch();
  const options = [];
  const matchingCount = randomInt(2, 4);
  const profile = getDifficultyProfile();

  for (let i = 0; i < matchingCount; i += 1) {
    options.push({ ...target });
  }

  while (options.length < CONFIG.optionsCount) {
    const candidate = createDistractorFromTarget(target, profile);
    if (!patchEquals(candidate, target)) {
      options.push(candidate);
    }
  }

  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  const answerIndices = new Set();
  options.forEach((option, index) => {
    if (patchEquals(option, target)) {
      answerIndices.add(index);
    }
  });

  return { target, options, answerIndices, matchingCount, difficultyLabel: profile.label };
}

function getTrialPerformanceLevel(trialResult) {
  const clickCount = trialResult.clickCount || 0;
  const trialAccuracy =
    clickCount > 0
      ? Math.round(((clickCount - (trialResult.mistakeClicks || 0)) / clickCount) * 100)
      : 100;
  const profile = getDifficultyProfile();
  const fastAndAccurate =
    trialResult.correct &&
    trialAccuracy >= 90 &&
    trialResult.rt <= profile.fastRtThreshold;
  const struggling = !trialResult.correct || trialAccuracy < 70 || trialResult.rt >= profile.slowRtThreshold;

  if (fastAndAccurate) {
    return 'up';
  }
  if (struggling) {
    return 'down';
  }
  return 'stay';
}

function adaptDifficulty(trialResult) {
  const before = game.difficultyLevel;
  const performanceLevel = getTrialPerformanceLevel(trialResult);
  if (performanceLevel === 'up') {
    game.difficultyLevel = Math.min(DIFFICULTY_PROFILES.length - 1, game.difficultyLevel + 1);
  } else if (performanceLevel === 'down') {
    game.difficultyLevel = Math.max(0, game.difficultyLevel - 1);
  }
  return {
    beforeLabel: DIFFICULTY_PROFILES[before].label,
    afterLabel: DIFFICULTY_PROFILES[game.difficultyLevel].label,
    changed: before !== game.difficultyLevel,
  };
}

function renderTarget() {
  clearCanvas(targetCtx, targetCanvas);
  if (!game.currentTarget) {
    return;
  }
  drawGaborPatch(targetCtx, targetCanvas.width / 2, targetCanvas.height / 2, CONFIG.optionSize, game.currentTarget);
}

function renderOptions() {
  clearCanvas(optionsCtx, optionsCanvas);
  game.optionHitboxes = [];

  const cols = 4;
  const rows = Math.ceil(game.currentOptions.length / cols);
  const gridWidth = (cols - 1) * CONFIG.optionGapX;
  const gridHeight = (rows - 1) * CONFIG.optionGapY;
  const startX = (optionsCanvas.width - gridWidth) / 2;
  const startY = (optionsCanvas.height - gridHeight) / 2;

  game.currentOptions.forEach((option, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = startX + col * CONFIG.optionGapX;
    const y = startY + row * CONFIG.optionGapY;
    const selected = game.selectedIndices.has(index);

    drawGaborPatch(optionsCtx, x, y, CONFIG.optionSize, option, selected);

    game.optionHitboxes.push({
      index,
      x,
      y,
      radius: CONFIG.optionSize / 2 + 8,
    });
  });
}

function getCanvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function toggleOptionAt(event) {
  if (!game.running || !game.awaitingResponse) {
    return;
  }

  const point = getCanvasPoint(event, optionsCanvas);
  const hit = game.optionHitboxes.find((item) => {
    const dx = point.x - item.x;
    const dy = point.y - item.y;
    return dx * dx + dy * dy <= item.radius * item.radius;
  });

  if (!hit) {
    return;
  }

  const wasSelected = game.selectedIndices.has(hit.index);
  const isAnswer = game.answerIndices.has(hit.index);
  const isMistakeClick = (!wasSelected && !isAnswer) || (wasSelected && isAnswer);

  game.trialClickCount += 1;
  if (isMistakeClick) {
    game.trialMistakeClickCount += 1;
  }

  if (game.selectedIndices.has(hit.index)) {
    game.selectedIndices.delete(hit.index);
  } else {
    game.selectedIndices.add(hit.index);
  }

  renderOptions();

  if (setsEqual(game.selectedIndices, game.answerIndices)) {
    submitCurrentTrial();
  }
}

function setsEqual(a, b) {
  if (a.size !== b.size) {
    return false;
  }
  return [...a].every((value) => b.has(value));
}

function submitCurrentTrial() {
  if (!game.awaitingResponse) {
    return;
  }

  game.awaitingResponse = false;

  const rt = Math.round(performance.now() - game.trialStart);
  const selectedSorted = [...game.selectedIndices].sort((a, b) => a - b);
  const answerSorted = [...game.answerIndices].sort((a, b) => a - b);
  const correct = setsEqual(game.selectedIndices, game.answerIndices);

  const trialResult = {
    block: game.block,
    trial: game.trial,
    correct,
    rt,
    selected: selectedSorted,
    answer: answerSorted,
    target: { ...game.currentTarget },
    clickCount: game.trialClickCount,
    mistakeClicks: game.trialMistakeClickCount,
    difficulty: getDifficultyProfile().label,
  };
  game.sessionTrials.push(trialResult);
  const adaptation = adaptDifficulty(trialResult);

  const trialTitle = `Block ${game.block}/${CONFIG.blocks} · Trial ${game.trial}/${CONFIG.trialsPerBlock}`;
  if (correct) {
    setStatus(
      trialTitle,
      `✅ 正確（RT ${rt} ms）｜難度：${adaptation.beforeLabel}${adaptation.changed ? ` → ${adaptation.afterLabel}` : ''}`,
    );
    setFeedback('🎉 完全正確！', 'success');
  } else {
    setStatus(
      trialTitle,
      `❌ 錯誤（RT ${rt} ms）｜難度：${adaptation.beforeLabel}${adaptation.changed ? ` → ${adaptation.afterLabel}` : ''}`,
    );
    setFeedback('');
  }
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveSession(summary) {
  const history = getHistory();
  history.unshift(summary);
  localStorage.setItem(STORE_KEY, JSON.stringify(history.slice(0, 20)));
}

function renderHistory() {
  const history = getHistory();
  historyList.innerHTML = '';

  if (history.length === 0) {
    const li = document.createElement('li');
    li.textContent = '還沒有紀錄，先玩一局吧。';
    historyList.appendChild(li);
    return;
  }

  history.slice(0, 10).forEach((session) => {
    const li = document.createElement('li');
    li.textContent = `${session.date}｜總分 ${session.finalScore}｜正確率 ${session.accuracy}%｜平均 RT ${session.avgRt}`;
    historyList.appendChild(li);
  });
}

function summarizeSession() {
  const total = game.sessionTrials.length;
  const correctCount = game.sessionTrials.filter((trial) => trial.correct).length;
  const totalClicks = game.sessionTrials.reduce((sum, trial) => sum + (trial.clickCount || 0), 0);
  const totalMistakeClicks = game.sessionTrials.reduce((sum, trial) => sum + (trial.mistakeClicks || 0), 0);
  const accuracy =
    totalClicks > 0 ? Math.round(((totalClicks - totalMistakeClicks) / totalClicks) * 100) : 0;
  const completionRate = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const rts = game.sessionTrials
    .filter((trial) => Number.isFinite(trial.rt))
    .map((trial) => trial.rt);
  const avgRtValue = rts.length > 0 ? Math.round(rts.reduce((sum, value) => sum + value, 0) / rts.length) : null;
  const speedScore = avgRtValue === null ? 0 : Math.max(0, Math.min(100, Math.round(100 - avgRtValue / 80)));
  const finalScore = Math.round(accuracy * 0.7 + speedScore * 0.3);
  const avgDifficulty =
    total === 0
      ? '-'
      : game.sessionTrials.map((trial) => DIFFICULTY_PROFILES.findIndex((profile) => profile.label === trial.difficulty) + 1);
  const avgDifficultyLevel =
    avgDifficulty === '-' ? '-' : (avgDifficulty.reduce((sum, value) => sum + value, 0) / total).toFixed(2);

  return {
    date: new Date().toLocaleString('zh-TW', { hour12: false }),
    total,
    correct: correctCount,
    accuracy,
    completionRate,
    avgRt: avgRtValue === null ? '-' : `${avgRtValue} ms`,
    speedScore,
    finalScore,
    totalClicks,
    totalMistakeClicks,
    avgDifficulty: avgDifficultyLevel,
  };
}

function showResult(summary) {
  resultList.innerHTML = '';
  [
    `題數：${summary.total}`,
    `正確：${summary.correct}`,
    `完成率：${summary.completionRate}%`,
    `操作正確率：${summary.accuracy}%（點錯再收回會扣分）`,
    `誤點次數：${summary.totalMistakeClicks} / ${summary.totalClicks} 次操作`,
    `平均反應時間：${summary.avgRt}`,
    `平均難度等級：${summary.avgDifficulty}`,
    `速度分數：${summary.speedScore}`,
    `總分（正確率 70% + 速度 30%）：${summary.finalScore}`,
  ].forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    resultList.appendChild(li);
  });

  resultPanel.hidden = false;
}

async function runTrial() {
  game.trial += 1;
  game.selectedIndices = new Set();
  game.trialClickCount = 0;
  game.trialMistakeClickCount = 0;

  const generated = generateTrialPatches();
  game.currentTarget = generated.target;
  game.currentOptions = generated.options;
  game.answerIndices = generated.answerIndices;
  game.requiredMatchCount = generated.matchingCount;
  updateCandidateLabel();
  updateProgress();

  renderTarget();
  renderOptions();

  setStatus(
    `Block ${game.block}/${CONFIG.blocks} · Trial ${game.trial}/${CONFIG.trialsPerBlock}`,
    `難度：${generated.difficultyLabel}｜請選出 ${game.requiredMatchCount} 個與目標蓋博符號相同的刺激`,
  );
  setFeedback('');

  game.awaitingResponse = true;
  game.trialStart = performance.now();

  await new Promise((resolve) => {
    const poll = setInterval(() => {
      if (!game.awaitingResponse) {
        clearInterval(poll);
        resolve();
      }
    }, 16);
  });

  await showCelebrationPopup();
}

async function runSession() {
  game.running = true;
  game.block = 0;
  game.trial = 0;
  game.sessionTrials = [];
  game.requiredMatchCount = null;
  game.difficultyLevel = 1;

  startBtn.disabled = true;
  resultPanel.hidden = true;
  updateSessionControls();
  updateProgress();

  for (let block = 1; block <= CONFIG.blocks; block += 1) {
    game.block = block;
    game.trial = 0;

    for (let trial = 1; trial <= CONFIG.trialsPerBlock; trial += 1) {
      await runTrial();
    }

    if (block < CONFIG.blocks) {
      setStatus(`完成 Block ${block}/${CONFIG.blocks}`, '休息 2 秒後繼續');
      await sleep(2000);
    }
  }

  game.running = false;
  game.requiredMatchCount = null;
  startBtn.disabled = false;
  updateSessionControls();

  clearCanvas(targetCtx, targetCanvas);
  clearCanvas(optionsCtx, optionsCanvas);

  const summary = summarizeSession();
  showResult(summary);
  saveSession(summary);
  renderHistory();

  setStatus('訓練完成 🎉', `正確率 ${summary.accuracy}% · 平均 RT ${summary.avgRt}`);
  setFeedback(`🏁 本回合總分：${summary.finalScore}`, 'success');
  updateCandidateLabel();
  updateProgress();
}

function initApp() {
  targetCanvas = document.getElementById('targetCanvas');
  optionsCanvas = document.getElementById('optionsCanvas');
  startBtn = document.getElementById('startBtn');
  statusText = document.getElementById('statusText');
  hintText = document.getElementById('hintText');
  feedbackText = document.getElementById('feedbackText');
  candidateLabel = document.getElementById('candidateLabel');
  progressText = document.getElementById('progressText');
  progressFill = document.getElementById('progressFill');
  progressWrap = document.querySelector('.progress-wrap');
  celebrationPopup = document.getElementById('celebrationPopup');
  resultPanel = document.getElementById('resultPanel');
  resultList = document.getElementById('resultList');
  historyList = document.getElementById('historyList');

  if (
    !targetCanvas ||
    !optionsCanvas ||
    !startBtn ||
    !statusText ||
    !hintText ||
    !feedbackText ||
    !candidateLabel ||
    !progressText ||
    !progressFill ||
    !progressWrap ||
    !celebrationPopup ||
    !resultPanel ||
    !resultList ||
    !historyList
  ) {
    setFatalStatus('初始化失敗：找不到必要的頁面元件');
    return;
  }

  targetCtx = targetCanvas.getContext('2d');
  optionsCtx = optionsCanvas.getContext('2d');
  if (!targetCtx || !optionsCtx) {
    setFatalStatus('初始化失敗：瀏覽器不支援 Canvas 2D');
    return;
  }

  const handleStartSession = () => {
    if (game.running || startBtn.disabled) {
      return;
    }
    runSession();
  };

  startBtn.disabled = false;
  startBtn.hidden = false;
  startBtn.addEventListener('click', handleStartSession);
  startBtn.addEventListener('pointerup', handleStartSession);

  optionsCanvas.addEventListener('click', toggleOptionAt);
  optionsCanvas.addEventListener('touchstart', (event) => {
    const [touch] = event.changedTouches;
    if (!touch) {
      return;
    }
    toggleOptionAt(touch);
  });

  clearCanvas(targetCtx, targetCanvas);
  clearCanvas(optionsCtx, optionsCanvas);
  celebrationPopup.hidden = true;
  updateCandidateLabel();
  updateProgress();
  updateSessionControls();
  renderHistory();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
