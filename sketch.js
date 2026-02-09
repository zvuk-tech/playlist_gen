// ========================
// GLOBALS
// ========================
let bgColor, ellipseColor;
let params;
let ellipseX = [], ellipseY = [], ellipseW = [], ellipseH = [], ellipseSkew = [];
let baseHeightNorm = [], baseSkewNorm = [];
let extraLeft = 5, extraRight = 5;

let historyStack = [];
let historyIndex = -1;
const HISTORY_LIMIT = 60;
let suppressHistory = false;

// ✅ Toggle for plaque visibility (preview + export)
let exportShowPlaque = true;

// ✅ Square preview buffer (shows EXACT square export framing)
let squarePreviewGfx = null;
let squarePreviewSize = 0;

const paletteColors = [
  "06DF65","B9FF8E","209F6D","AEEEFF","F7F0B1","FFD1E5","CBF2EC",
  "D7D9FF","2CB1FF","FF9535","FF49A0","00DBDB","765BFF"
];

// ========================
// FORBIDDEN COLOR PAIRS (bg <-> ellipse), order-independent
// ========================
const forbiddenPairsRaw = [
  ["AEEEFF","CBF2EC"],
  ["B9FF8E","AEEEFF"],
  ["B9FF8E","CBF2EC"],
  ["D3C8D0","F7F0B1"],
  ["CBF2EC","AEEEFF"],
  ["D3C8D0","FFD1E5"],
  ["D7D9FF","FFD1E5"],
  ["209f6d","ff49a0"],
  ["00dbdb","d3c8d0"],
  ["209f6d","d3c8d0"],
  ["d3c8d0","d7d9ff"],
  ["f7f0b1","b9ff8e"],
  ["ff9535","d7d9ff"],
  ["d7d9ff","209f6d"],
  ["d7d9ff","06df65"],
  ["D7D9FF","CBF2EC"],
  ["FF9535","00DBDB"],
  ["FFD1E5","CBF2EC"],
  ["B9FF8E","FFD1E5"],
  ["765BFF","209F6D"],
  ["FFD1E5","AEEEFF"],
  ["00DBDB","06DF65"],
  ["D3C8D0","CBF2EC"],
  ["209F6D","765BFF"],
  ["B9FF8E","AEEEFF"],
  ["F7F0B1","CBF2EC"],
  ["AEEEFF","D7D9FF"],
  ["FF9535","D3C8D0"],
  ["AEEEFF","D3C8D0"],
  ["06DF65","FF9535"],
  ["B9FF8E","D7D9FF"],
  ["06DF65","FF49A0"],
  ["CBF2EC","B9FF8E"],
  ["FF49A0","06DF65"],
];

// ========================
// BADGE ASSETS
// ========================
let plaqueImg = null;
let logoImg = null;

function preload() {
  plaqueImg = loadImage('plaque.svg', () => {}, (e) => console.error('[plaque loadImage error]', e));
  logoImg   = loadImage('logo.svg',   () => {}, (e) => console.error('[logo loadImage error]', e));
}

