/* Report building: totals, on-screen preview, PDF and receipts zip. */
window.Report = (function () {
  'use strict';

  const money = (n) => (n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const rate = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  function usDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${m}/${d}/${y}`;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const catOrder = () => APP_CONFIG.categories.map((c) => c.key);
  function sortEntries(list) {
    const order = catOrder();
    return list.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') ||
      order.indexOf(a.category) - order.indexOf(b.category));
  }

  // Everything the report needs, computed once
  function build(state, settings) {
    const company = sortEntries(state.entries.filter((e) => e.section === 'company'));
    const personal = sortEntries(state.entries.filter((e) => e.section === 'personal'));
    const companyTotal = round(company.reduce((s, e) => s + (+e.amount || 0), 0));
    const perDiemDays = +state.perDiemDays || 0;
    const miles = state.mileageYes ? (+state.miles || 0) : 0;
    const perDiemAmt = round(perDiemDays * settings.perDiemRate);
    const mileageAmt = round(miles * settings.mileageRate);
    const personalPurchases = round(personal.reduce((s, e) => s + (+e.amount || 0), 0));
    const personalTotal = round(personalPurchases + perDiemAmt + mileageAmt);
    const missing = state.entries.some((e) => !e.file);
    return {
      header: state.header, company, personal, companyTotal, perDiemDays, miles,
      perDiemAmt, mileageAmt, personalTotal, grandTotal: round(companyTotal + personalTotal),
      settings, missing
    };
  }
  const days = (n) => `${n} day${+n === 1 ? '' : 's'}`;
  function round(n) { return Math.round(n * 100) / 100; }

  function tripDates(h) {
    if (!h.start) return '';
    return h.end && h.end !== h.start ? `${usDate(h.start)} to ${usDate(h.end)}` : usDate(h.start);
  }

  function vendorCell(e) { return e.vendor + (e.file ? '' : ' *'); }

  // ---------- on-screen preview ----------
  function previewHTML(r, logoDataUrl) {
    const rows = (list) => list.map((e) => `<tr><td>${usDate(e.date)}</td><td>${esc(vendorCell(e))}</td><td>${esc(e.category)}</td><td class="num">${money(+e.amount)}</td></tr>`).join('');
    const empty = (n) => `<tr><td colspan="${n}" class="muted">None</td></tr>`;
    return `
      <div class="paper">
        <div class="paper-head">
          ${logoDataUrl ? `<img class="paper-logo" src="${logoDataUrl}" alt="Safety In Motion">` : '<div class="paper-logo placeholder">SIM logo</div>'}
          <h1>Expense Report</h1>
        </div>
        <dl class="paper-info">
          <div><dt>Name</dt><dd>${esc(r.header.name)}</dd></div>
          <div><dt>Client</dt><dd>${esc(r.header.client)}</dd></div>
          <div><dt>Trip Dates</dt><dd>${esc(tripDates(r.header))}</dd></div>
        </dl>

        <h2>Company Card Expenses</h2>
        <table class="paper-table">
          <thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th class="num">Amount</th></tr></thead>
          <tbody>${r.company.length ? rows(r.company) : empty(4)}</tbody>
          <tfoot><tr><td colspan="3">Subtotal</td><td class="num">${money(r.companyTotal)}</td></tr></tfoot>
        </table>

        <h2>Personal Expenses</h2>
        <table class="paper-table">
          <thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${rows(r.personal)}
            <tr><td></td><td>Per Diem</td><td>${days(r.perDiemDays)} &times; ${rate(r.settings.perDiemRate)}</td><td class="num">${money(r.perDiemAmt)}</td></tr>
            <tr><td></td><td>Mileage</td><td>${r.miles.toLocaleString('en-US')} mi &times; ${rate(r.settings.mileageRate)}</td><td class="num">${money(r.mileageAmt)}</td></tr>
          </tbody>
          <tfoot><tr><td colspan="3">Subtotal</td><td class="num">${money(r.personalTotal)}</td></tr></tfoot>
        </table>

        ${r.missing ? '<p class="paper-note">* No receipt attached</p>' : ''}

        <div class="paper-totals">
          <div><span>Grand Total to Client</span><strong>${money(r.grandTotal)}</strong></div>
          <div class="reimb"><span>Expenses to be Reimbursed</span><strong>${money(r.personalTotal)}</strong></div>
        </div>
      </div>`;
  }

  // ---------- PDF ----------
  const GREEN = [0, 176, 79], DEEP = [5, 102, 58], TINT = [234, 246, 239], SLATE = [31, 41, 55], GRAY = [107, 114, 128], LINE = [221, 226, 230];

  function makePDF(r, logo) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const W = doc.internal.pageSize.getWidth();
    const M = 54;
    let y = M;

    // Header: logo left, title right
    if (logo) {
      const h = 42, w = Math.min(160, h * logo.ratio);
      doc.addImage(logo.dataUrl, logo.format, M, y, w, w / logo.ratio);
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...SLATE);
    doc.text('Expense Report', W - M, y + 28, { align: 'right' });
    y += 54;
    doc.setDrawColor(...GREEN); doc.setLineWidth(2); doc.line(M, y, W - M, y);
    y += 24;

    // Info block
    const info = [['Name', r.header.name], ['Client', r.header.client], ['Trip Dates', tripDates(r.header)]];
    info.forEach(([k, v]) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...GRAY);
      doc.text(k.toUpperCase(), M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...SLATE);
      doc.text(String(v || ''), M + 80, y);
      y += 18;
    });
    y += 10;

    const tableOpts = (startY, body, subtotal) => ({
      startY,
      margin: { left: M, right: M },
      head: [['Date', 'Vendor', 'Category', 'Amount']],
      body,
      foot: [[{ content: 'Subtotal', colSpan: 3 }, money(subtotal)]],
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 10, textColor: SLATE, cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }, lineColor: LINE },
      headStyles: { fontStyle: 'bold', fontSize: 9, textColor: GRAY, lineWidth: { bottom: 1 }, lineColor: SLATE },
      bodyStyles: { lineWidth: { bottom: 0.5 } },
      footStyles: { fontStyle: 'bold', fillColor: TINT, textColor: DEEP },
      columnStyles: { 0: { cellWidth: 80 }, 2: { cellWidth: 130 }, 3: { halign: 'right', cellWidth: 90 } },
      didParseCell: (d) => { if (d.column.index === 3) d.cell.styles.halign = 'right'; }
    });

    const heading = (text) => {
      if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = M; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...DEEP);
      doc.text(text, M, y); y += 8;
    };

    heading('Company Card Expenses');
    const cBody = r.company.length
      ? r.company.map((e) => [usDate(e.date), vendorCell(e), e.category, money(+e.amount)])
      : [['', { content: 'None', styles: { textColor: GRAY } }, '', '']];
    doc.autoTable(tableOpts(y, cBody, r.companyTotal));
    y = doc.lastAutoTable.finalY + 30;

    heading('Personal Expenses');
    const pBody = r.personal.map((e) => [usDate(e.date), vendorCell(e), e.category, money(+e.amount)]);
    pBody.push(['', 'Per Diem', `${days(r.perDiemDays)} x ${rate(r.settings.perDiemRate)}`, money(r.perDiemAmt)]);
    pBody.push(['', 'Mileage', `${r.miles.toLocaleString('en-US')} mi x ${rate(r.settings.mileageRate)}`, money(r.mileageAmt)]);
    doc.autoTable(tableOpts(y, pBody, r.personalTotal));
    y = doc.lastAutoTable.finalY + 14;

    if (r.missing) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...GRAY);
      doc.text('* No receipt attached', M, y + 4); y += 14;
    }

    // Totals
    if (y > doc.internal.pageSize.getHeight() - 110) { doc.addPage(); y = M; }
    y += 16;
    const boxX = W - M - 280;
    doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(boxX, y, W - M, y);
    y += 22;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...SLATE);
    doc.text('Grand Total to Client', boxX, y);
    doc.text(money(r.grandTotal), W - M, y, { align: 'right' });
    y += 12;
    doc.setFillColor(...TINT); doc.rect(boxX - 8, y, 280 + 16, 30, 'F');
    y += 20;
    doc.setTextColor(...DEEP);
    doc.text('Expenses to be Reimbursed', boxX, y);
    doc.text(money(r.personalTotal), W - M, y, { align: 'right' });

    return doc.output('blob');
  }

  // ---------- receipts zip ----------
  async function makeZip(entries) {
    const zip = new JSZip();
    const used = new Set();
    for (const e of entries) {
      if (!e.file) continue;
      let name = e.file.name;
      if (used.has(name.toLowerCase())) {
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
        let n = 2;
        while (used.has(`${base} (${n})${ext}`.toLowerCase())) n++;
        name = `${base} (${n})${ext}`;
      }
      used.add(name.toLowerCase());
      zip.file(name, e.file);
    }
    return zip.generateAsync({ type: 'blob' });
  }

  function baseFilename(h) {
    const clean = (s) => String(s || '').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_');
    return ['Expenses', clean(h.name), clean(h.client), h.start || ''].filter(Boolean).join('_');
  }

  // ---------- saving a file ----------
  // Uses the Claude page download capability when the page runs there, a normal download otherwise.
  async function saveFile(blob, filename) {
    if (window.claude && typeof window.claude.use === 'function') {
      try {
        const dl = await window.claude.use('downloads');
        if (dl) { await dl.save({ filename, data: blob }); return 'saved'; }
      } catch (e) {
        if (e && e.code === 'declined') return 'declined';
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'saved';
  }

  return { build, previewHTML, makePDF, makeZip, baseFilename, saveFile, money, rate, usDate, esc };
})();
