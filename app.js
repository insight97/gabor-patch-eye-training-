const canvas = document.getElementById('stimulusCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const statusText = document.getElementById('statusText');
const hintText = document.getElementById('hintText');
const resultPanel = document.getElementById('resultPanel');
const resultList = document.getElementById('resultList');
const historyList = document.getElementById('historyList');

const CONFIG = {
  blocks: 3,
  trialsPerBlock: 20,
  fixationMs: 300,
  stimulusMs: 150,
  responseMs: 1200,
  gaborSize: 220,
  spatialFrequency: 0.04,
  sigma: 50,
  startContrast: 0.65,
  minContrast: 0.05,
  maxContrast: 1,
  contrastStep: 0.05,
};

const STORE_KEY = 'gabor-training-history-v1';

const game = {
  running: false,
  block: 0,
  trial: 0,
  expectedKey: null,
  trialStart: 0,
  awaitingResponse: false,
  timeoutId: null,
  sessionTrials: [],
  contrast: CONFIG.startContrast,
  consecutiveCorrect: 0,
  lastDirection: 0,
  reversals: [],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clearCanvas() {
  ctx.fillStyle = '#9ca3af';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawFixation() {
  clearCanvas();
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 15, cy);
  ctx.lineTo(cx + 15, cy);
  ctx.moveTo(cx, cy - 15);
  ctx.lineTo(cx, cy + 15);
  ctx.stroke();
}

function drawGabor({ contrast, angleDeg }) {
  clearCanvas();

  const size = CONFIG.gaborSize;
  const half = Math.floor(size / 2);
  const imageData = ctx.createImageData(size, size);

  const theta = (angleDeg * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const sigma2 = CONFIG.sigma * CONFIG.sigma;

  for (let y = -half; y < half; y += 1) {
    for (let x = -half; x < half; x += 1) {
      const xr = x * cosT + y * sinT;
      const yr = -x * sinT + y * cosT;

      const gaussian = Math.exp(-(xr * xr + yr * yr) / (2 * sigma2));
      const sinusoid = Math.cos(2 * Math.PI * CONFIG.spatialFrequency * xr);

      const luminance = 0.5 + 0.5 * contrast * gaussian * sinusoid;
      const gray = Math.round(clamp(luminance, 0, 1) * 255);

      const px = x + half;
      const py = y + half;
      const idx = (py * size + px) * 4;

      imageData.data[idx] = gray;
      imageData.data[idx + 1] = gray;
      imageData.data[idx + 2] = gray;
      imageData.data[idx + 3] = 255;
    }
  }

  const offsetX = (canvas.width - size) / 2;
  const offsetY = (canvas.height - size) / 2;
  ctx.putImageData(imageData, offsetX, offsetY);
}

function formatMs(value) {
  return Number.isFinite(value) ? `${Math.round(value)} ms` : '-';
}

function setStatus(text, hint = '') {
  statusText.textContent = text;
  hintText.textContent = hint;
}

function updateStaircase(correct) {
  const previousDirection = game.lastDirection;

  if (correct) {
    game.consecutiveCorrect += 1;
    if (game.consecutiveCorrect >= 2) {
      game.contrast = clamp(
        game.contrast - CONFIG.contrastStep,
        CONFIG.minContrast,
        CONFIG.maxContrast,
      );
      game.consecutiveCorrect = 0;
      game.lastDirection = -1;
    }
  } else {
    game.consecutiveCorrect = 0;
    game.contrast = clamp(
      game.contrast + CONFIG.contrastStep,
      CONFIG.minContrast,
      CONFIG.maxContrast,
    );
    game.lastDirection = 1;
  }

  if (previousDirection !== 0 && previousDirection !== game.lastDirection) {
    game.reversals.push(game.contrast);
  }
}

function getThresholdEstimate() {
  if (game.reversals.length < 4) {
    return game.contrast;
  }

  const tail = game.reversals.slice(-6);
  const avg = tail.reduce((sum, value) => sum + value, 0) / tail.length;
  return avg;
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
  const trimmed = history.slice(0, 20);
  localStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
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
    li.textContent = `${session.date}｜正確率 ${session.accuracy}%｜平均 RT ${session.avgRt}｜threshold ${session.threshold}`;
    historyList.appendChild(li);
  });
}

function handleKeydown(event) {
  if (!game.running || !game.awaitingResponse) {
    return;
  }

  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return;
  }

  game.awaitingResponse = false;
  clearTimeout(game.timeoutId);

  const rt = performance.now() - game.trialStart;
  const correct = event.key === game.expectedKey;
  updateStaircase(correct);

  game.sessionTrials.push({
    block: game.block,
    trial: game.trial,
    expectedKey: game.expectedKey,
    response: event.key,
    correct,
    rt: Math.round(rt),
    contrast: Number(game.contrast.toFixed(3)),
  });

  setStatus(
    `Block ${game.block}/${CONFIG.blocks} · Trial ${game.trial}/${CONFIG.trialsPerBlock}`,
    correct ? `✅ 正確（RT ${Math.round(rt)} ms）` : `❌ 錯誤（RT ${Math.round(rt)} ms）`,
  );
}

