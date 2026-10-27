import { api } from "./api.js";
import { MicStreamer } from "./recorder.js";

const $ = (id) => document.getElementById(id);

const els = {
  engine: $("engine"),
  micBtn: $("micBtn"),
  micRing: $("micRing"),
  micLabel: $("micLabel"),
  timer: $("timer"),
  status: $("status"),
  liveText: $("liveText"),
  saveBar: $("saveBar"),
  titleInput: $("titleInput"),
  saveBtn: $("saveBtn"),
  discardBtn: $("discardBtn"),
  search: $("search"),
  list: $("list"),
  empty: $("empty"),
  count: $("count"),
  prevBtn: $("prevBtn"),
  nextBtn: $("nextBtn"),
  pageInfo: $("pageInfo"),
  editDialog: $("editDialog"),
  editForm: $("editForm"),
  editTitle: $("editTitle"),
  editText: $("editText"),
  cancelEdit: $("cancelEdit"),
  toast: $("toast"),
  template: $("itemTemplate"),
};

const PAGE_SIZE = 10;

const state = {
  recording: false,
  ws: null,
  mic: null,
  startedAt: 0,
  timerId: null,
  last: null, // { text, engine, duration } from the most recent recording
  page: 0,
  total: 0,
  query: "",
  items: [],
  editingId: null,
  audio: null,
};

// ---------- helpers ----------

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle("error", isError);
}

let toastTimer;
function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), 2600);
}

