/**
 * Game of Kings — March schedule engine (America/Phoenix).
 * Pure functions; safe to run in Node tests and the browser.
 */

export const DEFAULTS = Object.freeze({
  timezone: "America/Phoenix",
  dayStartHour: 17, // 5:00 PM
  dayStartMinute: 0,
  gatherMinutes: 133, // 2h 13m
  marchCount: 9,
  resourcesPerTile: 12_000_000,
  marchesPerTile: 9,
  // Fixed offsets (minutes from day start) matching the published AZ schedule.
  // Cycle 2 realigns at +12h (5:00 AM); cycle reset at +24h (5:00 PM).
  sendOffsetsMinutes: Object.freeze([
    0, // 5:00 PM  March 1 — Cycle 1
    133, // 7:13 PM  March 2
    266, // 9:26 PM  March 3
    399, // 11:39 PM March 4
    532, // 1:52 AM  March 5
    720, // 5:00 AM  March 6 — Cycle 2
    853, // 7:13 AM  March 7
    986, // 9:26 AM  March 8
    1119, // 11:39 AM March 9
    1252, // 1:52 PM  March 1 — Cycle 3 pipeline
  ]),
});

export function resourcesPerMarch(resourcesPerTile = DEFAULTS.resourcesPerTile, marches = DEFAULTS.marchesPerTile) {
  return Math.ceil(resourcesPerTile / marches);
}

export function gatherMinutesFromRate(resources, resourcesPerHour) {
  if (!resourcesPerHour || resourcesPerHour <= 0) return DEFAULTS.gatherMinutes;
  return Math.round((resources / resourcesPerHour) * 60);
}

