/* Expense report wizard: steps, receipt entries, settings, and output. */
(function () {
  'use strict';

  const CFG = window.APP_CONFIG;
  const { esc, money, rate } = Report;
  const $ = (sel, root = document) => root.querySelector(sel);
  const SETTINGS_KEY = 'simExpenseReport.settings';

  // ---------- settings (only thing kept between visits) ----------
  function loadSettings() {
    const s = { ...CFG.defaults };
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (saved) {
        if (+saved.perDiemRate >= 0) s.perDiemRate = +saved.perDiemRate;
        if (+saved.mileageRate >= 0) s.mileageRate = +saved.mileageRate;
      }
    } catch (e) { /* storage unavailable, use defaults */ }
    return s;
  }
  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
  }
  let settings = loadSettings();

  // ---------- state ----------
  const STEPS = [
    { id: 'trip', label: 'Trip Details' },
    ...CFG.categories.map((c) => ({ id: 'cat', label: c.label, section: 'company', cat: c })),
    { id: 'personal', label: 'Personal Expenses', section: 'personal' },
    { id: 'perdiem', label: 'Per Diem & Mileage' },
    { id: 'report', label: 'Report' }
  ];

  function freshState() {
    return {
      step: 0, maxStep: 0,
      header: { name: '', client: '', start: '', end: '' },
      entries: [],
      perDiemDays: '', mileageYes: null, miles: ''
    };
  }
  let state = freshState();
  let nextId = 1;
  let logo = null; // { dataUrl, ratio, format }

  // ---------- small UI helpers ----------
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  function modal({ title, body, buttons, wide }) {
    return new Promise((resolve) => {
      const root = $('#modalRoot');
      root.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
            <h2 id="modalTitle">${esc(title)}</h2>
            <div class="modal-body">${body}</div>
            <div class="modal-actions">${buttons.map((b, i) => `<button type="button" class="btn ${b.kind || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
          </div>
        </div>`;
      const close = (v) => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onKey);
      root.querySelectorAll('.modal-actions .btn').forEach((btn) => {
        btn.addEventListener('click', () => close(buttons[+btn.dataset.i].value));
      });
      $('.modal-backdrop', root).addEventListener('click', (e) => { if (e.target.classList.contains('modal-backdrop')) close(null); });
      const primary = root.querySelector('.btn.primary') || root.querySelector('.modal-actions .btn');
      if (primary) primary.focus();
      if (typeof wide === 'function') wide(root);
    });
  }

  // ---------- stepper ----------
  function renderStepper() {
    const nav = $('#stepper');
    nav.innerHTML = '<ol>' + STEPS.map((s, i) => {
      const cls = i === state.step ? 'current' : i < state.step || i <= state.maxStep ? 'done' : '';
      const clickable = i <= state.maxStep && i !== state.step;
      return `<li class="${cls}"><button type="button" data-step="${i}" ${clickable ? '' : 'disabled'}>
        <span class="dot">${i + 1}</span><span class="lbl">${esc(s.label)}</span></button></li>`;
    }).join('') + '</ol>';
    nav.querySelectorAll('button[data-step]').forEach((b) => b.addEventListener('click', () => goTo(+b.dataset.step)));
  }

  function goTo(i) {
    state.step = i;
    state.maxStep = Math.max(state.maxStep, i);
    renderStepper();
    renderStep();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function navButtons(nextLabel) {
    return `<div class="nav-row">
      ${state.step > 0 ? '<button type="button" class="btn" id="backBtn">Back</button>' : '<span></span>'}
      <button type="button" class="btn primary" id="nextBtn">${esc(nextLabel || 'Next')}</button>
    </div>`;
  }
  function wireNav(onNext) {
    const back = $('#backBtn');
    if (back) back.addEventListener('click', () => goTo(state.step - 1));
    $('#nextBtn').addEventListener('click', onNext);
  }

  // ---------- step rendering ----------
  function renderStep() {
    const s = STEPS[state.step];
    if (s.id === 'trip') return renderTrip();
    if (s.id === 'cat' || s.id === 'personal') return renderSection(s);
    if (s.id === 'perdiem') return renderPerDiem();
    if (s.id === 'report') return renderReport();
  }

  // Step: trip details
  function renderTrip() {
    const h = state.header;
    $('#main').innerHTML = `
      <section class="card">
        <p class="eyebrow">Step 1</p>
        <h1>Trip details</h1>
        <p class="lead">This goes at the top of the report.</p>
        <form id="tripForm" class="form-grid" novalidate>
          <label>Your name<input name="name" type="text" autocomplete="name" value="${esc(h.name)}" required></label>
          <label>Client<input name="client" type="text" value="${esc(h.client)}" required placeholder="Who are you billing / working with?"></label>
          <label>Trip start<input name="start" type="date" value="${esc(h.start)}" required></label>
          <label>Trip end<input name="end" type="date" value="${esc(h.end)}" required></label>
        </form>
        ${navButtons()}
      </section>`;
    const form = $('#tripForm');
    form.addEventListener('input', (e) => { h[e.target.name] = e.target.value.trim(); e.target.classList.remove('flag'); });
    form.addEventListener('submit', (e) => e.preventDefault());
    wireNav(() => {
      let ok = true;
      ['name', 'client', 'start', 'end'].forEach((k) => {
        const el = form.elements[k];
        h[k] = el.value.trim();
        if (!h[k]) { el.classList.add('flag'); ok = false; }
      });
      if (!ok) return toast('Please fill in all four fields.');
      if (h.end < h.start) { form.elements.end.classList.add('flag'); return toast('Trip end is before trip start.'); }
      goTo(state.step + 1);
    });
  }

  // Step: a receipt section (company card category or personal)
  function sectionEntries(s) {
    return state.entries.filter((e) => e.section === s.section && (s.section === 'personal' || e.category === s.cat.key));
  }

  function renderSection(s) {
    const personal = s.section === 'personal';
    const title = personal ? 'Personal expenses' : s.cat.label;
    const help = personal
      ? 'Anything you paid for yourself that needs to be repaid. Pick a category for each one.'
      : s.cat.help;
    $('#main').innerHTML = `
      <section class="card">
        <p class="eyebrow">${personal ? 'Paid personally' : 'Company card'} &middot; Step ${state.step + 1}</p>
        <h1>${esc(title)}</h1>
        <p class="lead">${esc(help)}</p>
        <label class="dropzone" id="dropzone">
          <input type="file" id="fileInput" multiple accept="image/*,.pdf,application/pdf">
          <span class="dz-title">Drop receipts here or click to choose files</span>
          <span class="dz-sub">PDFs and photos. You can pick several at once.</span>
        </label>
        <div class="entries" id="entries"></div>
        <div class="section-foot">
          <button type="button" class="btn ghost" id="manualBtn">+ Add manually</button>
          <div class="section-total">Section total <strong id="sectionTotal">$0.00</strong></div>
        </div>
        ${navButtons()}
      </section>`;

    Extract.warmUp();
    const list = $('#entries');
    sectionEntries(s).forEach((e) => list.appendChild(entryCard(e)));
    updateSectionTotal(s);
    updateNextLabel(s);

    const input = $('#fileInput');
    input.addEventListener('change', () => { addFiles(s, input.files); input.value = ''; });
    const dz = $('#dropzone');
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', (e) => addFiles(s, e.dataTransfer.files));

    $('#manualBtn').addEventListener('click', () => {
      const e = newEntry(s, null);
      e.status = 'manual'; e.message = '';
      state.entries.push(e);
      const card = entryCard(e);
      list.appendChild(card);
      updateNextLabel(s);
      const first = card.querySelector('input[data-f="date"]');
      if (first) first.focus();
    });

    wireNav(() => validateSection(s));
  }

  function updateNextLabel(s) {
    const btn = $('#nextBtn');
    if (btn) btn.textContent = sectionEntries(s).length ? 'Next' : 'Nothing to add, skip';
  }

  function updateSectionTotal(s) {
    const el = $('#sectionTotal');
    if (el) el.textContent = money(sectionEntries(s).reduce((t, e) => t + (+e.amount || 0), 0));
  }

  function newEntry(s, file) {
    return {
      id: nextId++, section: s.section,
      category: s.section === 'personal' ? '' : s.cat.key,
      file, date: '', vendor: '', amount: '',
      status: file ? 'queued' : 'manual', message: file ? 'Waiting to read…' : '',
      flags: {}, text: '', thumb: ''
    };
  }

  function addFiles(s, fileList) {
    const files = Array.from(fileList || []).filter((f) => /^image\//.test(f.type) || f.type === 'application/pdf' || /\.(pdf|jpe?g|png|webp|gif|bmp|heic)$/i.test(f.name));
    if (!files.length) return toast('Those files are not images or PDFs.');
    const list = $('#entries');
    files.forEach((f) => {
      const e = newEntry(s, f);
      state.entries.push(e);
      list.appendChild(entryCard(e));
    });
    updateNextLabel(s);
    processQueue();
  }

  // ---------- reading queue (one at a time, OCR is heavy) ----------
  let busy = false;
  async function processQueue() {
    if (busy) return;
    busy = true;
    try {
      let e;
      while ((e = state.entries.find((x) => x.status === 'queued'))) {
        e.status = 'reading'; e.message = 'Reading receipt…';
        refreshCard(e);
        try {
          const cat = e.category || '';
          const res = await Extract.readReceipt(e.file, cat);
          if (!state.entries.includes(e)) continue; // removed while reading
          e.thumb = res.thumb; e.text = res.text;
          const f = res.fields;
          const only = e.fillEmptyOnly;
          if (!only || !e.date) e.date = f.date.value || '';
          if (!only || !e.vendor) e.vendor = f.vendor.value || '';
          if (!only || e.amount === '' || e.amount == null) e.amount = f.amount.value != null ? f.amount.value.toFixed(2) : '';
          if (e.section === 'personal' && !e.category) e.category = Extract.guessCategory(e.vendor) || '';
          e.flags = {
            date: f.date.conf !== 'ok' || !e.date,
            vendor: f.vendor.conf !== 'ok' || !e.vendor,
            amount: f.amount.conf !== 'ok' || e.amount === ''
          };
          if (e.section === 'personal' && !e.category) e.flags.category = true;
          e.status = res.status; e.message = res.message;
          if (only) { e.status = 'ok'; e.message = 'Receipt attached.'; e.flags = {}; }
        } catch (err) {
          console.error(err);
          e.status = 'fail';
          e.message = "Couldn't read this file. Please enter the details manually.";
          e.flags = { date: !e.date, vendor: !e.vendor, amount: !e.amount };
          if (!e.vendor && e.file) {
            const p = Extract.parse('', e.file.name, e.category);
            e.vendor = p.vendor.value; e.flags.vendor = !e.vendor;
          }
        }
        e.fillEmptyOnly = false;
        refreshCard(e);
      }
    } finally { busy = false; }
  }

  // ---------- entry cards ----------
  const BADGES = {
    queued: ['Waiting', 'muted'], reading: ['Reading', 'muted'], ok: ['Read', 'ok'],
    check: ['Check', 'warn'], fail: ['Enter manually', 'bad'], manual: ['Manual entry', 'muted']
  };

  function entryCard(e) {
    const div = document.createElement('div');
    div.className = 'entry';
    div.dataset.id = e.id;
    fillCard(div, e);
    return div;
  }

  function refreshCard(e) {
    const card = document.querySelector(`.entry[data-id="${e.id}"]`);
    if (card) fillCard(card, e);
    const s = STEPS[state.step];
    if (s.section) updateSectionTotal(s);
  }

  function fillCard(div, e) {
    const busyNow = e.status === 'queued' || e.status === 'reading';
    const [badge, tone] = BADGES[e.status] || BADGES.manual;
    const fl = (k) => (e.flags && e.flags[k] ? 'flag' : '');
    const catSelect = e.section === 'personal'
      ? `<label>Category<select data-f="category" class="${fl('category')}" ${busyNow ? 'disabled' : ''}>
          <option value="">Choose…</option>
          ${CFG.categories.map((c) => `<option ${c.key === e.category ? 'selected' : ''}>${esc(c.key)}</option>`).join('')}
        </select></label>` : '';
    div.className = `entry status-${e.status}`;
    div.innerHTML = `
      <button type="button" class="entry-thumb" data-act="preview" ${e.file ? '' : 'disabled'} aria-label="View receipt">
        ${e.thumb ? `<img src="${e.thumb}" alt="">` : busyNow ? '<span class="spinner"></span>' : `<span class="no-file">${e.file ? 'File' : 'No receipt'}</span>`}
      </button>
      <div class="entry-body">
        <div class="entry-top">
          <span class="entry-file" title="${esc(e.file ? e.file.name : '')}">${esc(e.file ? e.file.name : 'Manual entry')}</span>
          <span class="badge ${tone}">${badge}</span>
          <button type="button" class="link danger" data-act="remove">Remove</button>
        </div>
        <div class="entry-fields ${e.section === 'personal' ? 'four' : ''}">
          <label>Date<input type="date" data-f="date" value="${esc(e.date)}" class="${fl('date')}" ${busyNow ? 'disabled' : ''}></label>
          <label>Vendor<input type="text" data-f="vendor" value="${esc(e.vendor)}" class="${fl('vendor')}" ${busyNow ? 'disabled' : ''}></label>
          ${catSelect}
          <label>Amount<span class="money-input"><span>$</span><input type="number" inputmode="decimal" step="0.01" min="0" data-f="amount" value="${esc(e.amount)}" class="${fl('amount')}" ${busyNow ? 'disabled' : ''}></span></label>
        </div>
        <div class="entry-msg">
          ${e.message ? `<span class="${tone}">${esc(e.message)}</span>` : ''}
          ${!e.file && !busyNow ? '<button type="button" class="link" data-act="attach">Attach a receipt</button><input type="file" hidden accept="image/*,.pdf,application/pdf" data-act="attachInput">' : ''}
        </div>
        ${e.text ? `<details class="raw"><summary>What the app read</summary><pre>${esc(e.text.slice(0, 4000))}</pre></details>` : ''}
      </div>`;

    div.querySelectorAll('[data-f]').forEach((el) => {
      el.addEventListener('input', () => {
        const k = el.dataset.f;
        e[k] = el.value;
        el.classList.remove('flag');
        if (e.flags) e.flags[k] = false;
        if (k === 'amount') { const s = STEPS[state.step]; if (s.section) updateSectionTotal(s); }
      });
      el.addEventListener('change', () => {
        if (el.dataset.f === 'amount' && el.value !== '' && !isNaN(+el.value)) { el.value = (+el.value).toFixed(2); e.amount = el.value; }
      });
    });
    const rm = div.querySelector('[data-act="remove"]');
    rm.addEventListener('click', () => {
      state.entries = state.entries.filter((x) => x !== e);
      div.remove();
      const s = STEPS[state.step];
      if (s.section) { updateSectionTotal(s); updateNextLabel(s); }
    });
    const pv = div.querySelector('[data-act="preview"]');
    if (e.file) pv.addEventListener('click', () => showPreview(e));
    const at = div.querySelector('[data-act="attach"]');
    if (at) {
      const inp = div.querySelector('[data-act="attachInput"]');
      at.addEventListener('click', () => inp.click());
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        e.file = f; e.status = 'queued'; e.message = 'Waiting to read…'; e.fillEmptyOnly = true;
        refreshCard(e);
        processQueue();
      });
    }
  }

  async function showPreview(e) {
    const p = modal({
      title: e.file.name,
      body: '<div class="preview" id="previewBox"><span class="spinner"></span></div>',
      buttons: [{ label: 'Close', kind: 'primary', value: true }],
      wide: true
    });
    try {
      const imgs = await Extract.previewImage(e.file);
      const box = $('#previewBox');
      if (box) box.innerHTML = imgs.map((src) => `<img src="${src}" alt="Receipt page">`).join('');
    } catch (err) {
      const box = $('#previewBox');
      if (box) box.innerHTML = '<p class="muted">This file could not be previewed in the browser. It will still be included in the receipts zip.</p>';
    }
    return p;
  }

  async function validateSection(s) {
    const list = sectionEntries(s);
    if (list.some((e) => e.status === 'queued' || e.status === 'reading')) {
      return toast('Still reading receipts. One moment.');
    }
    let bad = 0;
    list.forEach((e) => {
      const f = e.flags || (e.flags = {});
      const missing = { date: !e.date, vendor: !String(e.vendor).trim(), amount: e.amount === '' || isNaN(+e.amount) || +e.amount <= 0 };
      if (e.section === 'personal') missing.category = !e.category;
      let any = false;
      Object.keys(missing).forEach((k) => { if (missing[k]) { f[k] = true; any = true; } });
      if (any) { bad++; refreshCard(e); }
    });
    if (bad) return toast(`${bad} line${bad > 1 ? 's need' : ' needs'} a date, vendor, amount${s.section === 'personal' ? ' and category' : ''}.`);

    const noFile = list.filter((e) => !e.file);
    if (noFile.length) {
      const names = noFile.map((e) => `<li>${esc(e.vendor)} &middot; ${money(+e.amount)}</li>`).join('');
      const go = await modal({
        title: 'No matching receipt found',
        body: `<p>${noFile.length === 1 ? 'This line has' : 'These lines have'} no receipt attached:</p><ul>${names}</ul><p>${noFile.length === 1 ? 'It' : 'They'} will be flagged on the report. Continue anyway?</p>`,
        buttons: [{ label: 'Go back and attach', value: false }, { label: 'Continue anyway', kind: 'primary', value: true }]
      });
      if (!go) return;
    }
    goTo(state.step + 1);
  }

  // Step: per diem and mileage
  function renderPerDiem() {
    $('#main').innerHTML = `
      <section class="card">
        <p class="eyebrow">Paid personally &middot; Step ${state.step + 1}</p>
        <h1>Per diem and mileage</h1>
        <p class="lead">Count only the days you are claiming. If you flew in early or stayed late on your own time, leave those days out.</p>
        <div class="form-grid">
          <label>Per diem days<input type="number" id="pdDays" min="0" step="1" inputmode="numeric" value="${esc(state.perDiemDays)}"></label>
          <div class="calc"><span>${rate(settings.perDiemRate)} per day</span><strong id="pdCalc">$0.00</strong></div>
        </div>
        <fieldset class="yesno">
          <legend>Do you need to add mileage?</legend>
          <label><input type="radio" name="mi" value="yes" ${state.mileageYes === true ? 'checked' : ''}> Yes</label>
          <label><input type="radio" name="mi" value="no" ${state.mileageYes === false ? 'checked' : ''}> No</label>
        </fieldset>
        <div class="form-grid" id="milesRow" ${state.mileageYes ? '' : 'hidden'}>
          <label>Miles driven<input type="number" id="miles" min="0" step="0.1" inputmode="decimal" value="${esc(state.miles)}"></label>
          <div class="calc"><span>${rate(settings.mileageRate)} per mile</span><strong id="miCalc">$0.00</strong></div>
        </div>
        <p class="hint">Rates come from Settings (top right).</p>
        ${navButtons('Build report')}
      </section>`;
    const pd = $('#pdDays'), mi = $('#miles');
    const calc = () => {
      $('#pdCalc').textContent = money((+state.perDiemDays || 0) * settings.perDiemRate);
      $('#miCalc').textContent = money((+state.miles || 0) * settings.mileageRate);
    };
    pd.addEventListener('input', () => { state.perDiemDays = pd.value; pd.classList.remove('flag'); calc(); });
    mi.addEventListener('input', () => { state.miles = mi.value; mi.classList.remove('flag'); calc(); });
    document.querySelectorAll('input[name="mi"]').forEach((r) => r.addEventListener('change', () => {
      state.mileageYes = r.value === 'yes';
      $('#milesRow').hidden = !state.mileageYes;
      $('.yesno').classList.remove('flag');
      if (state.mileageYes) mi.focus();
    }));
    calc();
    wireNav(() => {
      if (state.perDiemDays === '' || +state.perDiemDays < 0 || !Number.isInteger(+state.perDiemDays)) {
        pd.classList.add('flag'); return toast('Enter the number of per diem days (0 if none).');
      }
      if (state.mileageYes === null) { $('.yesno').classList.add('flag'); return toast('Answer the mileage question.'); }
      if (state.mileageYes && (state.miles === '' || +state.miles <= 0)) { mi.classList.add('flag'); return toast('Enter the miles driven.'); }
      goTo(state.step + 1);
    });
  }

  // Step: report
  function renderReport() {
    const r = Report.build(state, settings);
    const fileCount = state.entries.filter((e) => e.file).length;
    $('#main').innerHTML = `
      <section class="card report-card">
        <div class="report-actions">
          <div>
            <p class="eyebrow">Step ${state.step + 1}</p>
            <h1>Your report</h1>
          </div>
          <div class="btn-row">
            <button type="button" class="btn primary" id="pdfBtn">Download PDF</button>
            <button type="button" class="btn" id="zipBtn" ${fileCount ? '' : 'disabled'}>Download receipts (${fileCount})</button>
          </div>
        </div>
        <div id="previewWrap">${Report.previewHTML(r, logo && logo.dataUrl)}</div>
        <div class="nav-row">
          <button type="button" class="btn" id="backBtn">Back</button>
          <button type="button" class="btn ghost danger" id="newBtn">Start a new report</button>
        </div>
      </section>`;
    $('#backBtn').addEventListener('click', () => goTo(state.step - 1));
    const base = Report.baseFilename(state.header);
    $('#pdfBtn').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        const res = await Report.saveFile(Report.makePDF(r, logo), base + '.pdf');
        if (res === 'saved') toast('PDF downloaded.');
      } catch (e) { console.error(e); toast('Could not create the PDF.'); }
      b.disabled = false;
    });
    $('#zipBtn').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Zipping…';
      try {
        const blob = await Report.makeZip(state.entries);
        const res = await Report.saveFile(blob, base + '_Receipts.zip');
        if (res === 'saved') toast('Receipts zip downloaded.');
      } catch (e) { console.error(e); toast('Could not create the zip.'); }
      b.disabled = false; b.textContent = `Download receipts (${fileCount})`;
    });
    $('#newBtn').addEventListener('click', async () => {
      const ok = await modal({
        title: 'Start a new report?',
        body: '<p>This clears everything you entered. Download the PDF and receipts first if you need them.</p>',
        buttons: [{ label: 'Cancel', value: false }, { label: 'Clear and start over', kind: 'primary danger', value: true }]
      });
      if (ok) { state = freshState(); goTo(0); }
    });
  }

  // ---------- settings panel ----------
  async function openSettings() {
    const body = `
      <div class="form-grid">
        <label>Per diem rate ($ per day)<input type="number" id="setPd" min="0" step="0.01" value="${settings.perDiemRate}"></label>
        <label>Mileage rate ($ per mile)<input type="number" id="setMi" min="0" step="0.001" value="${settings.mileageRate}"></label>
      </div>
      <p class="hint">Saved in this browser only. To change the default for everyone, edit <code>js/config.js</code>.</p>`;
    const p = modal({
      title: 'Settings', body,
      buttons: [
        { label: 'Reset to defaults', kind: 'ghost', value: 'reset' },
        { label: 'Cancel', value: null },
        { label: 'Save', kind: 'primary', value: 'save' }
      ]
    });
    // read the values before the modal closes
    let vals = null;
    const grab = () => { const a = $('#setPd'), b = $('#setMi'); if (a && b) vals = { pd: a.value, mi: b.value }; };
    document.querySelector('#modalRoot').addEventListener('input', grab);
    grab();
    const action = await p;
    if (action === 'reset') {
      settings = { ...CFG.defaults };
      try { localStorage.removeItem(SETTINGS_KEY); } catch (e) { /* ignore */ }
      toast('Rates reset to defaults.');
    } else if (action === 'save' && vals) {
      const pd = parseFloat(vals.pd), mi = parseFloat(vals.mi);
      if (isNaN(pd) || pd < 0 || isNaN(mi) || mi < 0) return toast('Rates must be numbers, 0 or more.');
      settings = { perDiemRate: pd, mileageRate: mi };
      toast(saveSettings(settings) ? 'Rates saved.' : 'Rates updated for this session (this browser would not save them).');
    } else return;
    const id = STEPS[state.step].id;
    if (id === 'perdiem' || id === 'report') renderStep();
  }

  // ---------- logo ----------
  function loadLogo() {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve({ dataUrl: c.toDataURL('image/png'), ratio: img.naturalWidth / img.naturalHeight, format: 'PNG' });
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = CFG.logoSrc;
    });
  }

  // ---------- start ----------
  $('#settingsBtn').addEventListener('click', openSettings);
  window.addEventListener('beforeunload', (e) => {
    if (state.entries.length) { e.preventDefault(); e.returnValue = ''; }
  });
  loadLogo().then((l) => {
    logo = l;
    if (l) { const b = $('#brandLogo'); b.src = l.dataUrl; b.hidden = false; }
    if (STEPS[state.step].id === 'report') renderStep();
  });
  renderStepper();
  renderStep();

  // test hook
  window.__expenseApp = { get state() { return state; }, goTo };
})();
