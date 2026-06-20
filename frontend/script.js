let currentMode = 'home';
let genCount = 3;
let isTyping = false;
let isRecording = false;
let activeChatIndex = 0;
let conversationHistory = [];

const chatList = ['Portrait idea', 'Moodboard', 'Story visuals', 'Poster concept'];
const chatHistories = { 0: [], 1: [], 2: [], 3: [] };
const chatDOMs = { 0: '', 1: '', 2: '', 3: '' };

window.onload = () => {
  showEmptyState();
  setupDragDrop();
};

function showEmptyState() {
  const msgs = document.getElementById('messages');

  const homePrompts = [
    'Paint how my year felt',
    'Make a vision board',
    'Kids storybook about dragons',
    'Turn a poem into a visual',
    'Show my inner emotional landscape',
  ];

  const bizPrompts = [
    'Create a premium product visual',
    'Design seasonal evening ambiance',
    'Sale poster that feels upscale',
    'Brand-themed artwork with our values',
    'Memento for an anniversary couple',
  ];

  const prompts = currentMode === 'biz' ? bizPrompts : homePrompts;

  msgs.innerHTML = `
    <div class="empty-state">
      <div class="empty-title">${currentMode === 'biz' ? 'Your creative co-pilot' : 'Start with a feeling'}</div>
      <div class="empty-sub">${currentMode === 'biz' ? 'Describe what you need for your business.' : 'Type something, upload an image, or try one below.'}</div>
      <div class="quick-prompts">
        ${prompts.map(p => `<div class="qp" onclick="quickPrompt(this)">${p}</div>`).join('')}
      </div>
    </div>
  `;
}

function sendMessage(text) {
  const input = document.getElementById('mainInput');
  const msg = text || input.value.trim();
  if (!msg || isTyping) return;

  input.value = '';
  input.style.height = 'auto';

  const msgs = document.getElementById('messages');
  if (msgs.querySelector('.empty-state')) msgs.innerHTML = '';

  addUserMessage(msg);
  conversationHistory.push({ role: 'user', content: msg });

  showTyping();
  callBackend(msg);
}

function callBackend(prompt) {
  const historyToSend = conversationHistory.slice(0, -1);

  fetch("http://localhost:5000/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      style: getSelectedStyle(),
      tone: getSelectedTone(),
      count: genCount,
      mode: currentMode,
      history: historyToSend
    })
  })
    .then(res => { if (!res.ok) throw new Error("Backend error"); return res.json(); })
    .then(data => { removeTyping(); handleResponse(data); })
    .catch(err => { removeTyping(); console.error(err); addErrorMessage(); });
}

function handleResponse(data) {
  conversationHistory.push({ role: 'assistant', content: data.message });

  if (data.type === 'question') {
    addQuestionBubble(data.message);
  } else if (data.type === 'story') {
    addStoryResponse(data);
  } else if (data.type === 'poster') {
    addPosterResponse(data);
  } else {
    addImageResponse(data);
  }
}

function addQuestionBubble(text) {
  const msgs = document.getElementById('messages');
  msgs.innerHTML += `
    <div class="msg-row">
      <div class="bubble ai question-bubble">
        <div class="question-icon">✦</div>
        <div class="question-text">${escapeHtml(text)}</div>
      </div>
    </div>`;
  scrollBottom();
}

function addImageResponse(data) {
  const msgs = document.getElementById('messages');
  const gridClass = getGridClass();
  const isMoodboard = data.pathway === 'moodboard';
  const gridId = 'grid-' + Date.now();

  const div = document.createElement('div');
  div.className = 'msg-row';
  div.innerHTML = `
    <div class="bubble ai ${isMoodboard ? 'moodboard-bubble' : ''}">
      <div class="ai-reply-text">${escapeHtml(data.message)}</div>
      <div class="img-grid ${gridClass}" id="${gridId}"></div>
      <div class="action-strip">
        <button class="act-btn" onclick="refineThis(this)">✦ Refine</button>
        <button class="act-btn" onclick="moreOfThis()">↺ More like this</button>
        <button class="act-btn" onclick="downloadAll(this)">↓ Save all</button>
      </div>
    </div>`;
  msgs.appendChild(div);

  const grid = document.getElementById(gridId);
  loadImagesIntoGrid(grid, data.images);
  scrollBottom();
}

