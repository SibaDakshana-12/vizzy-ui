let currentMode = 'home';
let genCount = 3;
let isTyping = false;
let isRecording = false;
let activeChatIndex = 0;

const chatList = [
  'Portrait idea',
  'Moodboard',
  'Story visuals',
  'Poster concept'
];

window.onload = () => {
  showEmptyState();
  setupDragDrop();
};

function showEmptyState() {
  const msgs = document.getElementById('messages');

  msgs.innerHTML = `
    <div class="empty-state">
      <div class="empty-title">Start with a feeling</div>
      <div class="empty-sub">Type something, upload an image, or try one below.</div>

      <div class="quick-prompts">
        <div class="qp" onclick="quickPrompt(this)">Paint how my year felt</div>
        <div class="qp" onclick="quickPrompt(this)">Turn photo into art</div>
        <div class="qp" onclick="quickPrompt(this)">Make a vision board</div>
        <div class="qp" onclick="quickPrompt(this)">Kids storybook idea</div>
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
  showTyping();
  callBackend(msg);
}

function callBackend(prompt) {
  fetch("https://vizzy-ui.onrender.com/generate", {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        prompt: prompt,
        style: getSelectedStyle(),
        tone: getSelectedTone(),
        count: genCount,
        mode: currentMode
    })
    })
    .then(res => {
      if (!res.ok) throw new Error("Backend returned an error");
      return res.json();
    })
    .then(data => {
    removeTyping();
    addAIResponseFromAPI(data);
    })
    .catch(err => {
    removeTyping();
    console.error(err);
    addErrorMessage();
    });
}

function addUserMessage(text) {
  const msgs = document.getElementById('messages');

  msgs.innerHTML += `
    <div class="msg-row user">
      <div class="bubble user">${escapeHtml(text)}</div>
    </div>
  `;
  scrollBottom();
}

function addAIResponseFromAPI(data) {
  const msgs = document.getElementById('messages');

  let imagesHTML = '';
  data.images.forEach(img => {
    imagesHTML += `
      <div class="art-card" onclick="openImage(this)">
        <img src="${img.url}" />
      </div>
    `;
  });

  msgs.innerHTML += `
    <div class="msg-row">
      <div class="bubble ai">
        ${escapeHtml(data.message)}
        <div class="img-grid ${getGridClass()}">
          ${imagesHTML}
        </div>
      </div>
    </div>
  `;
  scrollBottom();
}

function addErrorMessage() {
  const msgs = document.getElementById('messages');

  msgs.innerHTML += `
    <div class="msg-row">
      <div class="bubble ai">
        Something went wrong reaching the server. Make sure the backend is running and try again.
      </div>
    </div>
  `;
  scrollBottom();
}

function getSelectedStyle() {
  const el = document.querySelector('.style-chip.active');
  return el ? el.textContent : "default";
}

function getSelectedTone() {
  const el = document.querySelector('.tone-btn.active');
  return el ? el.textContent : "neutral";
}

function getGridClass() {
  if (genCount <= 1) return 'cols-1';
  if (genCount === 2) return 'cols-2';
  if (genCount >= 4) return 'cols-4';
  return 'cols-3';
}

function showTyping() {
  isTyping = true;
  const msgs = document.getElementById('messages');

  msgs.innerHTML += `
    <div class="msg-row" id="typing">
      <div class="bubble ai">
        <div class="typing"><span></span><span></span><span></span></div>
      </div>
    </div>
  `;
  scrollBottom();
}

function removeTyping() {
  const el = document.getElementById('typing');
  if (el) el.remove();
  isTyping = false;
}

function quickPrompt(el) {
  sendMessage(el.textContent);
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
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
}

function newChat() {
  showEmptyState();
  document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
}

function loadChat(index, el) {
  activeChatIndex = index;
  document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
  if (el) el.classList.add('active');

  document.getElementById('topbarTitle').textContent = chatList[index] || 'My Workspace';
  showEmptyState();
}

function filterPill(el, type) {
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  console.log('Filter selected:', type);
}

function togglePanel() {
  document.getElementById('stylePanel').classList.toggle('open');
}

function selectStyle(el) {
  document.querySelectorAll('.style-chip').forEach(chip => chip.classList.remove('active'));
  el.classList.add('active');
}

function selectTone(el) {
  document.querySelectorAll('.tone-btn').forEach(btn => btn.classList.remove('active'));
  el.classList.add('active');
}

function changeCount(delta) {
  genCount = genCount + delta;
  if (genCount < 1) genCount = 1;
  if (genCount > 4) genCount = 4;
  document.getElementById('countVal').textContent = genCount;
}

function updateMood(value) {
  console.log('Mood value:', value);
}

function toggleMic(el) {
  isRecording = !isRecording;
  el.classList.toggle('active', isRecording);
  el.textContent = isRecording ? 'Stop' : 'Mic';
}

function triggerUpload() {
  document.getElementById('fileInput').click();
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  sendMessage(`Uploaded an image: ${file.name}`);
  event.target.value = '';
}

function insertHint(el) {
  const input = document.getElementById('mainInput');
  input.value = input.value ? input.value + ' ' + el.textContent : el.textContent;
  input.focus();
  autoResize(input);
}

function openImage(el) {
  const overlay = document.createElement('div');

  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.9)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '200';

  const img = el.querySelector('img').cloneNode();

  img.style.maxWidth = '80%';
  img.style.maxHeight = '80%';
  img.style.borderRadius = '10px';

  overlay.appendChild(img);
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

function scrollBottom() {
  const msgs = document.getElementById('messages');
  msgs.scrollTop = msgs.scrollHeight;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setupDragDrop() {
  const overlay = document.getElementById('dragOverlay');
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    overlay.classList.add('show');
  });

  document.addEventListener('dragleave', () => {
    overlay.classList.remove('show');
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    overlay.classList.remove('show');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    sendMessage(`Uploaded an image: ${file.name}`);
  });
}