// ========================
// COLOR / FORBIDDEN UTILS
// ========================
function normHex(h) {
  return String(h).trim().replace(/^#/, "").toUpperCase();
}
function pairKey(a, b) {
  const x = normHex(a);
  const y = normHex(b);
  return (x < y) ? `${x}|${y}` : `${y}|${x}`;
}
const forbiddenSet = new Set(forbiddenPairsRaw.map(([a,b]) => pairKey(a,b)));
function isForbiddenPair(bgHex, ellHex) {
  return forbiddenSet.has(pairKey(bgHex, ellHex));
}
function randomPaletteHex() {
  return normHex(random(paletteColors));
}

function ensureAllowedPair(preferKeep = 'bg') {
  const bgHex = normHex(colorToHex(bgColor));
  const ellHex = normHex(colorToHex(ellipseColor));
  if (!isForbiddenPair(bgHex, ellHex)) return;

  const keepBg = (preferKeep === 'bg');
  const fixedHex = keepBg ? bgHex : ellHex;

  let nextHex = null;
  for (let i = 0; i < 250; i++) {
    const candidate = randomPaletteHex();
    if (candidate === fixedHex) continue;

    const ok = keepBg
      ? !isForbiddenPair(fixedHex, candidate)
      : !isForbiddenPair(candidate, fixedHex);

    if (ok) { nextHex = candidate; break; }
  }

  if (!nextHex) return;

  if (keepBg) ellipseColor = color("#" + nextHex);
  else bgColor = color("#" + nextHex);
}

function updateColorInputs(preferKeep = 'bg') {
  if (bgColor && ellipseColor) {
    const bgHexN = normHex(colorToHex(bgColor));
    const ellHexN = normHex(colorToHex(ellipseColor));
    if (isForbiddenPair(bgHexN, ellHexN)) {
      ensureAllowedPair(preferKeep);
    }
  }

  const bgHex = colorToHex(bgColor);
  const ellHex = colorToHex(ellipseColor);

  const bgInput = document.getElementById("bgColorInput");
  const ellInput = document.getElementById("ellipseColorInput");
  if (bgInput) bgInput.value = bgHex;
  if (ellInput) ellInput.value = ellHex;
}

// ========================
// SYNC SLIDERS
// ========================
function syncSlidersFromParams() {
  for (const key in params) {
    const el = document.getElementById(key);
    if (!el) continue;
    el.value = params[key];
  }
}

// ========================
// lineSpacing DEPENDS ON maxEllipseHeight
// ========================
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

function syncLineSpacingToHeight({ updateUI = true } = {}) {
  const hEl = document.getElementById("maxEllipseHeight");
  const sEl = document.getElementById("lineSpacing");
  if (!hEl || !sEl) return;

  const hMin = parseFloat(hEl.min);
  const hMax = parseFloat(hEl.max);
  const sMin = parseFloat(sEl.min);
  const sMax = parseFloat(sEl.max);

  const h = clamp(params.maxEllipseHeight, hMin, hMax);
  const t = (hMax === hMin) ? 0 : (h - hMin) / (hMax - hMin);

  const spacing = lerp(sMin, sMax, t);

  params.lineSpacing = spacing;
  if (updateUI) sEl.value = spacing;
}

// ========================
// SETUP / DRAW
// ========================
function setup() {
  const canvasHeight = 600;
  const canvasWidth = 1200;
  const canvas = createCanvas(canvasWidth, canvasHeight, WEBGL);
  canvas.parent('canvas-container');

  const d = Math.min(2, window.devicePixelRatio || 1);
  pixelDensity(d);

  setAttributes('antialias', true);
  smooth();
  noStroke();

  setRandomColors();

  params = {
    ellipseCount: 60, // будет принудительно выставлен на максимум ниже
    skewAngleX: 0,
    skewAngleY: 0,
    maxEllipseHeight: 180,
    heightRandomness: 0.5,
    chaos: 0,
    waveAmplitude: 50,
    waveOffset: random(1000),
    lineCopies: 0,
    lineSpacing: 230,      // будет синхронизирован ниже
    ellipseSpacing: -4,
    ellipseWidth: 25,
    rotateXAngle: 0,
    rotateYAngle: 0,
    rotateZAngle: 0,
    posX: 0,
    posY: 0,
    posZ: -200
  };

  linkSliders();

  // ✅ ellipseCount ВСЕГДА стартует с максимума (и UI тоже)
  const ellipseCountEl = document.getElementById('ellipseCount');
  if (ellipseCountEl) {
    params.ellipseCount = parseInt(ellipseCountEl.max, 10);
    ellipseCountEl.value = params.ellipseCount;
  }

  // сначала проставим UI, потом синхронизируем lineSpacing от высоты
  syncSlidersFromParams();
  syncLineSpacingToHeight({ updateUI: true });

  generateEllipses(false);

  // ✅ checkbox: plaque on preview + export
  const plaqueToggle = document.getElementById('exportPlaqueToggle');
  if (plaqueToggle) {
    plaqueToggle.checked = true;
    exportShowPlaque = plaqueToggle.checked;
    plaqueToggle.addEventListener('change', () => {
      exportShowPlaque = plaqueToggle.checked;
    });
  }

  // --- Color buttons
  document.getElementById('randomColorBothBtn')?.addEventListener('click', () => {
    setRandomColors();
    pushHistory();
  });
  document.getElementById('randomBgBtn')?.addEventListener('click', () => {
    setRandomBgColor();
    pushHistory();
  });
  document.getElementById('randomEllipseBtn')?.addEventListener('click', () => {
    setRandomEllipseColor();
    pushHistory();
  });

  // --- Collapsible sections
  document.querySelectorAll('.collapsible').forEach(btn => {
    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      content.style.display = (content.style.display === 'block') ? 'none' : 'block';
    });
  });

  // --- Undo and Save shortcut
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      undoHistory();
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      saveHighRes(1000, 1000);
    }
  });

  // HEX inputs (если есть)
  const bgInput = document.getElementById("bgColorInput");
  const ellInput = document.getElementById("ellipseColorInput");

  bgInput?.addEventListener("input", () => {
    if (/^#?[0-9A-Fa-f]{6}$/.test(bgInput.value)) {
      bgColor = color(bgInput.value.startsWith("#") ? bgInput.value : "#" + bgInput.value);
      updateColorInputs('bg');
      pushHistory();
    }
  });

  ellInput?.addEventListener("input", () => {
    if (/^#?[0-9A-Fa-f]{6}$/.test(ellInput.value)) {
      ellipseColor = color(ellInput.value.startsWith("#") ? ellInput.value : "#" + ellInput.value);
      updateColorInputs('ellipse');
      pushHistory();
    }
  });

  createPaletteSwatches();

  document.getElementById('randomBtn')?.addEventListener('click', () => { generateRandom(); pushHistory(); });
  document.getElementById('resetBtn')?.addEventListener('click', () => { resetParams(); pushHistory(); });

  // save buttons
  document.getElementById('save1000Btn')?.addEventListener('click', () => saveHighRes(1000, 1000));
  document.getElementById('save534Btn')?.addEventListener('click', () => saveHighRes(534, 530));
  document.getElementById('save640Btn')?.addEventListener('click', () => saveHighRes(640, 320));

  // ✅ init square preview buffer
  initSquarePreviewBuffer();

  pushHistory(true);
}

