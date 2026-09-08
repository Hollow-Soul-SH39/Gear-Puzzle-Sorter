import {
  DEFAULTS,
  mergeConfig,
  resolveAction,
  formatCountdown,
  formatDuration,
  formatTimeShort,
  formatDateShort,
  resourcesPerMarch,
  zonedParts,
} from "./schedule.js";

const STORAGE_KEY = "march-command-v1";

const els = {
  armBtn: document.getElementById("armBtn"),
  statusKicker: document.getElementById("statusKicker"),
  focusTitle: document.getElementById("focusTitle"),
  focusSub: document.getElementById("focusSub"),
  countdown: document.getElementById("countdown"),
  azClock: document.getElementById("azClock"),
  markSentBtn: document.getElementById("markSentBtn"),
  snoozeBtn: document.getElementById("snoozeBtn"),
  gatheringLabel: document.getElementById("gatheringLabel"),
  progressLabel: document.getElementById("progressLabel"),
  resourceLabel: document.getElementById("resourceLabel"),
  timeline: document.getElementById("timeline"),
  dayLabel: document.getElementById("dayLabel"),
  notifyBtn: document.getElementById("notifyBtn"),
  testAlertBtn: document.getElementById("testAlertBtn"),
  resetDayBtn: document.getElementById("resetDayBtn"),
  toggleSettings: document.getElementById("toggleSettings"),
  settingsForm: document.getElementById("settingsForm"),
  mathGrid: document.getElementById("mathGrid"),
  restoreDefaults: document.getElementById("restoreDefaults"),
  toast: document.getElementById("toast"),
  heroPanel: document.querySelector(".hero-panel"),
};

const state = {
  config: mergeConfig(load().config),
  armed: Boolean(load().armed),
  completed: new Set(load().completed || []),
  snoozeUntil: load().snoozeUntil || 0,
  lastAlertId: load().lastAlertId || null,
  dayStartMs: null,
};

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function save() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      config: state.config,
      armed: state.armed,
      completed: [...state.completed],
      snoozeUntil: state.snoozeUntil,
      lastAlertId: state.lastAlertId,
    })
  );
}

function toast(message) {
  els.toast.hidden = false;
  els.toast.textContent = message;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    els.toast.hidden = true;
  }, 2800);
}

function fmtResources(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(3).replace(/\.?0+$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function playBeep() {
  if (!state.config.soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 660;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    osc.start(now);
    osc.stop(now + 0.5);
    setTimeout(() => ctx.close(), 800);
  } catch {
    /* ignore */
  }
}

async function notify(title, body, tag) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    if (navigator.serviceWorker?.controller) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        tag,
        renotify: true,
        icon: "./favicon.svg",
        badge: "./favicon.svg",
      });
    } else {
      new Notification(title, { body, tag });
    }
  } catch {
    /* ignore */
  }
}

async function pingWebhook(title, body) {
  if (!state.config.webhookEnabled || !state.config.webhookUrl) return;
  try {
    await fetch(state.config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `**${title}**\n${body}`,
        text: `${title}: ${body}`,
      }),
      mode: "no-cors",
    });
  } catch {
    /* webhook failures should not break the bot */
  }
}

async function fireAlert(event) {
  if (!state.armed) return;
  if (Date.now() < state.snoozeUntil) return;
  if (state.lastAlertId === event.id) return;
  state.lastAlertId = event.id;
  save();

  const title = event.isDayReset ? "Claim rewards" : event.title;
  const body = event.isDayReset
    ? "Cycle reset — claim Tier rewards + 12M, then restart marches."
    : `${formatTimeShort(event.sendAt, state.config.timezone)} AZ · ${fmtResources(event.resources)} resources`;

  playBeep();
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  await notify(title, body, event.id);
  await pingWebhook(title, body);
  toast(`Alert: ${title}`);
}

function syncDayBoundary(action) {
  const ms = action.dayStart.getTime();
  if (state.dayStartMs != null && state.dayStartMs !== ms) {
    state.completed = new Set();
    state.lastAlertId = null;
  }
  state.dayStartMs = ms;
  save();
}

