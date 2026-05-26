/**
 * BrewVote — app.js
 *
 * Core vote flow:
 *  1. Load all coffees → GET  /api/coffees?sort=votes
 *  2. Vote             → POST /api/coffees/:id/vote
 *     • Backend atomically increments DB counter (Coffee.votes + 1)
 *     • Returns { id, name, votes } — frontend updates ONLY that card's count
 *     • Vote count bumps with CSS animation, no full page reload needed
 *  3. Unvote           → POST /api/coffees/:id/unvote
 *  4. Add coffee       → POST /api/coffees
 *  5. Delete coffee    → DELETE /api/coffees/:id
 *  6. Stats            → GET  /api/stats
 *  7. Podium           → top-3 from current list, re-rendered after each vote
 */

const API = 'http://127.0.0.1:8003';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const coffeeGrid   = document.getElementById('coffeeGrid');
const emptyState   = document.getElementById('emptyState');
const listCount    = document.getElementById('listCount');
const podiumEl     = document.getElementById('podium');
const hTotalVotes  = document.getElementById('hTotalVotes');
const hTopCoffee   = document.getElementById('hTopCoffee');
const sortBtns     = document.querySelectorAll('.sort-btn');
const btnAddCoffee = document.getElementById('btnAddCoffee');
const addModal     = document.getElementById('addModal');
const modalClose   = document.getElementById('modalClose');
const btnCancel    = document.getElementById('btnCancel');
const addCoffeeForm = document.getElementById('addCoffeeForm');
const emojiPicker  = document.getElementById('emojiPicker');
const toastEl      = document.getElementById('toast');

// ── State ─────────────────────────────────────────────────────────────────────
let coffees       = [];
let currentSort   = 'votes';
let selectedEmoji = '☕';
let toastTimer    = null;

// Per-card vote tracking (prevent rapid multi-click)
const voting = new Set();

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadCoffees();
  loadStats();
  setupListeners();
});

// ── Listeners ─────────────────────────────────────────────────────────────────
function setupListeners() {
  // Sort
  sortBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sortBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = btn.dataset.sort;
      loadCoffees();
    });
  });

  // Add modal
  btnAddCoffee.addEventListener('click', openAddModal);
  modalClose.addEventListener('click', closeAddModal);
  btnCancel.addEventListener('click', closeAddModal);
  addModal.addEventListener('click', e => { if (e.target === addModal) closeAddModal(); });

  // Emoji picker
  emojiPicker.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      emojiPicker.querySelectorAll('.emoji-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      selectedEmoji = btn.dataset.emoji;
    });
  });

  // Form submit
  addCoffeeForm.addEventListener('submit', handleAddCoffee);

  // Keyboard close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !addModal.hidden) closeAddModal();
  });
}

// ── Load coffees ──────────────────────────────────────────────────────────────
async function loadCoffees() {
  try {
    const res = await fetch(`${API}/api/coffees?sort=${currentSort}`);
    if (!res.ok) throw new Error();
    coffees = await res.json();
    renderGrid();
    renderPodium();
  } catch (_) {
    coffeeGrid.innerHTML = '';
    showToast('Cannot reach backend. Is it running on port 8003?', 'error');
  }
}

// ── Render grid ───────────────────────────────────────────────────────────────
function renderGrid() {
  // Remove skeletons
  coffeeGrid.querySelectorAll('.skeleton-card').forEach(s => s.remove());

  emptyState.hidden = coffees.length > 0;
  listCount.textContent = coffees.length === 1 ? '1 coffee' : `${coffees.length} coffees`;

  const maxVotes = coffees.reduce((m, c) => Math.max(m, c.votes), 1);
  const existingIds = new Set([...coffeeGrid.querySelectorAll('.coffee-card')].map(c => Number(c.dataset.id)));
  const newIds = new Set(coffees.map(c => c.id));

  // Remove deleted cards
  coffeeGrid.querySelectorAll('.coffee-card').forEach(card => {
    if (!newIds.has(Number(card.dataset.id))) card.remove();
  });

  // Add or update each card
  coffees.forEach((coffee, idx) => {
    const existing = coffeeGrid.querySelector(`[data-id="${coffee.id}"]`);
    if (existing) {
      updateCardVotes(existing, coffee, maxVotes, idx + 1);
    } else {
      const card = buildCoffeeCard(coffee, idx + 1, maxVotes);
      card.style.animationDelay = `${idx * 50}ms`;
      coffeeGrid.appendChild(card);
    }
  });
}

// ── Build a coffee card ───────────────────────────────────────────────────────
function buildCoffeeCard(coffee, rank, maxVotes) {
  const card = document.createElement('article');
  card.className = `coffee-card${rank <= 3 ? ` rank-${rank}` : ''}`;
  card.dataset.id = coffee.id;
  card.setAttribute('aria-label', `${coffee.name}, ${coffee.votes} votes`);
  card.innerHTML = coffeeCardHTML(coffee, rank, maxVotes);
  attachCardListeners(card, coffee);
  return card;
}