function draw() {
  // Рисуем только квадратный кадр в offscreen (это и есть превью)
  renderSquarePreview();

  // А на main canvas показываем только этот квадрат
  background(17);

  push();
  resetMatrix();

  imageMode(CENTER);
  image(squarePreviewGfx, 0, 0, squarePreviewSize, squarePreviewSize);

  // тонкая рамка вокруг квадрата
  noFill();
  stroke(255, 40);
  strokeWeight(1);
  rectMode(CENTER);
  rect(0, 0, squarePreviewSize, squarePreviewSize);

  pop();
}

// ========================
// SQUARE PREVIEW (EXACT as square export framing)
// ========================
function initSquarePreviewBuffer() {
  squarePreviewSize = Math.min(width, height); // = 600
  squarePreviewGfx = createGraphics(squarePreviewSize, squarePreviewSize, WEBGL);
  squarePreviewGfx.pixelDensity(1);
  squarePreviewGfx.noStroke();
  squarePreviewGfx.smooth();
  squarePreviewGfx.setAttributes?.('antialias', true);
}

function renderSquarePreview() {
  if (!squarePreviewGfx) return;

  // сцена как у экспорта квадрата
  renderSceneTo(squarePreviewGfx, squarePreviewSize, squarePreviewSize);

  // бейдж сверху (для квадрата safe = весь кадр)
  clearDepthBuffer(squarePreviewGfx);
  drawBadgeOverlayToGfx(squarePreviewGfx, squarePreviewSize, squarePreviewSize);
}