function detectLanguage(text) {
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasDevanagari && hasLatin) return "Hindi + English";
  if (hasDevanagari) return "Hindi";
  return "English";
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function wsUrl() {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws/transcribe`;
}

// ---------- recording ----------

function setRecordingUI(on) {
  state.recording = on;
  els.micBtn.classList.toggle("is-recording", on);
  els.micBtn.setAttribute("aria-pressed", String(on));
  els.micLabel.textContent = on ? "Stop recording" : "Start recording";
  if (!on) els.micRing.style.transform = "scale(1)";
}

function startTimer() {
  state.startedAt = performance.now();
  els.timer.textContent = "0:00";
  state.timerId = setInterval(() => {
    els.timer.textContent = formatTime((performance.now() - state.startedAt) / 1000);
  }, 250);
}

function stopTimer() {
  clearInterval(state.timerId);
  state.timerId = null;
}

function openSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl());
    ws.binaryType = "arraybuffer";
    let settled = false;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "ready" && !settled) {
        settled = true;
        resolve(ws);
      } else if (msg.type === "error" && !settled) {
        settled = true;
        reject(new Error(msg.message));
      } else {
        handleServerMessage(msg);
      }
    };
    ws.onerror = () => {
      if (!settled) {
        settled = true;
        reject(new Error("Could not connect to the transcription server"));
      }
    };
    ws.onclose = () => {
      if (state.recording) {
        stopRecording({ sendStop: false });
        setStatus("Connection closed by server", true);
      }
    };
  });
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case "partial":
      els.liveText.value = msg.text;
      els.liveText.scrollTop = els.liveText.scrollHeight;
      break;
    case "final":
      els.liveText.value = msg.text;
      state.last = { text: msg.text, engine: msg.engine, duration: msg.duration };
      els.micBtn.disabled = false;
      if (msg.text) {
        els.liveText.readOnly = false; // allow quick fixes before saving
        els.saveBar.hidden = false;
        els.titleInput.focus();
        setStatus("Done. Review the text and save it.");
      } else {
        setStatus("No speech was detected. Try again a little closer to the mic.");
      }
      break;
    case "error":
      setStatus(msg.message, true);
      if (state.recording) stopRecording({ sendStop: false });
      els.micBtn.disabled = false;
      break;
  }
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("This browser cannot access the microphone. Use Chrome, Edge or Firefox over HTTPS.", true);
    return;
  }

  resetDraft();
  els.micBtn.disabled = true;
  setStatus("Connecting…");

  try {
    state.ws = await openSocket();
    state.mic = new MicStreamer({
      onChunk: (buffer) => {
        if (state.ws?.readyState === WebSocket.OPEN) state.ws.send(buffer);
      },
      onLevel: (level) => {
        const scale = 1 + Math.min(level * 6, 0.6);
        els.micRing.style.transform = `scale(${scale.toFixed(3)})`;
      },
    });
    await state.mic.start();
  } catch (err) {
    state.ws?.close();
    state.ws = null;
    await state.mic?.stop();
    state.mic = null;
    els.micBtn.disabled = false;
    const denied = err.name === "NotAllowedError";
    setStatus(denied ? "Microphone access was blocked. Allow it in the browser and try again." : err.message, true);
    return;
  }

  els.micBtn.disabled = false;
  setRecordingUI(true);
  startTimer();
  setStatus("Listening…");
}

async function stopRecording({ sendStop = true } = {}) {
  setRecordingUI(false);
  stopTimer();
  await state.mic?.stop();
  state.mic = null;

  if (sendStop && state.ws?.readyState === WebSocket.OPEN) {
    els.micBtn.disabled = true;
    setStatus("Finishing up…");
    state.ws.send(JSON.stringify({ type: "stop" }));
  }
}

function resetDraft() {
  state.last = null;
  els.liveText.value = "";
  els.liveText.readOnly = true;
  els.titleInput.value = "";
  els.saveBar.hidden = true;
}

async function saveDraft() {
  const text = els.liveText.value.trim();
  if (!text) {
    toast("Nothing to save");
    return;
  }
  els.saveBtn.disabled = true;
  try {
    await api.create({
      title: els.titleInput.value.trim() || text.slice(0, 60),
      text,
      language: detectLanguage(text),
      engine: state.last?.engine ?? null,
      duration_seconds: state.last?.duration ?? null,
    });
    toast("Transcription saved");
    resetDraft();
    els.timer.textContent = "0:00";
    setStatus("Ready");
    state.page = 0;
    await loadHistory();
  } catch (err) {
    toast(`Could not save: ${err.message}`);
  } finally {
    els.saveBtn.disabled = false;
  }
}

// ---------- history ----------

async function loadHistory() {
  try {
    const data = await api.list({ q: state.query, skip: state.page * PAGE_SIZE, limit: PAGE_SIZE });
    // if we deleted the last item on a page, step back a page
    if (data.items.length === 0 && state.page > 0) {
      state.page -= 1;
      return loadHistory();
    }
    state.items = data.items;
    state.total = data.total;
    renderHistory();
  } catch (err) {
    els.list.replaceChildren();
    els.empty.hidden = false;
    els.empty.textContent = `Could not load history: ${err.message}`;
  }
}

function renderHistory() {
  const fragment = document.createDocumentFragment();
  for (const item of state.items) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    node.querySelector(".item-title").textContent = item.title;
    node.querySelector(".item-lang").textContent = item.language ?? "";
    node.querySelector(".item-text").textContent = item.text;
    const time = node.querySelector(".item-date");
    time.dateTime = item.created_at;
    time.textContent = dateFormat.format(new Date(item.created_at));
    fragment.appendChild(node);
  }
  els.list.replaceChildren(fragment);

  els.empty.hidden = state.items.length > 0;
  els.empty.textContent = state.query
    ? `Nothing matches “${state.query}”.`
    : "No transcriptions yet. Record something and save it to see it here.";

  els.count.textContent = state.total === 1 ? "1 saved" : `${state.total} saved`;
  const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  els.pageInfo.textContent = `Page ${state.page + 1} of ${pages}`;
  els.prevBtn.disabled = state.page === 0;
  els.nextBtn.disabled = state.page + 1 >= pages;
}

function findItem(id) {
  return state.items.find((item) => item.id === Number(id));
}

async function playItem(item, button) {
  if (state.audio) {
    state.audio.pause();
    URL.revokeObjectURL(state.audio.src);
    state.audio = null;
  }
  const original = button.textContent;
  button.textContent = "Loading…";
  try {
    const blob = await api.speak(item.text);
    state.audio = new Audio(URL.createObjectURL(blob));
    button.textContent = "Playing…";
    state.audio.onended = () => (button.textContent = original);
    await state.audio.play();
  } catch (err) {
    toast(`Could not play audio: ${err.message}`);
    button.textContent = original;
  }
}

function openEdit(item) {
  state.editingId = item.id;
  els.editTitle.value = item.title;
  els.editText.value = item.text;
  els.editDialog.showModal();
}

async function submitEdit(event) {
  event.preventDefault();
  const title = els.editTitle.value.trim();
  const text = els.editText.value.trim();
  if (!title || !text) return;
  try {
    await api.update(state.editingId, { title, text, language: detectLanguage(text) });
    els.editDialog.close();
    toast("Changes saved");
    await loadHistory();
  } catch (err) {
    toast(`Could not save changes: ${err.message}`);
  }
}

async function deleteItem(item) {
  if (!confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
  try {
    await api.remove(item.id);
    toast("Transcription deleted");
    await loadHistory();
  } catch (err) {
    toast(`Could not delete: ${err.message}`);
  }
}

// ---------- events ----------

els.micBtn.addEventListener("click", () => (state.recording ? stopRecording() : startRecording()));
els.saveBtn.addEventListener("click", saveDraft);
els.discardBtn.addEventListener("click", () => {
  resetDraft();
  els.timer.textContent = "0:00";
  setStatus("Ready");
});

let searchTimer;
els.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = els.search.value.trim();
    state.page = 0;
    loadHistory();
  }, 300);
});

els.prevBtn.addEventListener("click", () => {
  state.page = Math.max(0, state.page - 1);
  loadHistory();
});
els.nextBtn.addEventListener("click", () => {
  state.page += 1;
  loadHistory();
});

els.list.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const item = findItem(button.closest(".item").dataset.id);
  if (!item) return;

  switch (button.dataset.action) {
    case "play":
      playItem(item, button);
      break;
    case "copy":
      try {
        await navigator.clipboard.writeText(item.text);
        toast("Copied to clipboard");
      } catch {
        toast("Clipboard is not available here");
      }
      break;
    case "edit":
      openEdit(item);
      break;
    case "delete":
      deleteItem(item);
      break;
  }
});

els.editForm.addEventListener("submit", submitEdit);
els.cancelEdit.addEventListener("click", () => els.editDialog.close());

// ---------- init ----------

api
  .health()
  .then((info) => (els.engine.textContent = `Engine: ${info.engine}`))
  .catch(() => (els.engine.textContent = "Server not reachable"));

loadHistory();