function addStoryResponse(data) {
  const msgs = document.getElementById('messages');

  const sceneTitles = data.scenes && data.scenes.length
    ? `<div class="story-chapters">${data.scenes.map((s, i) =>
        `<div class="chapter-pill">Scene ${i + 1}: ${escapeHtml(s)}</div>`
      ).join('')}</div>`
    : '';

  const storyId = 'story-' + Date.now();

  const div = document.createElement('div');
  div.className = 'msg-row';
  div.innerHTML = `
      <div class="bubble ai story-bubble">
        <div class="ai-reply-text">${escapeHtml(data.message)}</div>
        ${sceneTitles}
        <div class="story-grid" id="${storyId}"></div>
        <div class="action-strip">
          <button class="act-btn" onclick="moreOfThis()">↺ Add more scenes</button>
          <button class="act-btn" onclick="refineThis(this)">✦ Change style</button>
        </div>
      </div>`;
  msgs.appendChild(div);

  const grid = document.getElementById(storyId);
  loadStoryImages(grid, data.images);
  scrollBottom();
}

function loadStoryImages(grid, images) {
  images.forEach((img, i) => {
    setTimeout(() => {
      const scene = document.createElement('div');
      scene.className = 'story-scene';

      const caption = img.caption
        ? `<div class="scene-caption">${escapeHtml(img.caption)}</div>`
        : '';

      scene.innerHTML = `<div class="img-shimmer"></div>${caption}`;
      grid.appendChild(scene);

      loadImageWithRetry(scene, img.url, 0);
      scrollBottom();
    }, i * 4000);
  });
}

function addPosterResponse(data) {
  const msgs = document.getElementById('messages');
  const headline = data.headline || '';
  const subtext  = data.subtext  || '';

  const posterId = 'poster-' + Date.now();

  const div = document.createElement('div');
  div.className = 'msg-row';
  div.innerHTML = `
      <div class="bubble ai poster-bubble">
        <div class="ai-reply-text">${escapeHtml(data.message)}</div>
        <div class="poster-preview">
          <div class="poster-img-wrap" id="${posterId}">
            <div class="img-shimmer"></div>
            ${headline ? `<div class="poster-overlay">
              <div class="poster-headline">${escapeHtml(headline)}</div>
              ${subtext ? `<div class="poster-subtext">${escapeHtml(subtext)}</div>` : ''}
            </div>` : ''}
          </div>
        </div>
        <div class="action-strip">
          <button class="act-btn" onclick="refineThis(this)">✦ Refine copy</button>
          <button class="act-btn" onclick="moreOfThis()">↺ Try another look</button>
          <button class="act-btn" onclick="downloadAll(this)">↓ Save</button>
        </div>
      </div>`;
  msgs.appendChild(div);

  const wrap = document.getElementById(posterId);
  if (data.images && data.images[0]) {
    loadImageWithRetry(wrap, data.images[0].url, 0);
  }
  scrollBottom();
}

function loadImagesIntoGrid(grid, images) {
  images.forEach((img, i) => {
    setTimeout(() => {
      const card = document.createElement('div');
      card.className = 'art-card';
      card.innerHTML = '<div class="img-shimmer"></div>';
      card.onclick = () => openLightbox(card);
      grid.appendChild(card);
      loadImageWithRetry(card, img.url, 0);
      scrollBottom();
    }, i * 5000);
  });
}

async function loadImageWithRetry(container, url, attempt) {
  const maxAttempts = 5;
  try {
    const separator = url.includes('?') ? '&' : '?';
    const res = await fetch(url + separator + 'retry=' + attempt);

    if (!res.ok) throw new Error('Image request failed: ' + res.status);

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    const imgEl = document.createElement('img');
    imgEl.src = objectUrl;

    const shimmer = container.querySelector('.img-shimmer');
    if (shimmer) shimmer.replaceWith(imgEl);
    else { container.innerHTML = ''; container.appendChild(imgEl); }
    scrollBottom();

  } catch (err) {
    if (attempt < maxAttempts - 1) {
      const delay = 4000 * Math.pow(2, attempt);
      setTimeout(() => loadImageWithRetry(container, url, attempt + 1), delay);
    } else {
      const shimmer = container.querySelector('.img-shimmer');
      if (shimmer) shimmer.outerHTML = '<div class="img-fail">Unavailable</div>';
      else container.innerHTML = '<div class="img-fail">Unavailable</div>';
    }
  }
}

function refineThis(btn) {
  const input = document.getElementById('mainInput');
  input.value = 'Refine this — make it ';
  input.focus();
  autoResize(input);
}

function moreOfThis() {
  sendMessage('Generate more variations of the same idea');
}

function downloadAll(btn) {
  const bubble = btn.closest('.bubble');
  const imgs   = bubble ? bubble.querySelectorAll('img') : [];
  imgs.forEach((img, i) => {
    const a  = document.createElement('a');
    a.href   = img.src;
    a.download = `vizzy-${Date.now()}-${i}.jpg`;
    a.click();
  });
}