// ========================
// RENDER SCENE (shared by preview + export)
// ========================
function renderSceneTo(gfx, targetW, targetH) {
  const baseW = 640;
  const baseH = 320;

  // COVER framing (same as export)
  const s = Math.max(targetW / baseW, targetH / baseH);

  gfx.background(bgColor);
  gfx.fill(ellipseColor);
  gfx.noStroke();

  gfx.push();

  // ВАЖНО: z не масштабируем
  gfx.scale(s, s, 1);

  gfx.translate(params.posX, params.posY, params.posZ);
  gfx.rotateX(params.rotateXAngle);
  gfx.rotateY(params.rotateYAngle);
  gfx.rotateZ(params.rotateZAngle);
  gfx.shearX(params.skewAngleX);
  gfx.shearY(params.skewAngleY);

  for (let i = 0; i < ellipseX.length; i++) {
    drawSmoothEllipseToGraphics(
      gfx,
      ellipseX[i] - 320,
      ellipseY[i] - 160,
      ellipseW[i],
      ellipseH[i],
      ellipseSkew[i]
    );

    const copies = Math.max(0, Math.floor(params.lineCopies));
    for (let j = 1; j <= copies; j++) {
      const offsetY = j * params.lineSpacing;
      drawSmoothEllipseToGraphics(gfx, ellipseX[i] - 320, ellipseY[i] - 160 - offsetY, ellipseW[i], ellipseH[i], ellipseSkew[i]);
      drawSmoothEllipseToGraphics(gfx, ellipseX[i] - 320, ellipseY[i] - 160 + offsetY, ellipseW[i], ellipseH[i], ellipseSkew[i]);
    }
  }

  gfx.pop();
}

// ========================
// DRAW ELLIPSES HELPERS (for gfx)
// ========================
function drawSmoothEllipseToGraphics(g, x, y, w, h, skew) {
  g.push();
  g.translate(x, y);
  g.shearX(skew);
  g.beginShape();
  const detail = 100;
  for (let t = 0; t < TWO_PI; t += TWO_PI / detail) {
    g.vertex(cos(t) * w * 0.5, sin(t) * h * 0.5);
  }
  g.endShape(CLOSE);
  g.pop();
}

// ========================
// GENERATE ELLIPSES
// ========================
function generateEllipses(preserveRandom = true) {
  const count = Math.max(0, Math.floor(params.ellipseCount));
  const totalEllipses = count + extraLeft + extraRight;

  ellipseX = new Array(totalEllipses);
  ellipseY = new Array(totalEllipses);
  ellipseW = new Array(totalEllipses);
  ellipseH = new Array(totalEllipses);
  ellipseSkew = new Array(totalEllipses);

  if (!preserveRandom || baseHeightNorm.length !== totalEllipses) {
    baseHeightNorm = new Array(totalEllipses);
    baseSkewNorm = new Array(totalEllipses);
    for (let i = 0; i < totalEllipses; i++) {
      baseHeightNorm[i] = random(-0.5, 0.5);
      baseSkewNorm[i] = random(-1, 1);
    }
  }

  const totalWidth = count * params.ellipseWidth + Math.max(0, count - 1) * params.ellipseSpacing;
  const startX = 320 - totalWidth / 2;

  for (let i = 0; i < count; i++) {
    const idx = i + extraLeft;
    ellipseX[idx] = startX + i * (params.ellipseWidth + params.ellipseSpacing);
    ellipseY[idx] = 160 + sin((i + params.waveOffset) * 0.7) * params.waveAmplitude;
    ellipseW[idx] = params.ellipseWidth;
    ellipseH[idx] = params.maxEllipseHeight * (1 + baseHeightNorm[idx] * params.heightRandomness);
    ellipseSkew[idx] = baseSkewNorm[idx] * params.chaos;
  }

  for (let i = 0; i < extraLeft; i++) ellipseX[i] = ellipseY[i] = ellipseW[i] = ellipseH[i] = ellipseSkew[i] = 0;
  for (let i = count + extraLeft; i < totalEllipses; i++) ellipseX[i] = ellipseY[i] = ellipseW[i] = ellipseH[i] = ellipseSkew[i] = 0;
}

