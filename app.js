/* Gear Puzzle Sorter — UI, camera/photo scan, editor, playback. */
(function () {
  const Detect = window.GearBoardDetect;
  const Gate = window.GearBoardGate;
  const Solver = window.GearSolver;
  const Color = window.GearColor;

  const SAMPLE = {
    capacity: 4,
    pegs: [
      ['#e74c3c', '#e74c3c', '#3498db', '#3498db'],
      ['#3498db', '#3498db', '#e74c3c', '#e74c3c'],
      ['#2ecc71', '#f1c40f', '#2ecc71', '#f1c40f'],
      ['#f1c40f', '#2ecc71', '#f1c40f', '#2ecc71'],
      [],
      []
    ]
  };

  let pegs = [];
  let capacity = 4;
  let selectedPeg = -1;
  let selectedSlot = -1;
  let paintColor = '#e74c3c';
  let palette = Color.namedSwatches();
  let solution = [];
  let playIndex = 0;
  let playTimer = null;
  let sourceImage = null;
  let cameraStream = null;
  let lastScanOk = false;

  function $(id) { return document.getElementById(id); }

  function setStatus(msg, kind) {
    const el = $('status');
    el.textContent = msg;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function showScanError(msg) {
    const el = $('scanError');
    el.textContent = msg;
    el.classList.add('show');
    setStatus(msg, 'error');
  }

  function clearScanError() {
    const el = $('scanError');
    el.textContent = '';
    el.classList.remove('show');
  }

  function stopPlayback() {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
  }

  function clearSolutionSilent() {
    stopPlayback();
    solution = [];
    playIndex = 0;
    $('solutionSection').classList.remove('visible');
    $('moveLabel').textContent = '';
  }

  function snapshotBoard() {
    return { pegs: Solver.clonePegs(pegs), capacity };
  }

  let baseBoard = snapshotBoard();

  function setBoard(nextPegs, nextCap, opts) {
    pegs = Solver.normalizePegs(nextPegs);
    capacity = Solver.capacityOf(pegs, nextCap);
    if (!pegs.length) capacity = nextCap || 4;
    if (!(opts && opts.keepSelection)) {
      selectedPeg = -1;
      selectedSlot = -1;
    }
    if (!(opts && opts.keepSolution)) clearSolutionSilent();
    if (!(opts && opts.keepBase)) baseBoard = snapshotBoard();
    renderPalette();
    renderBoard();
    updateButtons();
  }

  function ensureWorkingPegs(list, cap) {
    const next = Solver.clonePegs(list);
    const empty = next.filter((p) => !p.length).length;
    if (empty < 2) {
      next.push([]);
      if (empty < 1) next.push([]);
    }
    return { pegs: next, capacity: cap };
  }

  function renderPalette() {
    const row = $('swatchRow');
    row.innerHTML = '';
    palette.forEach((hex) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (hex === paintColor ? ' on' : '');
      b.style.background = hex;
      b.title = hex;
      b.addEventListener('click', () => {
        paintColor = hex;
        renderPalette();
        if (selectedPeg >= 0 && selectedSlot >= 0) {
          paintSelected();
        }
      });
      row.appendChild(b);
    });
  }

  function renderBoard() {
    const host = $('board');
    host.innerHTML = '';
    host.style.setProperty('--pegs', String(Math.max(1, pegs.length)));
    pegs.forEach((stack, i) => {
      const col = document.createElement('div');
      col.className = 'peg' + (selectedPeg === i ? ' selected' : '');
      col.dataset.peg = String(i);

      const slots = document.createElement('div');
      slots.className = 'slots';
      for (let s = capacity - 1; s >= 0; s--) {
        const chip = stack[s];
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'slot' + (chip ? ' chip' : ' empty') +
          (selectedPeg === i && selectedSlot === s ? ' picked' : '');
        if (chip) cell.style.background = chip;
        cell.dataset.peg = String(i);
        cell.dataset.slot = String(s);
        cell.addEventListener('click', () => onSlotClick(i, s));
        slots.appendChild(cell);
      }
      const post = document.createElement('div');
      post.className = 'post';
      const lab = document.createElement('span');
      lab.className = 'peg-label';
      lab.textContent = 'Peg ' + (i + 1);
      col.appendChild(slots);
      col.appendChild(post);
      col.appendChild(lab);
      host.appendChild(col);
    });
    $('boardMeta').textContent = pegs.length
      ? pegs.length + ' pegs · height ' + capacity + ' · ' +
        pegs.reduce((s, p) => s + p.length, 0) + ' chips'
      : 'No board yet';
  }

  function onSlotClick(peg, slot) {
    selectedPeg = peg;
    selectedSlot = slot;
    const stack = pegs[peg];
    if (stack[slot]) {
      paintColor = stack[slot];
      renderPalette();
    }
    renderBoard();
    updateButtons();
  }

  function paintSelected() {
    if (selectedPeg < 0 || selectedSlot < 0) return;
    const stack = pegs[selectedPeg];
    while (stack.length <= selectedSlot) stack.push(null);
    stack[selectedSlot] = paintColor;
    compactPeg(selectedPeg);
    baseBoard = snapshotBoard();
    clearSolutionSilent();
    renderBoard();
    updateButtons();
  }

  function compactPeg(i) {
    pegs[i] = pegs[i].filter(Boolean);
    if (pegs[i].length > capacity) pegs[i] = pegs[i].slice(0, capacity);
  }

  function deleteSelectedChip() {
    if (selectedPeg < 0 || selectedSlot < 0) return;
    if (!pegs[selectedPeg][selectedSlot]) return;
    pegs[selectedPeg][selectedSlot] = null;
    compactPeg(selectedPeg);
    baseBoard = snapshotBoard();
    clearSolutionSilent();
    renderBoard();
    updateButtons();
  }

  function addPeg() {
    pegs.push([]);
    baseBoard = snapshotBoard();
    clearSolutionSilent();
    renderBoard();
    updateButtons();
    setStatus('Added an empty peg.');
  }

  function removePeg() {
    if (!pegs.length) return;
    const i = selectedPeg >= 0 ? selectedPeg : pegs.length - 1;
    pegs.splice(i, 1);
    selectedPeg = -1;
    selectedSlot = -1;
    baseBoard = snapshotBoard();
    clearSolutionSilent();
    renderBoard();
    updateButtons();
    setStatus('Removed a peg.');
  }

  function bumpCapacity(delta) {
    capacity = Math.max(2, Math.min(10, capacity + delta));
    pegs = pegs.map((p) => p.slice(0, capacity));
    baseBoard = snapshotBoard();
    clearSolutionSilent();
    renderBoard();
    updateButtons();
  }

  function updateButtons() {
    $('deleteChipBtn').disabled = !(selectedPeg >= 0 && selectedSlot >= 0 && pegs[selectedPeg] && pegs[selectedPeg][selectedSlot]);
    $('removePegBtn').disabled = !pegs.length;
    const hasSol = solution.length > 0;
    $('playBtn').disabled = !hasSol;
    $('stepBtn').disabled = !hasSol || playIndex >= solution.length;
    $('resetBtn').disabled = !hasSol && !pegs.length;
    $('solveBtn').disabled = pegs.reduce((s, p) => s + p.length, 0) < 2;
  }

  function loadSample() {
    clearScanError();
    lastScanOk = true;
    palette = Color.namedSwatches();
    setBoard(SAMPLE.pegs, SAMPLE.capacity);
    setStatus('Sample board loaded. Solve it, or replace it with a photo.');
  }

  function newEmptyBoard() {
    clearScanError();
    lastScanOk = false;
    setBoard([[], [], [], []], 4);
    setStatus('Empty board. Paint chips onto pegs, then Solve.');
  }

  function revertInventedBoard() {
    lastScanOk = false;
    setBoard([], 4);
  }

  function imageToData(img, maxSide) {
    const max = maxSide || 480;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(16, Math.round(img.width * scale));
    const h = Math.max(16, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  function applyScan(result) {
    if (!result || !result.ok || Gate.isJunkScan(result)) {
      revertInventedBoard();
      showScanError(Gate.failReason(result));
      return false;
    }
    const prepped = ensureWorkingPegs(result.pegs, result.rows);
    const colors = result.colors || [];
    palette = Color.namedSwatches().concat(colors.filter((c) => Color.namedSwatches().indexOf(c) < 0));
    paintColor = colors[0] || paintColor;
    lastScanOk = true;
    setBoard(prepped.pegs, prepped.capacity);
    clearScanError();
    const note = result.trusted
      ? 'Scan read a ' + result.rows + '×' + result.cols + ' grid (' + result.chipCount + ' chips, ' + result.colorCount + ' colors). Solving…'
      : 'Scan is usable but noisy. Check chips/pegs, then Solve.';
    setStatus(note);
    if (result.trusted) solvePuzzle({ fromScan: true });
    return true;
  }

  function scanImage(img) {
    sourceImage = img;
    $('previewImg').src = img.src || img.toDataURL?.() || '';
    $('previewWrap').classList.add('show');
    const data = imageToData(img, 480);
    const result = Detect.detectBoard(data);
    applyScan(result);
  }

  function loadFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      scanImage(img);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      revertInventedBoard();
      showScanError('Could not open that file as an image. No board was invented.');
    };
    img.src = url;
  }

  function solvePuzzle(opts) {
    stopPlayback();
    const chips = pegs.reduce((s, p) => s + p.length, 0);
    if (chips < 2) {
      setStatus('Add chips before solving.', 'error');
      return;
    }
    baseBoard = snapshotBoard();
    const result = Solver.solve(pegs, capacity);
    if (!result.ok) {
      solution = [];
      playIndex = 0;
      $('solutionSection').classList.add('visible');
      $('moveLabel').textContent = '';
      setStatus(result.reason, 'error');
      updateButtons();
      return;
    }
    solution = result.moves;
    playIndex = 0;
    pegs = Solver.clonePegs(baseBoard.pegs);
    $('solutionSection').classList.add('visible');
    if (result.already) {
      $('moveLabel').textContent = 'Already sorted.';
      setStatus('Board is already sorted.');
    } else {
      $('moveLabel').textContent = '0 / ' + solution.length + ' moves';
      setStatus((opts && opts.fromScan ? 'Auto-solved in ' : 'Solved in ') + solution.length + ' moves. Play or step through them.');
    }
    renderBoard();
    updateButtons();
  }

  function showPlayState() {
    pegs = Solver.playTo(baseBoard.pegs, solution, playIndex);
    $('moveLabel').textContent = playIndex + ' / ' + solution.length + ' moves';
    if (playIndex > 0 && playIndex <= solution.length) {
      const mv = solution[playIndex - 1];
      setStatus('Moved ' + (mv.count || 1) + ' chip(s) peg ' + (mv.from + 1) + ' → peg ' + (mv.to + 1) + '.');
    }
    renderBoard();
    updateButtons();
  }

  function stepOnce() {
    if (!solution.length || playIndex >= solution.length) return;
    playIndex += 1;
    showPlayState();
    if (playIndex >= solution.length) {
      stopPlayback();
      setStatus('Done — chips are sorted.');
    }
  }

  function playSolution() {
    if (!solution.length) return;
    if (playIndex >= solution.length) {
      playIndex = 0;
      showPlayState();
    }
    stopPlayback();
    playTimer = setInterval(stepOnce, 420);
  }

  function resetPlay() {
    stopPlayback();
    pegs = Solver.clonePegs(baseBoard.pegs);
    playIndex = 0;
    if (solution.length) $('moveLabel').textContent = '0 / ' + solution.length + ' moves';
    setStatus('Reset to the starting board.');
    renderBoard();
    updateButtons();
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    $('cameraBox').classList.remove('show');
    const video = $('cameraVideo');
    video.srcObject = null;
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showScanError('Camera is not available in this browser. Use Photo instead.');
      return;
    }
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      const video = $('cameraVideo');
      video.srcObject = cameraStream;
      $('cameraBox').classList.add('show');
      setStatus('Point the camera at the full board, then Capture.');
    } catch (err) {
      revertInventedBoard();
      showScanError('Camera permission was denied or failed. No board was invented.');
    }
  }

  function captureCamera() {
    const video = $('cameraVideo');
    if (!video.videoWidth) {
      showScanError('Camera is not ready yet.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const img = new Image();
    img.onload = function () { scanImage(img); };
    img.src = canvas.toDataURL('image/jpeg', 0.92);
    stopCamera();
  }

  function bind() {
    $('fileInput').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      loadFile(f);
    });
    $('cameraBtn').addEventListener('click', startCamera);
    $('captureBtn').addEventListener('click', captureCamera);
    $('closeCamBtn').addEventListener('click', stopCamera);
    $('sampleBtn').addEventListener('click', loadSample);
    $('newBoardBtn').addEventListener('click', newEmptyBoard);
    $('addPegBtn').addEventListener('click', addPeg);
    $('removePegBtn').addEventListener('click', removePeg);
    $('tallerBtn').addEventListener('click', () => bumpCapacity(1));
    $('shorterBtn').addEventListener('click', () => bumpCapacity(-1));
    $('paintBtn').addEventListener('click', paintSelected);
    $('deleteChipBtn').addEventListener('click', deleteSelectedChip);
    $('solveBtn').addEventListener('click', () => solvePuzzle({}));
    $('playBtn').addEventListener('click', playSolution);
    $('stepBtn').addEventListener('click', stepOnce);
    $('resetBtn').addEventListener('click', resetPlay);
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    renderPalette();
    renderBoard();
    updateButtons();
    setStatus('Upload a photo or use the camera. Unreadable photos fail closed — nothing is invented.');
  });
})();