function coffeeCardHTML(c, rank, maxVotes) {
  const pct      = maxVotes > 0 ? Math.round((c.votes / maxVotes) * 100) : 0;
  const rankLabel = rank === 1 ? '🥇 #1' : rank === 2 ? '🥈 #2' : rank === 3 ? '🥉 #3' : `#${rank}`;
  const voteWord  = c.votes === 1 ? 'vote' : 'votes';

  return `
    <div class="card-rank">${rankLabel}</div>
    <div class="card-strip">
      ${esc(c.emoji)}
      <button class="card-del-btn" data-id="${c.id}" title="Remove" aria-label="Remove ${esc(c.name)}">✕</button>
    </div>
    <div class="card-body">
      <div class="card-name">${esc(c.name)}</div>
      <div class="card-meta">
        <span class="roast-badge roast-${esc(c.roast)}">${esc(c.roast)}</span>
        ${c.origin ? `<span class="origin-text">📍 ${esc(c.origin)}</span>` : ''}
        ${c.price ? `<span class="card-price">$${c.price.toFixed(2)}</span>` : ''}
      </div>
      ${c.description ? `<p class="card-desc">${esc(c.description)}</p>` : ''}
    </div>
    <div class="vote-bar-wrap">
      <div class="vote-bar-fill" style="width:${pct}%"></div>
    </div>
    <div class="card-footer">
      <div class="vote-display">
        <span class="vote-count" id="vcount-${c.id}">${c.votes}</span>
        <span class="vote-word">${voteWord}</span>
      </div>
      <div class="vote-btns">
        <button class="btn-unvote" data-id="${c.id}" title="Remove a vote" aria-label="Undo vote for ${esc(c.name)}" ${c.votes === 0 ? 'disabled' : ''}>−</button>
        <button class="btn-vote" data-id="${c.id}" aria-label="Vote for ${esc(c.name)}">
          <span class="vote-icon">☕</span>
          <span>Vote</span>
        </button>
      </div>
    </div>`;
}

function attachCardListeners(card, coffee) {
  card.querySelector('.btn-vote').addEventListener('click', () => handleVote(coffee.id, 'vote'));
  card.querySelector('.btn-unvote').addEventListener('click', () => handleVote(coffee.id, 'unvote'));
  card.querySelector('.card-del-btn').addEventListener('click', e => {
    e.stopPropagation();
    handleDelete(coffee.id, card);
  });
}

function updateCardVotes(card, coffee, maxVotes, rank) {
  // Update rank class
  card.className = `coffee-card${rank <= 3 ? ` rank-${rank}` : ''}`;
  const rankEl = card.querySelector('.card-rank');
  if (rankEl) {
    rankEl.textContent = rank === 1 ? '🥇 #1' : rank === 2 ? '🥈 #2' : rank === 3 ? '🥉 #3' : `#${rank}`;
  }

  // Vote count
  const vcountEl = card.querySelector(`#vcount-${coffee.id}`);
  if (vcountEl && vcountEl.textContent !== String(coffee.votes)) {
    vcountEl.textContent = coffee.votes;
  }

  // Word
  const vwordEl = card.querySelector('.vote-word');
  if (vwordEl) vwordEl.textContent = coffee.votes === 1 ? 'vote' : 'votes';

  // Bar
  const pct = maxVotes > 0 ? Math.round((coffee.votes / maxVotes) * 100) : 0;
  const barEl = card.querySelector('.vote-bar-fill');
  if (barEl) barEl.style.width = `${pct}%`;

  // Unvote disabled state
  const unvoteBtn = card.querySelector('.btn-unvote');
  if (unvoteBtn) unvoteBtn.disabled = coffee.votes === 0;
}

// ── Handle vote / unvote ──────────────────────────────────────────────────────
async function handleVote(coffeeId, action) {
  if (voting.has(coffeeId)) return;          // debounce rapid clicks
  voting.add(coffeeId);

  const card     = coffeeGrid.querySelector(`[data-id="${coffeeId}"]`);
  const voteBtn  = card?.querySelector('.btn-vote');
  const countEl  = card?.querySelector(`#vcount-${coffeeId}`);
  if (voteBtn)  voteBtn.disabled = true;

  try {
    /**
     * POST /api/coffees/:id/vote  (or /unvote)
     * Backend atomically does: Coffee.votes = Coffee.votes + 1
     * and commits. Returns { id, name, votes, message }.
     * We update ONLY the vote count on this card — no full reload.
     */
    const res = await fetch(`${API}/api/coffees/${coffeeId}/${action}`, { method: 'POST' });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();  // { id, name, votes, message }

    // Update local state
    const idx = coffees.findIndex(c => c.id === coffeeId);
    if (idx !== -1) coffees[idx].votes = data.votes;

    // Animate vote count bump
    if (countEl) {
      countEl.textContent = data.votes;
      if (action === 'vote') {
        countEl.classList.add('bump');
        setTimeout(() => countEl.classList.remove('bump'), 300);
      }
    }

    // Update vote bar and unvote button
    const maxVotes = coffees.reduce((m, c) => Math.max(m, c.votes), 1);
    const coffee   = coffees[idx];
    if (card && coffee) {
      const rank = coffees.indexOf(coffee) + 1;
      updateCardVotes(card, coffee, maxVotes, rank);
    }

    // Re-sort if sorted by votes
    if (currentSort === 'votes') {
      coffees.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
      reorderGrid();
      renderPodium();
    }

    loadStats();
    showToast(action === 'vote' ? `☕ Voted for ${data.name}!` : `Removed vote from ${data.name}`, 'success');

  } catch (err) {
    showToast(`Failed to ${action}: ${err.message}`, 'error');
  } finally {
    voting.delete(coffeeId);
    if (voteBtn) voteBtn.disabled = false;
  }
}