// ========================
// LINK SLIDERS
// ========================
function linkSliders() {
  const intKeys = ['ellipseCount','lineCopies'];

  for (const key in params) {
    const el = document.getElementById(key);
    if (!el) continue;

    el.addEventListener('input', e => {
      let raw = e.target.value;
      if (intKeys.includes(key)) params[key] = Math.max(0, parseInt(raw));
      else params[key] = parseFloat(raw);

      // ✅ если меняется высота — lineSpacing пересчитываем автоматически
      if (key === 'maxEllipseHeight') {
        syncLineSpacingToHeight({ updateUI: true });
      }

      generateEllipses(true);
    });

    el.addEventListener('change', e => {
      let raw = e.target.value;
      if (intKeys.includes(key)) params[key] = Math.max(0, parseInt(raw));
      else params[key] = parseFloat(raw);

      if (key === 'maxEllipseHeight') {
        syncLineSpacingToHeight({ updateUI: true });
      }

      generateEllipses(true);
      pushHistory();
    });
  }
}

// ========================
// RANDOM / RESET / COLORS
// ========================
function generateRandom() {
  // ✅ ellipseCount всегда держим на максимуме и НЕ рандомим
  const ellipseCountEl = document.getElementById('ellipseCount');
  if (ellipseCountEl) {
    params.ellipseCount = parseInt(ellipseCountEl.max, 10);
    ellipseCountEl.value = params.ellipseCount;
  } else {
    // fallback если слайдера нет
    params.ellipseCount = params.ellipseCount ?? 60;
  }

  // lineSpacing теперь НЕ рандомим — он зависит от maxEllipseHeight
  for (const key in params) {
    if (['posX','posY','posZ','chaos'].includes(key)) continue;
    if (key === 'lineSpacing') continue;   // ✅ важное
    if (key === 'ellipseCount') continue;  // ✅ важное

    const el = document.getElementById(key);
    if (!el) continue;

    const min = parseFloat(el.min);
    const max = parseFloat(el.max);
    if (isNaN(min) || isNaN(max)) continue;

    const val = random(min, max);
    if (key === 'lineCopies') {
      params[key] = Math.floor(val);
      el.value = params[key];
    } else {
      params[key] = val;
      el.value = val;
    }
  }

  // ✅ синхронизируем spacing от высоты после рандома
  syncLineSpacingToHeight({ updateUI: true });

  setRandomColors();
  generateEllipses(false);
}

function resetParams() {
  params = {
    // ✅ reset тоже ставит максимум ellipseCount
    ellipseCount: parseInt(document.getElementById('ellipseCount')?.max ?? 60, 10),
    skewAngleX: 0,
    skewAngleY: 0,
    maxEllipseHeight: 180,
    heightRandomness: 0.5,
    chaos: 0,
    waveAmplitude: 50,
    waveOffset: random(1000),
    lineCopies: 0,
    lineSpacing: 230,
    ellipseSpacing: -4,
    ellipseWidth: 25,
    rotateXAngle: 0,
    rotateYAngle: 0,
    rotateZAngle: 0,
    posX:0, posY:0, posZ:-200
  };

  syncSlidersFromParams();

  // ✅ важное: после reset подтягиваем lineSpacing под высоту
  syncLineSpacingToHeight({ updateUI: true });

  setRandomColors();
  generateEllipses(false);
}

function setRandomColors() {
  let bgHex = null;
  let ellHex = null;

  for (let i = 0; i < 400; i++) {
    bgHex = randomPaletteHex();
    ellHex = randomPaletteHex();
    if (ellHex === bgHex) continue;
    if (isForbiddenPair(bgHex, ellHex)) continue;
    break;
  }

  if (!bgHex) bgHex = randomPaletteHex();
  if (!ellHex) {
    for (let i = 0; i < 400; i++) {
      const c = randomPaletteHex();
      if (c === bgHex) continue;
      if (!isForbiddenPair(bgHex, c)) { ellHex = c; break; }
    }
    if (!ellHex) ellHex = randomPaletteHex();
  }

  bgColor = color("#" + bgHex);
  ellipseColor = color("#" + ellHex);
  updateColorInputs('bg');
}

function setRandomBgColor() {
  const currentEll = normHex(colorToHex(ellipseColor));
  let bgHex = null;

  for (let i = 0; i < 400; i++) {
    const c = randomPaletteHex();
    if (c === currentEll) continue;
    if (isForbiddenPair(c, currentEll)) continue;
    bgHex = c;
    break;
  }
  if (!bgHex) bgHex = randomPaletteHex();

  bgColor = color("#" + bgHex);
  updateColorInputs('bg');
}

