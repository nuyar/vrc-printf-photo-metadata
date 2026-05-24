import { parseVrcPhotoMetadata } from './lib/vrc-photo-metadata.js';
import { fetchWorld } from './lib/vrc-fetch-info.js';

// ── UI Texts & Presets (for future i18n) ──
const UI_TEXT = {
  copy: '복사',
  copied: '복사됨',
  customPreset: '직접 입력',
  errorPrefix: '오류: '
};

const PRESETS_DATA = [
  { label: 'Emojis', value: '🌐 {worldName} by {worldAuthor}\n📷 {author}\n\n#VRChat #VRChatPhotography' },
  { label: '한글', value: '월드: {worldName} by {worldAuthor}\n사진: {author}\n\n#VRChat #VRChatPhotography' },
  { label: 'English', value: 'World: {worldName} by {worldAuthor}\nPhoto: {author}\n\n#VRChat #VRChatPhotography' },
  { label: 'Details', value: 'World: {worldName} by {worldAuthor}\n{worldUrl}\nPhoto: {author}\n{authorUrl}\nDate: {YYYY}-{MM}-{DD}\n\n#VRChat #VRChatPhotography' },
];

const dummyMeta = {
  worldName: '화본역',
  worldId: 'wrld_93d114b8-8993-4b70-a1e9-5e4e98258e83',
  author: 'nuyar',
  authorId: 'usr_1ff5e386-444c-4aaf-82ee-52f4152deb68',
  date: new Date().toISOString(),
  width: 1920,
  height: 1080,
  worldAuthor: 'Bepsi Train',
  worldAuthorId: 'usr_bea09c1a-3d65-4eba-b5e0-59883986da81',
};

// ── Elements ──
const presetSelect = document.getElementById('presetSelect');
const formatInput = document.getElementById('formatInput');
const formatPreview = document.getElementById('formatPreview');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const resultDiv = document.getElementById('result');
const resultThumb = document.getElementById('resultThumb');
const resultText = document.getElementById('resultText');
const resultCopy = document.getElementById('resultCopy');
const historySection = document.getElementById('historySection');
const historyList = document.getElementById('historyList');

const history = [];

// ── Initialize Presets ──
PRESETS_DATA.forEach(preset => {
  const opt = document.createElement('option');
  opt.value = preset.value;
  opt.textContent = preset.label;
  presetSelect.appendChild(opt);
});
const customOpt = document.createElement('option');
customOpt.value = '__custom__';
customOpt.textContent = UI_TEXT.customPreset;
presetSelect.appendChild(customOpt);

// ── Format Engine ──

/**
 * 포맷 문자열에 메타데이터 값을 치환.
 */
function applyFormat(fmt, meta) {
  let result = fmt;

  const d = meta.date ? new Date(meta.date) : null;
  const pad = (n) => String(n).padStart(2, '0');
  const isValidDate = d && !isNaN(d.getTime());

  // 단순 변수 치환
  const vars = {
    worldName: meta.worldName || '',
    worldId: meta.worldId || '',
    worldUrl: meta.worldId ? `https://vrchat.com/home/world/${meta.worldId}` : '',
    worldAuthor: meta.worldAuthor || '',
    worldAuthorId: meta.worldAuthorId || '',
    worldAuthorUrl: meta.worldAuthorId ? `https://vrchat.com/home/user/${meta.worldAuthorId}` : '',
    author: meta.author || '',
    authorId: meta.authorId || '',
    authorUrl: meta.authorId ? `https://vrchat.com/home/user/${meta.authorId}` : '',
    date: meta.date || '',
    width: meta.width || '',
    height: meta.height || '',
    YYYY: isValidDate ? String(d.getFullYear()) : '',
    MM: isValidDate ? pad(d.getMonth() + 1) : '',
    DD: isValidDate ? pad(d.getDate()) : '',
    HH: isValidDate ? pad(d.getHours()) : '',
    mm: isValidDate ? pad(d.getMinutes()) : '',
    ss: isValidDate ? pad(d.getSeconds()) : '',
  };

  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }

  // \n → 실제 개행
  result = result.replaceAll('\\n', '\n');

  return result;
}

function updatePreview() {
  formatPreview.textContent = applyFormat(formatInput.value, dummyMeta);
}

// ── URL 파라미터 ──

function matchPreset(fmt) {
  let matched = false;
  for (const opt of presetSelect.options) {
    if (opt.value === fmt) {
      presetSelect.value = fmt;
      matched = true;
      break;
    }
  }
  if (!matched) {
    presetSelect.value = '__custom__';
  }
}

function loadFormatFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const fmt = params.get('fmt');
  if (fmt) {
    formatInput.value = fmt;
    matchPreset(fmt);
  } else if (presetSelect.options.length > 0) {
    presetSelect.selectedIndex = 0;
    formatInput.value = presetSelect.value;
  }
}

function saveFormatToUrl(fmt) {
  const url = new URL(window.location);
  url.searchParams.set('fmt', fmt);
  window.history.replaceState({}, '', url);
}

