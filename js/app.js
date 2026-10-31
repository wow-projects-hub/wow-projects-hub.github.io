(() => {
  'use strict';

  const DATA_URL = 'data/projects.json';
  const PLACEHOLDER = 'assets/placeholder.svg';

  const EXPANSION_ORDER = [
    'Vanilla', 'TBC', 'WotLK', 'Cataclysm', 'MoP', 'WoD', 'Legion',
    'BfA', 'Shadowlands', 'Dragonflight', 'Multiple', 'Other'
  ];
  // Category tabs at the top, in display order. `type` must match projects.json.
  const CATEGORIES = [
    { type: 'Private Server', label: 'Private Servers', slug: 'servers' },
    { type: 'Server Emulator', label: 'Server Emulators', slug: 'emulators' },
    { type: 'Playable Project', label: 'Playable Projects', slug: 'playable' },
    { type: 'Misc', label: 'Misc', slug: 'misc' }
  ];
  const STATUS_ORDER = ['Online', 'Upcoming', 'Offline', 'Unknown'];
  const SORTS = ['name-asc', 'name-desc', 'date-desc', 'date-asc', 'expansion'];
  const VIEWS = ['grid', 'list'];
  const FILTER_KEYS = ['expansion', 'region', 'language', 'status'];

  const $ = (sel) => document.querySelector(sel);
  const els = {
    search: $('#search'),
    sort: $('#sort'),
    results: $('#results'),
    count: $('#result-count'),
    reset: $('#reset'),
    emptyReset: $('#empty-reset'),
    empty: $('#empty-state'),
    chips: $('#tag-chips'),
    tabs: $('#cat-tabs'),
    template: $('#card-template'),
    filterToggle: $('#filter-toggle'),
    filterPanel: $('#filter-panel'),
    filterCount: $('#filter-count'),
    viewButtons: document.querySelectorAll('[data-view]'),
    selects: Object.fromEntries(FILTER_KEYS.map((k) => [k, document.querySelector(`select[data-filter="${k}"]`)]))
  };

  let projects = [];
  const state = defaultState();

  function defaultState() {
    return {
      q: '',
      type: '',
      expansion: '', region: '', language: '', status: '',
      tags: [],
      sort: 'name-asc',
      view: 'grid'
    };
  }

  /* ---------- URL state ---------- */

  function readUrl() {
    const p = new URLSearchParams(window.location.search);
    state.q = p.get('q') || '';
    const cat = CATEGORIES.find((c) => c.slug === p.get('cat'));
    state.type = cat ? cat.type : '';
    FILTER_KEYS.forEach((k) => { state[k] = p.get(k) || ''; });
    state.tags = (p.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean);
    state.sort = SORTS.includes(p.get('sort')) ? p.get('sort') : 'name-asc';
    state.view = VIEWS.includes(p.get('view')) ? p.get('view') : 'grid';
  }

  function writeUrl() {
    const p = new URLSearchParams();
    const cat = CATEGORIES.find((c) => c.type === state.type);
    if (cat) p.set('cat', cat.slug);
    if (state.q) p.set('q', state.q);
    FILTER_KEYS.forEach((k) => { if (state[k]) p.set(k, state[k]); });
    if (state.tags.length) p.set('tags', state.tags.join(','));
    if (state.sort !== 'name-asc') p.set('sort', state.sort);
    if (state.view !== 'grid') p.set('view', state.view);
    const qs = p.toString();
    const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    window.history.replaceState(null, '', url);
  }

  /* ---------- Helpers ---------- */

  function orderedUnique(values, order) {
    const set = [...new Set(values.filter(Boolean))];
    return set.sort((a, b) => {
      const ia = order ? order.indexOf(a) : -1;
      const ib = order ? order.indexOf(b) : -1;
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.localeCompare(b);
    });
  }

  function initials(title) {
    const words = title.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  // Deterministic hue in a narrow blue–violet band so placeholders stay on-theme.
  function hueFor(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return 225 + (h % 40);
  }

  function slugClass(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  const CUSTOM_LABELS = { Yes: 'Custom content', Some: 'Some custom content', No: 'Blizzlike' };

  // 16800 -> "~16,800 online"; missing -> "Players: ?"
  function formatPlayers(n) {
    if (typeof n !== 'number') return 'Players: ?';
    // Small counts stay exact so "4" does not round down to "~0".
    const rounded = n >= 1000 ? Math.round(n / 100) * 100 : n >= 50 ? Math.round(n / 10) * 10 : n;
    return `~${rounded.toLocaleString('en-US')} online`;
  }

  function expansionRank(exp) {
    const i = EXPANSION_ORDER.indexOf(exp);
    return i === -1 ? EXPANSION_ORDER.length : i;
  }

  /* ---------- Filter UI ---------- */

  function buildTabs() {
    const tabs = [{ type: '', label: 'All' }, ...CATEGORIES];
    tabs.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-tab';
      btn.dataset.type = c.type;
      btn.setAttribute('aria-pressed', 'false');
      const label = document.createElement('span');
      label.textContent = c.label;
      const count = document.createElement('span');
      count.className = 'cat-count';
      btn.append(label, count);
      els.tabs.appendChild(btn);
    });
  }

  function buildFilterOptions() {
    const orders = { expansion: EXPANSION_ORDER, status: STATUS_ORDER };
    FILTER_KEYS.forEach((key) => {
      const select = els.selects[key];
      const values = orderedUnique(projects.map((p) => p[key]), orders[key]);
      values.forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        select.appendChild(opt);
      });
      // Drop URL values that don't exist in the data.
      if (state[key] && !values.includes(state[key])) state[key] = '';
    });

    const allTags = orderedUnique(projects.flatMap((p) => p.tags || []));
    state.tags = state.tags.filter((t) => allTags.includes(t));
    allTags.forEach((tag) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.dataset.tag = tag;
      btn.textContent = tag;
      btn.setAttribute('aria-pressed', 'false');
      els.chips.appendChild(btn);
    });
  }

  function syncControls() {
    els.search.value = state.q;
    els.sort.value = state.sort;
    FILTER_KEYS.forEach((k) => { els.selects[k].value = state[k]; });
    els.tabs.querySelectorAll('.cat-tab').forEach((tab) => {
      const active = tab.dataset.type === state.type;
      tab.setAttribute('aria-pressed', String(active));
      // On narrow screens the tabs scroll sideways; keep the active one visible.
      if (active && els.tabs.scrollWidth > els.tabs.clientWidth) {
        els.tabs.scrollLeft = tab.offsetLeft - els.tabs.offsetLeft - 16;
      }
    });
    els.chips.querySelectorAll('.chip').forEach((chip) => {
      chip.setAttribute('aria-pressed', String(state.tags.includes(chip.dataset.tag)));
    });
    els.viewButtons.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.view === state.view));
    });
    els.results.classList.toggle('grid', state.view === 'grid');
    els.results.classList.toggle('list', state.view === 'list');
  }

  function activeFilterCount() {
    return FILTER_KEYS.filter((k) => state[k]).length + state.tags.length;
  }

  /* ---------- Filtering & sorting ---------- */

  // Everything except the category; the tabs use this to show their counts.
  function matchesFilters(p) {
    if (state.q) {
      const q = state.q.toLowerCase();
      const hay = [p.title, p.description, p.version, p.platform, ...(p.tags || [])].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((term) => hay.includes(term))) return false;
    }
    for (const k of FILTER_KEYS) {
      if (state[k] && p[k] !== state[k]) return false;
    }
    if (state.tags.length && !state.tags.every((t) => (p.tags || []).includes(t))) return false;
    return true;
  }

  function compare(a, b) {
    // Closed projects always go to the end, whatever the sort order.
    const offline = (a.status === 'Offline') - (b.status === 'Offline');
    if (offline) return offline;
    const byName = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    switch (state.sort) {
      case 'name-desc': return -byName;
      case 'date-desc': return (b.addedAt || '').localeCompare(a.addedAt || '') || byName;
      case 'date-asc': return (a.addedAt || '').localeCompare(b.addedAt || '') || byName;
      case 'expansion': return expansionRank(a.expansion) - expansionRank(b.expansion) || byName;
      default: return byName;
    }
  }

  /* ---------- Rendering ---------- */

  function renderMedia(container, p) {
    if (p.image) {
      // Logos sit centred on a tinted panel; screenshots fill the frame.
      if (p.imageFit === 'contain') {
        container.classList.add('is-logo');
        container.style.setProperty('--ph-hue', hueFor(p.id || p.title));
      }
      const img = document.createElement('img');
      img.src = p.image;
      img.alt = `${p.title} logo`;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => {
        img.src = PLACEHOLDER;
        img.alt = '';
      }, { once: true });
      container.appendChild(img);
      return;
    }
    const hue = hueFor(p.id || p.title);
    const ph = document.createElement('div');
    ph.className = 'placeholder';
    ph.style.setProperty('--ph-hue', hue);
    ph.setAttribute('aria-hidden', 'true');
    ph.textContent = initials(p.title);
    container.appendChild(ph);
  }

  function addBadge(list, label, value, extraClass) {
    // "Unknown" only means something on the status badge.
    if (!value || (value === 'Unknown' && label !== 'Status')) return;
    const li = document.createElement('li');
    li.className = `badge ${extraClass || ''}`.trim();
    li.title = label;
    li.textContent = value;
    const sr = document.createElement('span');
    sr.className = 'visually-hidden';
    sr.textContent = `${label}: `;
    li.prepend(sr);
    list.appendChild(li);
  }

  function renderCard(p) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    renderMedia(node.querySelector('.card-media'), p);
    node.querySelector('.card-title').textContent = p.title;
    const desc = node.querySelector('.card-desc');
    desc.textContent = p.description || '';
    desc.title = p.description || '';

    const badges = node.querySelector('.badges');
    if (p.type === 'Private Server') {
      addBadge(badges, 'Status', p.status, `status status-${slugClass(p.status || 'unknown')}`);
      addBadge(badges, 'Version', p.version, 'badge-accent');
      if (p.status !== 'Offline') {
        const source = p.playersNote ? `, ${p.playersNote}` : '';
        addBadge(badges, `Players online (checked ${p.playersCheckedAt || 'unknown date'}${source})`, formatPlayers(p.players));
      }
      addBadge(badges, 'Custom content', CUSTOM_LABELS[p.customContent] || 'Custom content: ?');
      if (p.language && p.language !== 'English') addBadge(badges, 'Language', p.language);
    } else {
      if (p.status === 'Upcoming') addBadge(badges, 'Status', p.status, 'status status-upcoming');
      addBadge(badges, 'Version', p.version, 'badge-accent');
      addBadge(badges, 'Platform', p.platform);
    }

    const link = node.querySelector('.visit');
    link.href = p.url;
    link.setAttribute('aria-label', `Visit ${p.title} (opens in a new tab)`);
    return node;
  }

  function render() {
    const filtered = projects.filter(matchesFilters);
    const visible = filtered.filter((p) => !state.type || p.type === state.type).sort(compare);

    const frag = document.createDocumentFragment();
    visible.forEach((p) => frag.appendChild(renderCard(p)));
    els.results.replaceChildren(frag);

    els.tabs.querySelectorAll('.cat-tab').forEach((tab) => {
      const n = tab.dataset.type ? filtered.filter((p) => p.type === tab.dataset.type).length : filtered.length;
      tab.querySelector('.cat-count').textContent = String(n);
    });

    const total = state.type ? projects.filter((p) => p.type === state.type).length : projects.length;
    els.count.textContent = `${visible.length} of ${total} project${total === 1 ? '' : 's'}`;
    els.empty.hidden = visible.length > 0;
    els.results.hidden = visible.length === 0;

    const n = activeFilterCount();
    els.reset.disabled = n === 0 && !state.q;
    els.filterCount.hidden = n === 0;
    els.filterCount.textContent = n ? String(n) : '';

    syncControls();
    writeUrl();
  }

  /* ---------- Events ---------- */

  function resetFilters() {
    const { type, sort, view } = state;
    Object.assign(state, defaultState(), { type, sort, view });
    render();
    els.search.focus();
  }

  function bindEvents() {
    let t;
    els.search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { state.q = els.search.value.trim(); render(); }, 120);
    });

    els.sort.addEventListener('change', () => { state.sort = els.sort.value; render(); });

    FILTER_KEYS.forEach((k) => {
      els.selects[k].addEventListener('change', () => { state[k] = els.selects[k].value; render(); });
    });

    els.tabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.cat-tab');
      if (!tab) return;
      state.type = tab.dataset.type;
      render();
    });

    els.chips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const tag = chip.dataset.tag;
      state.tags = state.tags.includes(tag) ? state.tags.filter((x) => x !== tag) : [...state.tags, tag];
      render();
    });

    els.viewButtons.forEach((btn) => {
      btn.addEventListener('click', () => { state.view = btn.dataset.view; render(); });
    });

    els.reset.addEventListener('click', resetFilters);
    els.emptyReset.addEventListener('click', resetFilters);

    els.filterToggle.addEventListener('click', () => {
      const open = els.filterToggle.getAttribute('aria-expanded') === 'true';
      els.filterToggle.setAttribute('aria-expanded', String(!open));
      els.filterPanel.classList.toggle('open', !open);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.filterPanel.classList.contains('open')) {
        els.filterToggle.click();
        els.filterToggle.focus();
      }
    });
  }

  /* ---------- Init ---------- */

  async function init() {
    readUrl();
    buildTabs();
    bindEvents();
    try {
      const res = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      projects = Array.isArray(data) ? data.filter((p) => p && p.title && p.url) : [];
    } catch (err) {
      els.count.textContent = 'Could not load the project list. Please try again later.';
      return;
    }
    buildFilterOptions();
    render();
  }

  init();
})();