function setRandomEllipseColor() {
  const currentBg = normHex(colorToHex(bgColor));
  let ellHex = null;

  for (let i = 0; i < 400; i++) {
    const c = randomPaletteHex();
    if (c === currentBg) continue;
    if (isForbiddenPair(currentBg, c)) continue;
    ellHex = c;
    break;
  }
  if (!ellHex) ellHex = randomPaletteHex();

  ellipseColor = color("#" + ellHex);
  updateColorInputs('ellipse');
}

// ========================
// PALETTE SWATCHES
// ========================
function createPaletteSwatches() {
  const bgPaletteDiv = document.getElementById('bgPalette');
  const ellipsePaletteDiv = document.getElementById('ellipsePalette');
  if (!bgPaletteDiv || !ellipsePaletteDiv) return;

  bgPaletteDiv.innerHTML = '';
  ellipsePaletteDiv.innerHTML = '';

  paletteColors.forEach(hexColor => {
    const bgSwatch = document.createElement('div');
    bgSwatch.className = 'swatch';
    bgSwatch.style.backgroundColor = '#' + hexColor;
    bgSwatch.addEventListener('click', () => {
      bgColor = color('#'+hexColor);
      updateColorInputs('bg');
      pushHistory();
    });
    bgPaletteDiv.appendChild(bgSwatch);

    const ellSwatch = document.createElement('div');
    ellSwatch.className = 'swatch';
    ellSwatch.style.backgroundColor = '#' + hexColor;
    ellSwatch.addEventListener('click', () => {
      ellipseColor = color('#'+hexColor);
      updateColorInputs('ellipse');
      pushHistory();
    });
    ellipsePaletteDiv.appendChild(ellSwatch);
  });
}

// ========================
// COLOR UTILS
// ========================
function colorToHex(c) {
  if (!c) return '#000000';
  return '#' + hex2(red(c), 2) + hex2(green(c), 2) + hex2(blue(c), 2);
}
function hex2(v, digits) {
  let h = Math.floor(v).toString(16);
  while (h.length < digits) h = '0' + h;
  return h;
}
function normHexHash(c) {
  if (!c) return "#000000";
  const s = String(c).trim();
  return s.startsWith("#") ? s : ("#" + s);
}

// ========================
// HISTORY
// ========================
function snapshotState() {
  return {
    params: JSON.parse(JSON.stringify(params)),
    bgHex: colorToHex(bgColor),
    ellipseHex: colorToHex(ellipseColor),
    baseHeightNorm: baseHeightNorm.slice(),
    baseSkewNorm: baseSkewNorm.slice()
  };
}

function pushHistory(initial = false) {
  if (suppressHistory && !initial) return;
  if (historyIndex < historyStack.length - 1) historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(snapshotState());
  if (historyStack.length > HISTORY_LIMIT) historyStack.shift();
  historyIndex = historyStack.length - 1;
}

function undoHistory() {
  if (historyIndex <= 0) return;
  historyIndex--;
  const state = historyStack[historyIndex];
  if (state) restoreState(state);
}

function restoreState(state) {
  suppressHistory = true;
  params = JSON.parse(JSON.stringify(state.params));
  syncSlidersFromParams();
  bgColor = color(state.bgHex);
  ellipseColor = color(state.ellipseHex);
  baseHeightNorm = state.baseHeightNorm.slice();
  baseSkewNorm = state.baseSkewNorm.slice();

  // ✅ при восстановлении тоже приводим spacing к высоте
  syncLineSpacingToHeight({ updateUI: true });

  generateEllipses(true);
  updateColorInputs('bg');
  suppressHistory = false;
}