function openLightbox(card) {
  const img = card.querySelector('img');
  if (!img) return;

  const overlay = document.createElement('div');
  overlay.className = 'lightbox';

  const clone = img.cloneNode();
  clone.style.cssText = 'max-width:85vw;max-height:85vh;border-radius:12px;';

  const dlBtn = document.createElement('button');
  dlBtn.className = 'lightbox-dl';
  dlBtn.textContent = '↓ Save';
  dlBtn.onclick = (e) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = img.src;
    a.download = `vizzy-${Date.now()}.jpg`;
    a.click();
  };

  overlay.appendChild(clone);
  overlay.appendChild(dlBtn);
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

function addErrorMessage() {
  document.getElementById('messages').innerHTML += `
    <div class="msg-row">
      <div class="bubble ai">
        Something went wrong reaching the server. Check the backend is running and try again.
      </div>
    </div>`;
  scrollBottom();
}

function addUserMessage(text) {
  document.getElementById('messages').innerHTML += `
    <div class="msg-row user">
      <div class="bubble user">${escapeHtml(text)}</div>
    </div>`;
  scrollBottom();
}

function showTyping() {
  isTyping = true;
  document.getElementById('messages').innerHTML += `
    <div class="msg-row" id="typing">
      <div class="bubble ai">
        <div class="typing"><span></span><span></span><span></span></div>
      </div>
    </div>`;
  scrollBottom();
}

function removeTyping() {
  document.getElementById('typing')?.remove();
  isTyping = false;
}

function getSelectedStyle() {
  return document.querySelector('.style-chip.active')?.textContent.trim() || 'default';
}
function getSelectedTone() {
  return document.querySelector('.tone-btn.active')?.textContent.trim() || 'neutral';
}
function getGridClass() {
  if (genCount <= 1) return 'cols-1';
  if (genCount === 2) return 'cols-2';
  if (genCount >= 4) return 'cols-4';
  return 'cols-3';
}
function scrollBottom() {
  const msgs = document.getElementById('messages');
  msgs.scrollTop = msgs.scrollHeight;
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function setMode(mode) {
  currentMode = mode;
  document.getElementById('modeHome').classList.toggle('active', mode === 'home');
  document.getElementById('modeBiz').classList.toggle('active', mode === 'biz');
  document.getElementById('topbarTitle').textContent =
    mode === 'home' ? 'Personal Canvas' : 'Business Studio';
  showEmptyState();
}

function newChat() {
  chatHistories[activeChatIndex] = [...conversationHistory];
  chatDOMs[activeChatIndex] = document.getElementById('messages').innerHTML;
  conversationHistory = [];
  showEmptyState();
  document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
}

function loadChat(index, el) {
  chatHistories[activeChatIndex] = [...conversationHistory];
  chatDOMs[activeChatIndex] = document.getElementById('messages').innerHTML;

  activeChatIndex = index;
  document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');

  document.getElementById('topbarTitle').textContent = chatList[index] || 'My Workspace';
  conversationHistory = chatHistories[index] ? [...chatHistories[index]] : [];

  const msgs = document.getElementById('messages');
  msgs.innerHTML = chatDOMs[index] || '';
  if (!msgs.innerHTML.trim()) showEmptyState();
}

function filterPill(el, type) {
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
}
function togglePanel() {
  document.getElementById('stylePanel').classList.toggle('open');
}
function selectStyle(el) {
  document.querySelectorAll('.style-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}
function selectTone(el) {
  document.querySelectorAll('.tone-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}
function changeCount(delta) {
  genCount = Math.min(4, Math.max(1, genCount + delta));
  document.getElementById('countVal').textContent = genCount;
}
function updateMood(value) { /* could feed into tone later */ }
function quickPrompt(el) { sendMessage(el.textContent.trim()); }
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}
function insertHint(el) {
  const input = document.getElementById('mainInput');
  input.value = input.value ? input.value + ' ' + el.textContent : el.textContent;
  input.focus(); autoResize(input);
}
function toggleMic(el) {
  isRecording = !isRecording;
  el.classList.toggle('active', isRecording);
  el.textContent = isRecording ? 'Stop' : 'Mic';
}
function triggerUpload() { document.getElementById('fileInput').click(); }
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  sendMessage(`Transform this image: ${file.name}`);
  event.target.value = '';
}

function setupDragDrop() {
  const overlay = document.getElementById('dragOverlay');
  document.addEventListener('dragover',  e => { e.preventDefault(); overlay.classList.add('show'); });
  document.addEventListener('dragleave', ()  => overlay.classList.remove('show'));
  document.addEventListener('drop', e => {
    e.preventDefault(); overlay.classList.remove('show');
    const file = e.dataTransfer.files[0];
    if (file) sendMessage(`Transform this image: ${file.name}`);
  });
}

