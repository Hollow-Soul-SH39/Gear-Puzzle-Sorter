/* Fail-closed scan gate — never invent a board from a weak read. */
(function (root) {
  const MIN_ROWS = 2;
  const MIN_COLS = 2;
  const MIN_CHIPS = 4;
  const MIN_COLORS = 2;
  const MIN_GRID_SCORE = 0.42;
  const MAX_NOISY_FRAC = 0.38;

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function isJunkScan(input) {
    if (!input) return true;
    if (input.ok === false) return true;
    const rows = num(input.rows);
    const cols = num(input.cols);
    const chips = num(input.chipCount);
    const colors = num(input.colorCount);
    const score = num(input.gridScore);
    const noisy = num(input.noisyCells);
    const cells = Math.max(1, rows * cols);
    if (rows < MIN_ROWS || cols < MIN_COLS) return true;
    if (chips < MIN_CHIPS) return true;
    if (colors < MIN_COLORS) return true;
    if (score > 0 && score < MIN_GRID_SCORE) return true;
    if (noisy / cells > MAX_NOISY_FRAC) return true;
    return false;
  }

  function scanLooksTrusted(input) {
    if (isJunkScan(input)) return false;
    const rows = num(input.rows);
    const cols = num(input.cols);
    const score = num(input.gridScore);
    const chips = num(input.chipCount);
    if (score > 0 && score < 0.55) return false;
    if (chips < rows) return false;
    if (num(input.unevenPitch) > 0.28) return false;
    return true;
  }

  function failReason(input) {
    if (!input) return 'Could not read this photo. No board was created.';
    if (input.reason) return input.reason;
    if (isJunkScan(input)) {
      return 'Could not read a chip grid in this photo. No board was invented — try a clear, top-down shot of the full board.';
    }
    if (!scanLooksTrusted(input)) {
      return 'This photo is too noisy to trust. Nothing was invented. Retake it or build the board in the editor.';
    }
    return '';
  }

  const api = {
    MIN_ROWS, MIN_COLS, MIN_CHIPS, MIN_COLORS, MIN_GRID_SCORE, MAX_NOISY_FRAC,
    isJunkScan, scanLooksTrusted, failReason
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GearBoardGate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