function renderMath() {
  const load = resourcesPerMarch(state.config.resourcesPerTile, state.config.marchesPerTile);
  els.mathGrid.innerHTML = `
    <div><span>Tile</span><strong>${state.config.resourcesPerTile.toLocaleString()}</strong></div>
    <div><span>Marches</span><strong>${state.config.marchesPerTile}</strong></div>
    <div><span>Load</span><strong>${load.toLocaleString()}</strong></div>
    <div><span>Gather</span><strong>${formatDuration(state.config.gatherMinutes)}</strong></div>
  `;
  els.resourceLabel.textContent = fmtResources(load);
}

function renderTimeline(action) {
  els.dayLabel.textContent = `${formatDateShort(action.dayStart, state.config.timezone)} → ${formatTimeShort(action.dayEnd, state.config.timezone)}`;
  els.timeline.innerHTML = "";

  for (const event of action.events) {
    const li = document.createElement("li");
    const done = state.completed.has(event.id);
    const isDue = action.due && action.due.id === event.id;
    const isNext = action.next && action.next.id === event.id && !action.due;

    if (done) li.classList.add("is-done");
    if (isDue) li.classList.add("is-due");
    if (isNext) li.classList.add("is-next");
    if (event.isDayReset) li.classList.add("is-reset");

    let stateLabel = "queued";
    if (done) stateLabel = "done";
    else if (isDue) stateLabel = event.isDayReset ? "claim" : "send now";
    else if (isNext) stateLabel = "next";
    else if (event.sendAt > new Date()) stateLabel = "later";

    li.innerHTML = `
      <div class="time">${formatTimeShort(event.sendAt, state.config.timezone)}</div>
      <div>
        <div class="title">${event.title}</div>
        <div class="notes">${event.notes || (event.resources ? `${fmtResources(event.resources)} · Cycle ${event.cycle}` : "")}</div>
      </div>
      <div class="state">${stateLabel}</div>
    `;
    els.timeline.appendChild(li);
  }
}

function render() {
  const now = new Date();
  const action = resolveAction(now, state.config, state.completed);
  syncDayBoundary(action);

  const parts = zonedParts(now, state.config.timezone);
  const ampm = parts.hour >= 12 ? "PM" : "AM";
  const h12 = parts.hour % 12 || 12;
  els.azClock.textContent = `Arizona · ${h12}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")} ${ampm}`;

  const focus = action.focus;
  const due = action.due;
  els.heroPanel.classList.toggle("is-due", Boolean(due));

  if (due) {
    els.statusKicker.textContent = due.isDayReset ? "Action required" : "Send now";
    els.focusTitle.textContent = due.title;
    els.focusSub.textContent = due.isDayReset
      ? due.notes
      : `Cycle ${due.cycle} · ${fmtResources(due.resources)} resources`;
    els.countdown.textContent = formatCountdown(0);
    els.markSentBtn.textContent = due.isDayReset ? "Mark claimed" : "Mark sent";
  } else if (action.next) {
    els.statusKicker.textContent = "Next up";
    els.focusTitle.textContent = action.next.title;
    els.focusSub.textContent = action.next.isDayReset
      ? action.next.notes
      : `Cycle ${action.next.cycle} · arrives ${formatTimeShort(action.next.sendAt, state.config.timezone)}`;
    els.countdown.textContent = formatCountdown(action.msUntil);
    els.markSentBtn.textContent = "Mark sent";
  } else {
    els.statusKicker.textContent = "Pipeline clear";
    els.focusTitle.textContent = "Day complete";
    els.focusSub.textContent = "Waiting for next 5:00 PM reset";
    els.countdown.textContent = formatCountdown(action.dayEnd - now);
  }

  if (action.currentGathering && !state.completed.has(action.currentGathering.id)) {
    const left = action.currentGathering.finishAt - now;
    els.gatheringLabel.textContent = `March ${action.currentGathering.march} · ${formatCountdown(left)} left`;
  } else if (action.currentGathering) {
    els.gatheringLabel.textContent = `March ${action.currentGathering.march} marked`;
  } else {
    els.gatheringLabel.textContent = "Idle";
  }

  els.progressLabel.textContent = `${action.completedCount} / ${action.totalMarches}`;
  els.armBtn.setAttribute("aria-pressed", state.armed ? "true" : "false");
  els.armBtn.querySelector(".arm-label").textContent = state.armed ? "Bot armed" : "Arm bot";

  renderMath();
  renderTimeline(action);

  if (due && state.armed) {
    fireAlert(due);
  }

  document.title = due
    ? `SEND · ${due.title} · March Command`
    : `${els.countdown.textContent} · March Command`;
}

