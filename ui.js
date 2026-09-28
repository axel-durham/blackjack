import { isRed } from './engine/cards.js';
import { settings } from './store.js';
import { signed } from './engine/count.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : String(kid));
  }
  return el;
}

const RANK_LABEL = { T: '10' };
// Views re-render whole tables; only animate a card the first time it is drawn face up.
const drawn = new WeakSet();

export function cardEl(card, { hidden = false, size = '' } = {}) {
  if (hidden || !card) return h('div', { class: `card back ${size}`, 'aria-label': 'face-down card' });
  const r = RANK_LABEL[card.rank] ?? card.rank;
  const fresh = !drawn.has(card);
  drawn.add(card);
  return h('div', { class: `card ${size} ${isRed(card) ? 'red' : ''} ${fresh ? 'fresh' : ''}`, 'aria-label': `${r}${card.suit}` },
    h('span', { class: 'r' }, r), h('span', { class: 's-small' }, card.suit), h('span', { class: 's' }, card.suit));
}

export function cardsEl(cards, opts = {}) {
  return h('div', { class: `cards ${opts.overlap ? 'overlap' : ''}` },
    cards.map((c, i) => cardEl(c, { size: opts.size, hidden: opts.hideIndex === i })));
}

export function seg(options, value, onPick, label = '') {
  return h('div', { class: 'seg', role: 'group', 'aria-label': label },
    options.map(([v, text]) => h('button', {
      'aria-pressed': String(v === value),
      onclick: () => onPick(v),
    }, text)));
}

export function buzz(ms = 60) {
  if (settings.haptics && navigator.vibrate) navigator.vibrate(ms);
}

let toastTimer;
export function toast(content, good = false, ms = 3200) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: `toast ${good ? 'good' : ''}`, role: 'status', onclick: () => el.remove() }, content);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), ms);
}

// Signed-integer keypad (iOS number pads have no minus key).
export function keypad({ question = 'Running count', onSubmit, submitLabel = 'Check' }) {
  let neg = false;
  let digits = '';
  const val = h('span', { class: 'val empty' }, '?');
  const display = h('div', { class: 'kp-display' }, h('span', { class: 'q' }, question), val);
  const render = () => {
    const empty = digits === '';
    val.className = `val ${empty ? 'empty' : ''}`;
    val.textContent = empty ? (neg ? '−' : '?') : signed(neg ? -Number(digits) : Number(digits));
  };
  const press = (k) => {
    if (k === '±') neg = !neg;
    else if (k === '⌫') digits = digits.slice(0, -1);
    else if (digits.length < 3) digits = digits === '0' ? k : digits + k;
    render();
  };
  const submit = () => {
    if (digits === '') return;
    onSubmit(neg ? -Number(digits) : Number(digits));
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '±', '0', '⌫'];
  const pad = h('div', { class: 'keypad' },
    keys.map((k) => h('button', { onclick: () => press(k), 'aria-label': k === '±' ? 'toggle sign' : k === '⌫' ? 'delete' : k }, k)),
    h('button', { class: 'enter', onclick: submit }, submitLabel));
  const onKey = (e) => {
    if (!pad.isConnected) return document.removeEventListener('keydown', onKey);
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === '-' || e.key === '+') press('±');
    else if (e.key === 'Backspace') press('⌫');
    else if (e.key === 'Enter') submit();
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, display, pad);
}

// Discard tray: how many decks have been played out of the shoe.
export function trayEl(decksPlayed, totalDecks, { caption = true, compact = false } = {}) {
  const inner = compact ? 44 : 84;
  const box = h('div', { class: 'tray-box', 'aria-hidden': 'true', style: { height: `${inner + 4}px` } });
  const frac = Math.min(1, decksPlayed / totalDecks);
  box.append(h('div', { class: 'tray-fill', style: { height: `${frac * inner}px` } }));
  for (let d = 1; d < totalDecks; d++) {
    box.append(h('div', { class: 'tray-tick', style: { bottom: `${2 + (d / totalDecks) * inner}px` } }));
  }
  return h('div', { class: 'tray', 'aria-label': `Discard tray: about ${decksPlayed} of ${totalDecks} decks played` },
    box,
    caption && h('div', { class: 'tray-cap' }, 'Discard', h('br'), `tray · ${totalDecks}D shoe`));
}

export const ACTION_KEYS = { h: 'H', s: 'S', d: 'D', p: 'P', r: 'R' };

// Keyboard shortcuts for action buttons while `root` is mounted.
export function bindKeys(root, handler) {
  const onKey = (e) => {
    if (!root.isConnected) return document.removeEventListener('keydown', onKey);
    if (e.metaKey || e.ctrlKey || e.target.closest?.('input,select,textarea,dialog[open]')) return;
    if (handler(e.key.toLowerCase()) === true) e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
}
