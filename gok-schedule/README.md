# March Command — Game of Kings schedule bot

Arizona-time march pipeline helper for Game of Kings tile farming.

This is an **alert / checklist bot**, not a game-client automation tool. It tells you when to send each of the 9 marches and when to claim cycle rewards. You still send marches in the game (or queue them there).

## Live path

With GitHub Pages enabled on this repo:

`https://hollow-soul-sh39.github.io/Gear-Puzzle-Sorter/gok-schedule/`

## Run locally

```bash
cd gok-schedule
python3 -m http.server 8765
```

Open http://127.0.0.1:8765/

## Default schedule (America/Phoenix)

| Arizona time | Action |
| --- | --- |
| 5:00 PM | Send March 1 — Cycle 1 |
| 7:13 PM | Send March 2 |
| 9:26 PM | Send March 3 |
| 11:39 PM | Send March 4 |
| 1:52 AM | Send March 5 |
| 5:00 AM | Send March 6 — Cycle 2 |
| 7:13 AM | Send March 7 |
| 9:26 AM | Send March 8 |
| 11:39 AM | Send March 9 |
| 1:52 PM | Send March 1 — Cycle 3 |
| 5:00 PM | Claim rewards + day reset |

Defaults: **12,000,000** tile resources ÷ **9** marches = **1,333,334** per march, gather **2h 13m**.

## Bot setup

1. Open the app (install as PWA on phone if you want).
2. Tap **Enable notifications**, then **Arm bot**.
3. Keep the tab/PWA available so countdowns and alerts can fire.
4. If you open mid-cycle, tap **Catch up missed** for past sends, then send the current due march.
5. When an alert hits, send/queue the march in Game of Kings and tap **Mark sent**.
6. Optional: add a Discord/Slack webhook under **Schedule math → Edit**.

## Tests

```bash
node gok-schedule/tests/schedule.test.js
```

## Settings

- Day start hour (default 17 = 5:00 PM AZ)
- Gather minutes (default 133)
- Resources / march count
- Rebuild offsets from gather time (serial pipeline with 5:00 AM realign)
- Sound + webhook alerts