function markFocusComplete() {
  const action = resolveAction(new Date(), state.config, state.completed);
  const target = action.due || action.focus;
  if (!target) return;
  state.completed.add(target.id);
  if (state.lastAlertId === target.id) state.lastAlertId = null;
  save();
  toast(target.isDayReset ? "Rewards marked claimed" : `March ${target.march} marked sent`);
  render();
}

function fillSettingsForm() {
  const form = els.settingsForm;
  form.dayStartHour.value = state.config.dayStartHour;
  form.gatherMinutes.value = state.config.gatherMinutes;
  form.resourcesPerTile.value = state.config.resourcesPerTile;
  form.marchesPerTile.value = state.config.marchesPerTile;
  form.useGeneratedOffsets.checked = Boolean(state.config._generated);
  form.soundEnabled.checked = state.config.soundEnabled !== false;
  form.webhookEnabled.checked = Boolean(state.config.webhookEnabled);
  form.webhookUrl.value = state.config.webhookUrl || "";
}

els.armBtn.addEventListener("click", async () => {
  state.armed = !state.armed;
  save();
  if (state.armed) {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    toast("Bot armed — alerts will fire at send times");
  } else {
    toast("Bot disarmed");
  }
  render();
});

els.markSentBtn.addEventListener("click", markFocusComplete);

els.snoozeBtn.addEventListener("click", () => {
  state.snoozeUntil = Date.now() + 5 * 60_000;
  state.lastAlertId = null;
  save();
  toast("Snoozed alerts for 5 minutes");
});

els.notifyBtn.addEventListener("click", async () => {
  if (typeof Notification === "undefined") {
    toast("Notifications not supported in this browser");
    return;
  }
  const perm = await Notification.requestPermission();
  toast(perm === "granted" ? "Notifications enabled" : "Notifications blocked");
});

els.testAlertBtn.addEventListener("click", async () => {
  playBeep();
  await notify("March Command test", "Alerts are working. Keep the bot armed for live sends.", "test");
  toast("Test alert fired");
});

els.resetDayBtn.addEventListener("click", () => {
  state.completed = new Set();
  state.lastAlertId = null;
  save();
  toast("Cleared today’s marks");
  render();
});

els.toggleSettings.addEventListener("click", () => {
  const open = els.settingsForm.hidden;
  els.settingsForm.hidden = !open;
  els.toggleSettings.textContent = open ? "Hide" : "Edit";
  if (open) fillSettingsForm();
});

els.settingsForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(els.settingsForm);
  const gatherMinutes = Number(fd.get("gatherMinutes"));
  const useGenerated = fd.get("useGeneratedOffsets") === "on";
  const partial = {
    dayStartHour: Number(fd.get("dayStartHour")),
    dayStartMinute: 0,
    gatherMinutes,
    resourcesPerTile: Number(fd.get("resourcesPerTile")),
    marchesPerTile: Number(fd.get("marchesPerTile")),
    soundEnabled: fd.get("soundEnabled") === "on",
    webhookEnabled: fd.get("webhookEnabled") === "on",
    webhookUrl: String(fd.get("webhookUrl") || "").trim(),
    timezone: DEFAULTS.timezone,
  };
  if (useGenerated) {
    state.config = mergeConfig({ ...partial, gatherMinutes });
    state.config._generated = true;
  } else {
    state.config = mergeConfig({
      ...partial,
      sendOffsetsMinutes: [...DEFAULTS.sendOffsetsMinutes],
    });
    state.config._generated = false;
  }
  state.completed = new Set();
  state.lastAlertId = null;
  save();
  toast("Settings saved");
  render();
});

els.restoreDefaults.addEventListener("click", () => {
  state.config = mergeConfig({
    soundEnabled: true,
    webhookEnabled: false,
    webhookUrl: "",
  });
  fillSettingsForm();
  toast("Defaults restored — hit Save to apply");
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

render();
setInterval(render, 1000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") render();
});