// ========================
// WEBGL DEPTH HELPERS (gfx only)
// ========================
function disableDepthTest(gfx) {
  const gl = gfx?._renderer?.GL;
  if (gl) gl.disable(gl.DEPTH_TEST);
}
function enableDepthTest(gfx) {
  const gl = gfx?._renderer?.GL;
  if (gl) gl.enable(gl.DEPTH_TEST);
}
function clearDepthBuffer(gfx) {
  const gl = gfx?._renderer?.GL;
  if (gl) gl.clear(gl.DEPTH_BUFFER_BIT);
}

// ========================
// SAFE-SQUARE (for ~2:1 exports like 640x320)
// ========================
function getSafeRect(w, h) {
  const ar = w / h;
  const isBanner = (w > h) && Math.abs(ar - 2) < 0.07;
  if (isBanner) {
    const s = h;
    return { x: (w - s) * 0.5, y: 0, w: s, h: s };
  }
  return { x: 0, y: 0, w, h };
}

// ========================
// BADGE OVERLAY
// ========================
function drawBadgeOverlayToGfx(gfx, exportW, exportH) {
  if (!logoImg) return;
  if (exportShowPlaque && !plaqueImg) return;

  const bg = normHexHash(colorToHex(bgColor));
  const el = normHexHash(colorToHex(ellipseColor));
  const logoTint = exportShowPlaque ? el : bg;

  const safe = getSafeRect(exportW, exportH);
  const margin = safe.w * 0.06;

  const badgeH = safe.w * 0.12;

  let plaqueW = 0, plaqueH = 0;
  if (exportShowPlaque) {
    const plaqueScale = badgeH / plaqueImg.height;
    plaqueW = plaqueImg.width * plaqueScale;
    plaqueH = plaqueImg.height * plaqueScale;
  } else {
    plaqueH = badgeH;
  }

  const logoH = exportShowPlaque
    ? Math.min(safe.w * 0.095, plaqueH * 0.9)
    : (safe.w * 0.095);

  const logoScale = logoH / logoImg.height;
  const logoW = logoImg.width * logoScale;

  if (!exportShowPlaque) {
    plaqueW = logoW * 1.25;
    plaqueH = logoH * 1.25;
  }

  const x = safe.x + safe.w - margin - plaqueW;
  const y = safe.y + margin;

  const logoX = x + (plaqueW - logoW) * 0.5;
  const logoY = y + (plaqueH - logoH) * 0.5;

  gfx.push();
  gfx.resetMatrix();
  gfx.translate(-exportW / 2, -exportH / 2);

  disableDepthTest(gfx);

  if (exportShowPlaque) {
    gfx.tint(bg);
    gfx.image(plaqueImg, x, y, plaqueW, plaqueH);
  }

  gfx.tint(logoTint);
  gfx.image(logoImg, logoX, logoY, logoW, logoH);

  gfx.noTint();
  enableDepthTest(gfx);

  gfx.pop();
}

// ========================
// SAVE (COVER + SAME FRAMING, FIX RETINA)
// ========================
function saveHighRes(targetW, targetH) {
  // для 640x320 обычно лучше 2x (3x часто уже начинает "мылить" из-за фильтрации)
  let ss = 1;
  const maxSide = Math.max(targetW, targetH);
  if (maxSide <= 800) ss = 2;
  else if (maxSide <= 1400) ss = 2;
  else ss = 1;

  const renderW = Math.round(targetW * ss);
  const renderH = Math.round(targetH * ss);

  const gfx = createGraphics(renderW, renderH, WEBGL);
  gfx.pixelDensity(1);
  gfx.noStroke();
  gfx.smooth();
  gfx.setAttributes?.('antialias', true);

  // подсказка функции рисования, что сейчас мы в hi-res
  gfx.__ss = ss;

  renderSceneTo(gfx, renderW, renderH);
  clearDepthBuffer(gfx);
  drawBadgeOverlayToGfx(gfx, renderW, renderH);

  // 2D canvas для финального размера
  const down = createGraphics(targetW, targetH);
  down.pixelDensity(1);

  const ctx = down.drawingContext;
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // ВАЖНО: drawImage по canvas-канвасу WEBGL графики
  ctx.drawImage(gfx.canvas, 0, 0, targetW, targetH);

  const img = down.get();
  save(img, `playlist_${targetW}x${targetH}.png`);

  gfx.remove();
  down.remove();
}