// Re-order existing DOM cards to match coffees[] order (no rebuild needed)
function reorderGrid() {
  const maxVotes = coffees.reduce((m, c) => Math.max(m, c.votes), 1);
  coffees.forEach((coffee, idx) => {
    const card = coffeeGrid.querySelector(`[data-id="${coffee.id}"]`);
    if (card) {
      coffeeGrid.appendChild(card);   // moves to end = new sorted position
      updateCardVotes(card, coffee, maxVotes, idx + 1);
    }
  });
}

// ── Podium ────────────────────────────────────────────────────────────────────
function renderPodium() {
  const top3 = [...coffees].sort((a, b) => b.votes - a.votes).slice(0, 3);
  if (top3.length === 0) { podiumEl.innerHTML = ''; return; }

  // Display order: 2nd | 1st | 3rd
  const orderedForDisplay = [top3[1], top3[0], top3[2]].filter(Boolean);
  const rankClasses = top3[1] ? ['rank-2', 'rank-1', 'rank-3'] : ['rank-1'];
  const medals = { 'rank-1': '🥇', 'rank-2': '🥈', 'rank-3': '🥉' };

  podiumEl.innerHTML = orderedForDisplay.map((c, i) => {
    const rk = rankClasses[i];
    return `
      <div class="podium-place ${rk}">
        <div class="podium-medal">${medals[rk]}</div>
        <div class="podium-emoji">${esc(c.emoji)}</div>
        <div class="podium-name">${esc(c.name)}</div>
        <div class="podium-votes">${c.votes} vote${c.votes !== 1 ? 's' : ''}</div>
        <div class="podium-bar"></div>
      </div>`;
  }).join('');
}

// ── Add coffee ────────────────────────────────────────────────────────────────
async function handleAddCoffee(e) {
  e.preventDefault();
  const name = document.getElementById('cfName').value.trim();
  if (!name) {
    document.getElementById('cfNameError').textContent = 'Name is required.';
    return;
  }
  document.getElementById('cfNameError').textContent = '';

  const payload = {
    name,
    origin:      document.getElementById('cfOrigin').value.trim(),
    roast:       document.getElementById('cfRoast').value,
    price:       parseFloat(document.getElementById('cfPrice').value) || 0,
    description: document.getElementById('cfDesc').value.trim(),
    emoji:       selectedEmoji,
  };

  document.getElementById('btnSubmit').disabled = true;

  try {
    const res = await fetch(`${API}/api/coffees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to add coffee');
    const newCoffee = await res.json();
    coffees.push(newCoffee);
    closeAddModal();
    renderGrid();
    renderPodium();
    loadStats();
    showToast(`☕ ${newCoffee.name} added!`, 'success');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    document.getElementById('btnSubmit').disabled = false;
  }
}

// ── Delete coffee ─────────────────────────────────────────────────────────────
async function handleDelete(coffeeId, card) {
  const coffee = coffees.find(c => c.id === coffeeId);
  if (!confirm(`Remove "${coffee?.name || 'this coffee'}"?`)) return;

  try {
    const res = await fetch(`${API}/api/coffees/${coffeeId}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error();
    coffees = coffees.filter(c => c.id !== coffeeId);
    card.style.transition = 'all 0.3s ease';
    card.style.opacity    = '0';
    card.style.transform  = 'scale(0.9)';
    setTimeout(() => { card.remove(); renderGrid(); renderPodium(); }, 300);
    loadStats();
    showToast(`${coffee?.name} removed.`, 'info');
  } catch (_) {
    showToast('Failed to delete.', 'error');
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await fetch(`${API}/api/stats`);
    if (!res.ok) return;
    const s = await res.json();
    hTotalVotes.textContent = s.total_votes.toLocaleString();
    hTopCoffee.textContent  = s.top_coffee || '—';
  } catch (_) {}
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function openAddModal() {
  addCoffeeForm.reset();
  document.getElementById('cfNameError').textContent = '';
  selectedEmoji = '☕';
  emojiPicker.querySelectorAll('.emoji-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-pressed', 'false');
  });
  emojiPicker.querySelector('[data-emoji="☕"]').classList.add('active');
  addModal.hidden = false;
  document.body.style.overflow = 'hidden';
  document.getElementById('cfName').focus();
}

function closeAddModal() {
  addModal.hidden = true;
  document.body.style.overflow = '';
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  toastEl.textContent = msg;
  toastEl.className   = `toast ${type} visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 3000);
}

// ── XSS helper ────────────────────────────────────────────────────────────────
function esc(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