// ── Preset / Format 연동 ──

presetSelect.addEventListener('change', () => {
  if (presetSelect.value !== '__custom__') {
    formatInput.value = presetSelect.value;
    saveFormatToUrl(presetSelect.value);
    reapplyFormat();
  }
});

formatInput.addEventListener('input', () => {
  matchPreset(formatInput.value);
  saveFormatToUrl(formatInput.value);
  reapplyFormat();
});

// ── 포맷 재적용 (History 포함) ──

function reapplyFormat() {
  const fmt = formatInput.value;
  updatePreview();

  // 현재 결과
  if (history.length > 0) {
    const latest = history[0];
    resultText.textContent = applyFormat(fmt, latest.meta);
  }

  // History 재렌더
  renderHistory();
}

// ── 썸네일 생성 ──

function createThumbnail(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 160;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // 중앙 크롭
      const srcSize = Math.min(img.width, img.height);
      const sx = (img.width - srcSize) / 2;
      const sy = (img.height - srcSize) / 2;
      ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size);

      const thumbUrl = canvas.toDataURL('image/jpeg', 0.7);
      URL.revokeObjectURL(url);
      resolve(thumbUrl);
    };
    img.src = url;
  });
}

// ── 파일 처리 ──

async function processFile(file) {
  if (!file.type.startsWith('image/')) return;

  const meta = await parseVrcPhotoMetadata(file);
  const thumbUrl = await createThumbnail(file);

  if (meta.error) {
    resultDiv.style.display = 'block';
    resultThumb.src = thumbUrl;
    resultText.innerHTML = '';
    const errEl = document.createElement('div');
    errEl.className = 'result-error';
    errEl.textContent = `${UI_TEXT.errorPrefix}${meta.error}${meta.message ? ' — ' + meta.message : ''}`;
    resultText.appendChild(errEl);
    resultCopy.style.display = 'none';
    return;
  }

  // 월드 추가 정보 페치
  if (meta.worldId) {
    try {
      const worldData = await fetchWorld(meta.worldId);
      if (worldData) {
        meta.worldAuthor = worldData.authorName;
        meta.worldAuthorId = worldData.authorId;
      }
    } catch (e) {
      console.warn("Failed to fetch additional world info:", e);
    }
  }

  const formatted = applyFormat(formatInput.value, meta);

  // 결과 표시
  resultDiv.style.display = 'block';
  resultThumb.src = thumbUrl;
  resultText.textContent = formatted;
  resultCopy.style.display = '';
  resultCopy.textContent = UI_TEXT.copy;
  resultCopy.classList.remove('copied');

  // History에 추가 (최신이 위)
  history.unshift({ meta, thumbUrl, fileName: file.name });
  renderHistory();
}

async function processFiles(files) {
  for (const file of files) {
    await processFile(file);
  }
}

// ── History 렌더링 ──

function renderHistory() {
  if (history.length <= 1) {
    historySection.style.display = 'none';
    return;
  }
  historySection.style.display = '';
  historyList.innerHTML = '';

  const fmt = formatInput.value;

  // 최신(index 0)은 결과에 표시되므로, index 1부터 history에 표시
  for (let i = 1; i < history.length; i++) {
    const entry = history[i];
    const formatted = applyFormat(fmt, entry.meta);

    const item = document.createElement('div');
    item.className = 'history-item';

    const thumb = document.createElement('img');
    thumb.className = 'result-thumb';
    thumb.src = entry.thumbUrl;

    const body = document.createElement('div');
    body.className = 'result-body';

    const text = document.createElement('div');
    text.className = 'result-text';
    text.textContent = formatted;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-copy';
    copyBtn.textContent = UI_TEXT.copy;
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(formatted).then(() => {
        copyBtn.textContent = UI_TEXT.copied;
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = UI_TEXT.copy;
          copyBtn.classList.remove('copied');
        }, 1500);
      });
    });

    body.appendChild(text);
    body.appendChild(copyBtn);
    item.appendChild(thumb);
    item.appendChild(body);
    historyList.appendChild(item);
  }
}

// ── 드래그앤드롭 ──

dropzone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) {
    processFiles(fileInput.files);
    fileInput.value = '';
  }
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  if (!e.relatedTarget || e.relatedTarget.nodeName === "HTML") {
    dropzone.classList.remove('dragover');
  }
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    processFiles(e.dataTransfer.files);
  }
});

// ── Copy 버튼 ──

resultCopy.addEventListener('click', () => {
  const text = resultText.textContent;
  navigator.clipboard.writeText(text).then(() => {
    resultCopy.textContent = UI_TEXT.copied;
    resultCopy.classList.add('copied');
    setTimeout(() => {
      resultCopy.textContent = UI_TEXT.copy;
      resultCopy.classList.remove('copied');
    }, 1500);
  });
});

// ── Init ──
loadFormatFromUrl();
updatePreview();
