let targetCanvas;
let targetCtx;
let optionsCanvas;
let optionsCtx;
let startBtn;
let statusText;
let hintText;
let feedbackText;
let resultPanel;
let resultList;
let historyList;

const CONFIG = {
  blocks: 3,
  trialsPerBlock: 12,
  optionsCount: 16,
  optionSize: 86,
  optionGapX: 120,
  optionGapY: 110,
};

const STORE_KEY = 'gabor-match-training-history-v3';
const ORIENTATIONS = [-60, -30, 0, 30, 60];
const FREQUENCIES = [0.028, 0.04, 0.052];

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

function generateTrialPatches() {
  const target = randomPatch();
  const options = [];
  const matchingCount = randomInt(2, 4);

  for (let i = 0; i < matchingCount; i += 1) {
    options.push({ ...target });
  }

  while (options.length < CONFIG.optionsCount) {
    const candidate = randomPatch();
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

  return { target, options, answerIndices };
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

  game.sessionTrials.push({
    block: game.block,
    trial: game.trial,
    correct,
    rt,
    selected: selectedSorted,
    answer: answerSorted,
    target: { ...game.currentTarget },
  });

  const trialTitle = `Block ${game.block}/${CONFIG.blocks} · Trial ${game.trial}/${CONFIG.trialsPerBlock}`;
  if (correct) {
    setStatus(trialTitle, `✅ 正確（RT ${rt} ms）`);
    setFeedback('🎉 完全正確！', 'success');
  } else {
    setStatus(trialTitle, `❌ 錯誤（RT ${rt} ms）`);
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
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const rts = game.sessionTrials
    .filter((trial) => Number.isFinite(trial.rt))
    .map((trial) => trial.rt);
  const avgRtValue = rts.length > 0 ? Math.round(rts.reduce((sum, value) => sum + value, 0) / rts.length) : null;
  const speedScore = avgRtValue === null ? 0 : Math.max(0, Math.min(100, Math.round(100 - avgRtValue / 80)));
  const finalScore = Math.round(accuracy * 0.7 + speedScore * 0.3);

  return {
    date: new Date().toLocaleString('zh-TW', { hour12: false }),
    total,
    correct: correctCount,
    accuracy,
    avgRt: avgRtValue === null ? '-' : `${avgRtValue} ms`,
    speedScore,
    finalScore,
  };
}

function showResult(summary) {
  resultList.innerHTML = '';
  [
    `題數：${summary.total}`,
    `正確：${summary.correct}`,
    `正確率：${summary.accuracy}%`,
    `平均反應時間：${summary.avgRt}`,
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

  const generated = generateTrialPatches();
  game.currentTarget = generated.target;
  game.currentOptions = generated.options;
  game.answerIndices = generated.answerIndices;

  renderTarget();
  renderOptions();

  setStatus(
    `Block ${game.block}/${CONFIG.blocks} · Trial ${game.trial}/${CONFIG.trialsPerBlock}`,
    `請選出 ${game.answerIndices.size} 個與目標 Gabor Patch 相同的刺激`,
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

  await sleep(300);
}

async function runSession() {
  game.running = true;
  game.block = 0;
  game.trial = 0;
  game.sessionTrials = [];

  startBtn.disabled = true;
  resultPanel.hidden = true;

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
  startBtn.disabled = false;

  clearCanvas(targetCtx, targetCanvas);
  clearCanvas(optionsCtx, optionsCanvas);

  const summary = summarizeSession();
  showResult(summary);
  saveSession(summary);
  renderHistory();

  setStatus('訓練完成 🎉', `正確率 ${summary.accuracy}% · 平均 RT ${summary.avgRt}`);
  setFeedback(`🏁 本回合總分：${summary.finalScore}`, 'success');
}

function initApp() {
  targetCanvas = document.getElementById('targetCanvas');
  optionsCanvas = document.getElementById('optionsCanvas');
  startBtn = document.getElementById('startBtn');
  statusText = document.getElementById('statusText');
  hintText = document.getElementById('hintText');
  feedbackText = document.getElementById('feedbackText');
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

  startBtn.addEventListener('click', () => {
    if (game.running) {
      return;
    }
    runSession();
  });

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
  renderHistory();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