async function runTrial() {
  game.trial += 1;
  setStatus(`Block ${game.block}/${CONFIG.blocks} · Trial ${game.trial}/${CONFIG.trialsPerBlock}`, '請注視中央 +');

  drawFixation();
  await sleep(CONFIG.fixationMs);

  const leftTilt = Math.random() < 0.5;
  const angle = leftTilt ? -15 : 15;
  game.expectedKey = leftTilt ? 'ArrowLeft' : 'ArrowRight';

  drawGabor({ contrast: game.contrast, angleDeg: angle });
  await sleep(CONFIG.stimulusMs);

  drawFixation();

  game.awaitingResponse = true;
  game.trialStart = performance.now();

  const result = await new Promise((resolve) => {
    game.timeoutId = setTimeout(() => {
      if (!game.awaitingResponse) {
        resolve('answered');
        return;
      }

      game.awaitingResponse = false;
      updateStaircase(false);
      game.sessionTrials.push({
        block: game.block,
        trial: game.trial,
        expectedKey: game.expectedKey,
        response: 'timeout',
        correct: false,
        rt: null,
        contrast: Number(game.contrast.toFixed(3)),
      });
      setStatus(`Block ${game.block}/${CONFIG.blocks} · Trial ${game.trial}/${CONFIG.trialsPerBlock}`, '⏱️ 超時');
      resolve('timeout');
    }, CONFIG.responseMs);

    const poll = setInterval(() => {
      if (!game.awaitingResponse) {
        clearInterval(poll);
        resolve('answered');
      }
    }, 16);
  });

  await sleep(250);
  return result;
}

function summarizeSession() {
  const total = game.sessionTrials.length;
  const correctCount = game.sessionTrials.filter((trial) => trial.correct).length;
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const rts = game.sessionTrials
    .filter((trial) => Number.isFinite(trial.rt))
    .map((trial) => trial.rt);
  const avgRtValue = rts.length > 0 ? rts.reduce((sum, v) => sum + v, 0) / rts.length : NaN;

  const threshold = Number(getThresholdEstimate().toFixed(3));

  return {
    date: new Date().toLocaleString('zh-TW', { hour12: false }),
    total,
    correct: correctCount,
    accuracy,
    avgRt: formatMs(avgRtValue),
    threshold,
  };
}

function showResult(summary) {
  resultList.innerHTML = '';

  const rows = [
    `題數：${summary.total}`,
    `正確：${summary.correct}`,
    `正確率：${summary.accuracy}%`,
    `平均反應時間：${summary.avgRt}`,
    `threshold（估計）：${summary.threshold} 對比`,
  ];

  rows.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    resultList.appendChild(li);
  });

  resultPanel.hidden = false;
}

async function runSession() {
  game.running = true;
  game.block = 0;
  game.trial = 0;
  game.sessionTrials = [];
  game.contrast = CONFIG.startContrast;
  game.consecutiveCorrect = 0;
  game.lastDirection = 0;
  game.reversals = [];

  startBtn.disabled = true;
  resultPanel.hidden = true;

  for (let block = 1; block <= CONFIG.blocks; block += 1) {
    game.block = block;
    game.trial = 0;

    for (let trial = 1; trial <= CONFIG.trialsPerBlock; trial += 1) {
      await runTrial();
    }

    if (block < CONFIG.blocks) {
      setStatus(`完成 Block ${block}/${CONFIG.blocks}`, '休息 3 秒後繼續');
      await sleep(3000);
    }
  }

  game.running = false;
  startBtn.disabled = false;
  clearCanvas();

  const summary = summarizeSession();
  showResult(summary);
  saveSession(summary);
  renderHistory();

  setStatus('訓練完成 🎉', `正確率 ${summary.accuracy}% · threshold ${summary.threshold}`);
}

startBtn.addEventListener('click', () => {
  if (game.running) {
    return;
  }
  runSession();
});

document.addEventListener('keydown', handleKeydown);

clearCanvas();
renderHistory();
