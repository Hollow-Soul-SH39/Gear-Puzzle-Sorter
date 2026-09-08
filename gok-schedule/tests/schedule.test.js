import {
  DEFAULTS,
  resourcesPerMarch,
  formatDuration,
  formatCountdown,
  activeDayStart,
  buildDaySchedule,
  buildTimeline,
  resolveAction,
  catchUpIds,
  generateOffsets,
  mergeConfig,
  zonedDateTimeToUtc,
  formatTimeShort,
} from "../schedule.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `expected ${b}, got ${a}`);
}

function assertApprox(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error(msg || `expected ~${b}, got ${a}`);
}

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok  ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

test("resources per march rounds up", () => {
  assertEqual(resourcesPerMarch(12_000_000, 9), 1_333_334);
});

test("formatDuration 133 minutes", () => {
  assertEqual(formatDuration(133), "2h 13m");
});

test("formatCountdown", () => {
  assertEqual(formatCountdown(2 * 3600_000 + 13 * 60_000 + 5_000), "02:13:05");
  assertEqual(formatCountdown(45_000), "00:45");
});

test("published offsets match Arizona table", () => {
  const dayStart = zonedDateTimeToUtc(
    { year: 2026, month: 3, day: 8, hour: 17, minute: 0, second: 0 },
    "America/Phoenix"
  );
  const events = buildDaySchedule(dayStart, DEFAULTS);
  const labels = events.map((e) => formatTimeShort(e.sendAt, "America/Phoenix"));
  assertEqual(labels[0], "5:00 PM");
  assertEqual(labels[1], "7:13 PM");
  assertEqual(labels[2], "9:26 PM");
  assertEqual(labels[3], "11:39 PM");
  assertEqual(labels[4], "1:52 AM");
  assertEqual(labels[5], "5:00 AM");
  assertEqual(labels[6], "7:13 AM");
  assertEqual(labels[7], "9:26 AM");
  assertEqual(labels[8], "11:39 AM");
  assertEqual(labels[9], "1:52 PM");
  assertEqual(events[0].march, 1);
  assertEqual(events[0].cycle, 1);
  assertEqual(events[5].march, 6);
  assertEqual(events[5].cycle, 2);
  assertEqual(events[9].march, 1);
  assertEqual(events[9].cycle, 3);
});

test("active day starts at previous 5 PM before 5 PM", () => {
  const morning = zonedDateTimeToUtc(
    { year: 2026, month: 3, day: 9, hour: 9, minute: 0, second: 0 },
    "America/Phoenix"
  );
  const start = activeDayStart(morning, DEFAULTS);
  assertEqual(formatTimeShort(start, "America/Phoenix"), "5:00 PM");
  // Should be March 8 5 PM, not March 9
  const timeline = buildTimeline(morning, DEFAULTS);
  assertEqual(timeline.events[0].sendAt.getTime(), start.getTime());
});

test("resolveAction finds next march", () => {
  const dayStart = zonedDateTimeToUtc(
    { year: 2026, month: 3, day: 8, hour: 17, minute: 0, second: 0 },
    "America/Phoenix"
  );
  const [m1] = buildDaySchedule(dayStart, DEFAULTS);
  const now = zonedDateTimeToUtc(
    { year: 2026, month: 3, day: 8, hour: 18, minute: 0, second: 0 },
    "America/Phoenix"
  );
  // March 1 is past send; mark it done so the bot looks ahead to March 2.
  const action = resolveAction(now, DEFAULTS, new Set([m1.id]));
  assertEqual(action.status, "waiting");
  assertEqual(action.next.march, 2);
  assertApprox(action.msUntil, 73 * 60_000, 2000);
});

test("resolveAction marks due when past send and incomplete", () => {
  const now = zonedDateTimeToUtc(
    { year: 2026, month: 3, day: 8, hour: 17, minute: 5, second: 0 },
    "America/Phoenix"
  );
  const action = resolveAction(now, DEFAULTS, new Set());
  assertEqual(action.status, "send_now");
  assertEqual(action.due.march, 1);
});

test("mid-day overdue focuses latest slot, older are missed", () => {
  const now = zonedDateTimeToUtc(
    { year: 2026, month: 3, day: 8, hour: 22, minute: 0, second: 0 },
    "America/Phoenix"
  );
  const action = resolveAction(now, DEFAULTS, new Set());
  assertEqual(action.status, "send_now");
  assertEqual(action.due.march, 3); // 9:26 PM is latest overdue at 10:00 PM
  assertEqual(action.missed.length, 2); // March 1 + 2
  assertEqual(action.next.march, 4);
});

test("catchUpIds returns all overdue incomplete events", () => {
  const dayStart = zonedDateTimeToUtc(
    { year: 2026, month: 3, day: 8, hour: 17, minute: 0, second: 0 },
    "America/Phoenix"
  );
  const events = buildDaySchedule(dayStart, DEFAULTS);
  const now = zonedDateTimeToUtc(
    { year: 2026, month: 3, day: 8, hour: 22, minute: 0, second: 0 },
    "America/Phoenix"
  );
  const ids = catchUpIds(now, DEFAULTS, new Set());
  assertEqual(ids.length, 3);
  assertEqual(ids[0], events[0].id);
  assertEqual(ids[2], events[2].id);
});

test("completed march advances to next", () => {
  const dayStart = zonedDateTimeToUtc(
    { year: 2026, month: 3, day: 8, hour: 17, minute: 0, second: 0 },
    "America/Phoenix"
  );
  const events = buildDaySchedule(dayStart, DEFAULTS);
  const now = zonedDateTimeToUtc(
    { year: 2026, month: 3, day: 8, hour: 17, minute: 5, second: 0 },
    "America/Phoenix"
  );
  const action = resolveAction(now, DEFAULTS, new Set([events[0].id]));
  assertEqual(action.status, "waiting");
  assertEqual(action.next.march, 2);
});

test("generateOffsets realigns cycle 2 to 12h", () => {
  const offsets = generateOffsets(133);
  assertEqual(offsets[0], 0);
  assertEqual(offsets[1], 133);
  assertEqual(offsets[5], 720);
  assert(offsets[5] >= 12 * 60, "cycle 2 should be at/after 12h");
});

test("mergeConfig can rebuild offsets from gather time", () => {
  const cfg = mergeConfig({ gatherMinutes: 140 });
  assertEqual(cfg.gatherMinutes, 140);
  assertEqual(cfg.sendOffsetsMinutes[1], 140);
  assertEqual(cfg.sendOffsetsMinutes[5], 720);
});

test("march finish is gatherMinutes after send", () => {
  const dayStart = zonedDateTimeToUtc(
    { year: 2026, month: 3, day: 8, hour: 17, minute: 0, second: 0 },
    "America/Phoenix"
  );
  const [m1] = buildDaySchedule(dayStart, DEFAULTS);
  assertEqual(m1.finishAt - m1.sendAt, 133 * 60_000);
});

if (!process.exitCode) {
  console.log(`\n${passed} tests passed`);
}