/** Format minutes as "2h 13m". */
export function formatDuration(totalMinutes) {
  const sign = totalMinutes < 0 ? "-" : "";
  const m = Math.abs(Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h === 0) return `${sign}${mins}m`;
  if (mins === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${mins}m`;
}

/** Format a countdown like 01:23:45. */
export function formatCountdown(ms) {
  const sign = ms < 0 ? "-" : "";
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (h > 0) return `${sign}${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${sign}${pad(m)}:${pad(s)}`;
}

/**
 * Parts for an Instant in a given IANA timezone.
 */
export function zonedParts(date, timeZone = DEFAULTS.timezone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const map = {};
  for (const { type, value } of fmt.formatToParts(date)) {
    if (type !== "literal") map[type] = value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: map.weekday,
  };
}

/**
 * Convert a wall-clock time in `timeZone` to a UTC Date.
 * America/Phoenix is fixed UTC-7 (no DST).
 */
export function zonedDateTimeToUtc(
  { year, month, day, hour = 0, minute = 0, second = 0 },
  timeZone = DEFAULTS.timezone
) {
  // Prefer Temporal when available; otherwise use offset probe.
  if (typeof Temporal !== "undefined" && Temporal.ZonedDateTime) {
    const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
    return new Date(Temporal.ZonedDateTime.from(`${iso}[${timeZone}]`).epochMilliseconds);
  }

  // Guess UTC then correct by comparing formatted parts (handles Phoenix UTC-7).
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const want = Date.UTC(year, month - 1, day, hour, minute, second);
    const delta = want - asUtc;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess);
}

export function addCalendarDays(parts, days) {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + days);
  const d = new Date(utc);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/**
 * Start of the farming "day" that contains `now` (defaults: 5:00 PM AZ).
 * If before day-start, the active day began yesterday at day-start.
 */
export function activeDayStart(now = new Date(), config = DEFAULTS) {
  const tz = config.timezone || DEFAULTS.timezone;
  const parts = zonedParts(now, tz);
  const startHour = config.dayStartHour ?? DEFAULTS.dayStartHour;
  const startMinute = config.dayStartMinute ?? DEFAULTS.dayStartMinute;
  const minutesNow = parts.hour * 60 + parts.minute;
  const minutesStart = startHour * 60 + startMinute;
  let day = { year: parts.year, month: parts.month, day: parts.day };
  if (minutesNow < minutesStart) {
    day = addCalendarDays(day, -1);
  }
  return zonedDateTimeToUtc(
    {
      year: day.year,
      month: day.month,
      day: day.day,
      hour: startHour,
      minute: startMinute,
      second: 0,
    },
    tz
  );
}

export function nextDayStart(dayStart, config = DEFAULTS) {
  const tz = config.timezone || DEFAULTS.timezone;
  const parts = zonedParts(dayStart, tz);
  const next = addCalendarDays(parts, 1);
  return zonedDateTimeToUtc(
    {
      year: next.year,
      month: next.month,
      day: next.day,
      hour: config.dayStartHour ?? DEFAULTS.dayStartHour,
      minute: config.dayStartMinute ?? DEFAULTS.dayStartMinute,
      second: 0,
    },
    tz
  );
}

function cycleForIndex(index) {
  if (index <= 4) return 1;
  if (index <= 8) return 2;
  return 3;
}

function marchLabelForIndex(index) {
  // Indices 0–8 are marches 1–9; index 9 restarts as March 1 (cycle 3).
  return (index % 9) + 1;
}

/**
 * Build the ordered list of send events for one farming day.
 */
export function buildDaySchedule(dayStart, config = DEFAULTS) {
  const offsets = config.sendOffsetsMinutes || DEFAULTS.sendOffsetsMinutes;
  const gatherMs = (config.gatherMinutes ?? DEFAULTS.gatherMinutes) * 60_000;
  const resources = resourcesPerMarch(
    config.resourcesPerTile ?? DEFAULTS.resourcesPerTile,
    config.marchesPerTile ?? DEFAULTS.marchesPerTile
  );

  return offsets.map((offsetMin, index) => {
    const sendAt = new Date(dayStart.getTime() + offsetMin * 60_000);
    const finishAt = new Date(sendAt.getTime() + gatherMs);
    const cycle = cycleForIndex(index);
    const march = marchLabelForIndex(index);
    const isCycleStart = index === 0 || index === 5;
    const isDayReset = false;
    return {
      id: `m${index}-${dayStart.getTime()}`,
      index,
      march,
      cycle,
      offsetMinutes: offsetMin,
      sendAt,
      finishAt,
      resources,
      isCycleStart,
      isDayReset,
      title: `Send March ${march}`,
      notes:
        index === 0
          ? "Cycle 1 starts"
          : index === 5
            ? "Cycle 2 starts"
            : index === 9
              ? "Cycle 3 starts"
              : finishAt
                ? `Finishes ~${formatTimeShort(finishAt, config.timezone)}`
                : "",
    };
  });
}

/** Claim / reset event at end of day. */
export function buildDayResetEvent(dayStart, config = DEFAULTS) {
  const resetAt = nextDayStart(dayStart, config);
  return {
    id: `reset-${dayStart.getTime()}`,
    index: 10,
    march: null,
    cycle: null,
    offsetMinutes: 24 * 60,
    sendAt: resetAt,
    finishAt: resetAt,
    resources: null,
    isCycleStart: true,
    isDayReset: true,
    title: "Claim rewards + new day",
    notes: "Cycle resets — claim Tier-1/Tier-2 + 12M points, then restart",
  };
}

export function formatTimeShort(date, timeZone = DEFAULTS.timezone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatDateShort(date, timeZone = DEFAULTS.timezone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

/**
 * Full timeline for the active day including the reset boundary.
 */
export function buildTimeline(now = new Date(), config = DEFAULTS) {
  const dayStart = activeDayStart(now, config);
  const marches = buildDaySchedule(dayStart, config);
  const reset = buildDayResetEvent(dayStart, config);
  return {
    dayStart,
    dayEnd: reset.sendAt,
    events: [...marches, reset],
  };
}

/**
 * Find current / next action relative to `now`.
 * `completedIds` is a Set of event ids the user marked sent.
 */
export function resolveAction(now = new Date(), config = DEFAULTS, completedIds = new Set()) {
  const { dayStart, dayEnd, events } = buildTimeline(now, config);
  const pending = events.filter((e) => !completedIds.has(e.id));

  let due = null;
  let next = null;
  let currentGathering = null;

  for (const event of events) {
    if (event.isDayReset) continue;
    if (now >= event.sendAt && now < event.finishAt) {
      currentGathering = event;
      break;
    }
  }

  for (const event of pending) {
    if (now >= event.sendAt) {
      // Still "due" until marked complete (or until next event is closer for resets).
      due = event;
    } else {
      next = event;
      break;
    }
  }

  // If multiple overdue, prefer the earliest incomplete.
  if (due) {
    const overdue = pending.filter((e) => e.sendAt <= now);
    if (overdue.length) due = overdue[0];
  }

  const focus = due || next || events[events.length - 1];
  const msUntil = focus ? focus.sendAt.getTime() - now.getTime() : 0;
  const status = due ? (due.isDayReset ? "claim" : "send_now") : next ? "waiting" : "complete";

  return {
    dayStart,
    dayEnd,
    events,
    due,
    next,
    focus,
    currentGathering,
    status,
    msUntil,
    completedCount: events.filter((e) => !e.isDayReset && completedIds.has(e.id)).length,
    totalMarches: events.filter((e) => !e.isDayReset).length,
  };
}

/**
 * Generate staggered offsets from gather duration (serial pipeline),
 * then snap Cycle 2 / day reset to the 12h / 24h anchors when gaps appear.
 * Used when the user changes gather time away from the published table.
 */
export function generateOffsets(gatherMinutes, marchSlots = 10) {
  const offsets = [];
  let t = 0;
  for (let i = 0; i < marchSlots; i++) {
    if (i === 5) {
      // Realign Cycle 2 to +12 hours (5:00 AM when day starts 5:00 PM).
      t = Math.max(t, 12 * 60);
    }
    offsets.push(t);
    t += gatherMinutes;
  }
  return offsets;
}

export function mergeConfig(partial = {}) {
  const base = { ...DEFAULTS, ...partial };
  if (partial.gatherMinutes != null && partial.sendOffsetsMinutes == null) {
    base.sendOffsetsMinutes = generateOffsets(partial.gatherMinutes);
  }
  if (!Array.isArray(base.sendOffsetsMinutes)) {
    base.sendOffsetsMinutes = [...DEFAULTS.sendOffsetsMinutes];
  }
  return base;
}
