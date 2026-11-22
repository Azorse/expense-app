/* Receipt reading: pulls text out of PDFs (pdf.js) and photos (Tesseract OCR),
   then guesses date, vendor and amount. Everything runs in the browser. */
window.Extract = (function () {
  'use strict';

  const abs = (p) => new URL(p, document.baseURI).href;

  // ---------- known vendors (name shown on report, likely category) ----------
  const VENDORS = [
    ['Southwest', 'Airfare', /south\s*west/], ['Delta', 'Airfare', /\bdelta\b/],
    ['United Airlines', 'Airfare', /united\s+air/], ['American Airlines', 'Airfare', /american\s+air/],
    ['Alaska Airlines', 'Airfare', /alaska\s+air/], ['JetBlue', 'Airfare', /jet\s*blue/],
    ['Spirit Airlines', 'Airfare', /spirit\s+air/], ['Frontier Airlines', 'Airfare', /frontier\s+air/],
    ['Allegiant', 'Airfare', /allegiant/], ['Hawaiian Airlines', 'Airfare', /hawaiian\s+air/],
    ['Hampton Inn', 'Accommodations', /hampton/], ['Hilton Garden Inn', 'Accommodations', /hilton\s+garden/],
    ['Homewood Suites', 'Accommodations', /homewood/], ['Embassy Suites', 'Accommodations', /embassy\s+suites/],
    ['DoubleTree', 'Accommodations', /double\s*tree/], ['Hilton', 'Accommodations', /\bhilton\b/],
    ['Holiday Inn Express', 'Accommodations', /holiday\s+inn\s+express/], ['Holiday Inn', 'Accommodations', /holiday\s+inn/],
    ['Candlewood Suites', 'Accommodations', /candlewood/], ['Staybridge Suites', 'Accommodations', /staybridge/],
    ['Courtyard', 'Accommodations', /courtyard/], ['Fairfield Inn', 'Accommodations', /fairfield/],
    ['Residence Inn', 'Accommodations', /residence\s+inn/], ['SpringHill Suites', 'Accommodations', /springhill/],
    ['TownePlace Suites', 'Accommodations', /towneplace/], ['Marriott', 'Accommodations', /marriott/],
    ['Hyatt', 'Accommodations', /hyatt/], ['Best Western', 'Accommodations', /best\s+western/],
    ['Comfort Inn', 'Accommodations', /comfort\s+(inn|suites)/], ['La Quinta', 'Accommodations', /la\s+quinta/],
    ['Sheraton', 'Accommodations', /sheraton/], ['Westin', 'Accommodations', /westin/],
    ['Wyndham', 'Accommodations', /wyndham/], ['Drury Inn', 'Accommodations', /drury/],
    ['Airbnb', 'Accommodations', /airbnb/],
    ['Hertz', 'Transportation', /\bhertz\b/], ['Avis', 'Transportation', /\bavis\b/],
    ['Enterprise', 'Transportation', /enterprise/], ['National Car Rental', 'Transportation', /national\s+car/],
    ['Budget', 'Transportation', /budget\s+(rent|car)/], ['Alamo', 'Transportation', /\balamo\b/],
    ['Thrifty', 'Transportation', /thrifty/], ['Dollar', 'Transportation', /dollar\s+(rent|car)/],
    ['Sixt', 'Transportation', /\bsixt\b/], ['Uber', 'Transportation', /\buber\b/],
    ['Lyft', 'Transportation', /\blyft\b/], ['Amtrak', 'Transportation', /amtrak/],
    ['Shell', 'Fuel', /\bshell\b/], ['Chevron', 'Fuel', /chevron/], ['ExxonMobil', 'Fuel', /exxon/],
    ['Mobil', 'Fuel', /\bmobil\b/], ['BP', 'Fuel', /\bbp\b/], ['Valero', 'Fuel', /valero/],
    ['Texaco', 'Fuel', /texaco/], ['Circle K', 'Fuel', /circle\s*k\b/], ['Speedway', 'Fuel', /speedway/],
    ['Marathon', 'Fuel', /marathon/], ['Sunoco', 'Fuel', /sunoco/], ['Citgo', 'Fuel', /citgo/],
    ['Phillips 66', 'Fuel', /phillips\s*66/], ['Conoco', 'Fuel', /conoco/], ['ARCO', 'Fuel', /\barco\b/],
    ["Buc-ee's", 'Fuel', /buc-?\s?ee/], ['QuikTrip', 'Fuel', /quik\s*trip/], ["Love's", 'Fuel', /\blove'?s\s+(travel|country)/],
    ['Pilot', 'Fuel', /pilot\s+(travel|flying)/], ['Flying J', 'Fuel', /flying\s+j\b/], ["Casey's", 'Fuel', /casey'?s/],
    ['Wawa', 'Fuel', /\bwawa\b/], ['Sheetz', 'Fuel', /sheetz/], ['RaceTrac', 'Fuel', /race\s*trac/],
    ['Murphy USA', 'Fuel', /murphy\s+usa/], ['Costco Gas', 'Fuel', /costco\s+gas/], ['Kwik Trip', 'Fuel', /kwik\s*trip/]
  ];

  function guessCategory(vendor) {
    if (!vendor) return '';
    const v = vendor.toLowerCase();
    for (const [name, cat, re] of VENDORS) {
      if (re.test(v) || v.includes(name.toLowerCase())) return cat;
    }
    return '';
  }

  // ---------- engines ----------
  let ocrWorkerPromise = null;
  function getOcr() {
    if (!ocrWorkerPromise) {
      ocrWorkerPromise = Tesseract.createWorker('eng', 1, {
        workerPath: abs('js/vendor/tesseract/worker.min.js'),
        corePath: abs('js/vendor/tesseract/core'),
        langPath: abs('js/vendor/tesseract/lang'),
        gzip: true
      }).catch((e) => { ocrWorkerPromise = null; throw e; });
    }
    return ocrWorkerPromise;
  }

  function initPdf() {
    if (window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = abs('js/vendor/pdf.worker.min.js');
    }
  }

  async function openPdf(file) {
    initPdf();
    const buf = await file.arrayBuffer();
    return pdfjsLib.getDocument({ data: buf }).promise;
  }

  async function pdfPageText(page) {
    const content = await page.getTextContent();
    const rows = [];
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      let row = rows.find((r) => Math.abs(r.y - y) < 3);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map((r) => r.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ')
      .replace(/\s+/g, ' ').trim()).join('\n');
  }

  async function renderPdfPage(doc, pageNo, scale) {
    const page = await doc.getPage(pageNo);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  }

  async function loadImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Image could not be opened')); img.src = url; });
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }

  // Grayscale and resize so OCR has a decent amount of detail to work with
  function prepForOcr(source, w, h) {
    const longSide = Math.max(w, h);
    let scale = 1;
    if (longSide < 1600) scale = 1600 / longSide;
    if (longSide > 3000) scale = 3000 / longSide;
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(source, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      px[i] = px[i + 1] = px[i + 2] = g;
    }
    ctx.putImageData(d, 0, 0);
    return c;
  }

  function thumbFrom(source, w, h, max) {
    const scale = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }

  async function ocr(canvas) {
    const worker = await getOcr();
    const { data } = await worker.recognize(canvas);
    return { text: data.text || '', confidence: data.confidence || 0 };
  }

  // ---------- parsing ----------
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?';

  function mkDate(y, m, d) {
    y = +y; m = +m; d = +d;
    if (y < 100) y += 2000;
    const maxYear = new Date().getFullYear() + 1;
    if (y < 2000 || y > maxYear || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // Returns [{ value, index }] for every date found in a line
  function datesAt(line) {
    const out = [];
    let m;
    const add = (v, i) => { if (v && !out.some((o) => o.index === i)) out.push({ value: v, index: i }); };
    const reUS = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})\b/g;
    while ((m = reUS.exec(line))) add(mkDate(m[3], m[1], m[2]), m.index);
    const reISO = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
    while ((m = reISO.exec(line))) add(mkDate(m[1], m[2], m[3]), m.index);
    const reMDY = new RegExp('\\b' + MON + '\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b', 'gi');
    while ((m = reMDY.exec(line))) add(mkDate(m[3], MONTHS[m[1].toLowerCase()], m[2]), m.index);
    const reDMY = new RegExp('\\b(\\d{1,2})[\\s\\-]*' + MON + '[\\s\\-,]*(\\d{4}|\\d{2})\\b', 'gi');
    while ((m = reDMY.exec(line))) add(mkDate(m[3], MONTHS[m[2].toLowerCase()], m[1]), m.index);
    return out.sort((a, b) => a.index - b.index);
  }
  const datesInLine = (line) => datesAt(line).map((d) => d.value);

  function dateKeywordScore(text, category) {
    const l = text.toLowerCase();
    if (category === 'Accommodations') {
      if (/depart|check[\s-]*out/.test(l)) return 10;
      if (/arriv|check[\s-]*in/.test(l)) return 4;
    }
    if (category === 'Transportation' && /\breturn/.test(l)) return 9;
    if (category === 'Airfare') {
      if (/issue|purchase|booked|booking|transaction|date of/.test(l)) return 9;
      if (/depart|flight/.test(l)) return 3;
    }
    if (/\b(date|purchase|transaction|trans|issued|invoice|order|sale|paid)\b/.test(l)) return 6;
    if (/print/.test(l)) return 0;
    return 1;
  }

  function findDate(lines, category) {
    let best = null; const all = new Set();
    lines.forEach((line, i) => {
      const found = datesAt(line);
      if (!found.length) return;
      found.forEach((d, j) => {
        // Score from the words just before this date (since the previous date on the line)
        const from = j > 0 ? found[j - 1].index : 0;
        let score = dateKeywordScore(line.slice(from, d.index), category);
        if (score <= 1 && j === 0 && i > 0 && !datesAt(lines[i - 1]).length) {
          const prev = dateKeywordScore(lines[i - 1], category); // label on the line above
          if (prev > 1) score = prev - 1;
        }
        all.add(d.value);
        if (!best || score > best.score) best = { value: d.value, score };
      });
    });
    if (!best) return { value: '', conf: 'none' };
    const conf = best.score > 1 || all.size === 1 ? 'ok' : 'check';
    return { value: best.value, conf };
  }

  const MONEY = /(?:\$|usd)?\s?(-?\d{1,3}(?:,\d{3})+|-?\d+)\.(\d{2})(?![\d%])/gi;
  function amountsIn(line) {
    const out = []; let m;
    MONEY.lastIndex = 0;
    while ((m = MONEY.exec(line))) {
      const v = parseFloat(m[1].replace(/,/g, '') + '.' + m[2]);
      if (!isNaN(v)) out.push(v);
    }
    return out;
  }

  const EXCLUDE = /sub\s*-?\s*total|\btax(es)?\b|\btip\b|gratuity|saving|discount|\bchange\b|cash\s*back|\bmiles?\b|\bpoints\b|\brate\b|per\s+night|gal(lon)?s?\b|price\s*\/|\/\s*gal|odometer|deposit|credit\s+limit|available/i;
  function amountScore(line) {
    const l = line.toLowerCase();
    if (EXCLUDE.test(l)) return 0;
    if (/grand\s+total|total\s+(amount\s+)?(due|paid|charged|charges|fare|cost|price|payment)|amount\s+(due|paid|charged)|balance\s+due|trip\s+total|total\s+for\s+stay|total\s+estimated/.test(l)) return 10;
    if (/\btotal\b/.test(l)) return 7;
    if (/fuel\s+sale|\bsale\b|amount\s+charged/.test(l)) return 6;
    if (/\b(amount|charged|payment|purchase|visa|mastercard|amex|american\s+express|discover)\b/.test(l)) return 4;
    return 0;
  }

  function findAmount(lines) {
    let best = null; let max = 0;
    lines.forEach((line, i) => {
      const nums = amountsIn(line).filter((v) => v > 0);
      nums.forEach((v) => { if (v > max && !EXCLUDE.test(line)) max = v; });
      const score = amountScore(line);
      if (!score) return;
      let vals = nums;
      if (!vals.length && i + 1 < lines.length && !EXCLUDE.test(lines[i + 1])) vals = amountsIn(lines[i + 1]).filter((v) => v > 0);
      if (!vals.length) return;
      const v = vals[vals.length - 1];
      if (!best || score > best.score || (score === best.score && v > best.value)) best = { value: v, score };
    });
    if (best) {
      const conf = (best.score >= 7 || (best.score >= 4 && best.value === max)) && best.value < 20000 ? 'ok' : 'check';
      return { value: best.value, conf };
    }
    if (max > 0) return { value: max, conf: 'check' };
    return { value: null, conf: 'none' };
  }

  const GENERIC = /\b(img|image|scan(ned)?|receipt|document|doc|photo|pxl|dsc|dcim|screenshot|screen|shot|untitled|copy|file|folio|invoice|confirmation|final|pdf|jpe?g|png|heic|am|pm|at|page|e|mvimg|whatsapp)\b/gi;
  function vendorFromFilename(name) {
    let s = name.replace(/\.[a-z0-9]+$/i, '').replace(/[_\-.+]+/g, ' ');
    s = s.replace(/\$?\d+(?:[.,]\d+)*/g, ' ').replace(GENERIC, ' ').replace(/\s+/g, ' ').trim();
    if (s.replace(/[^a-z]/gi, '').length < 2) return '';
    if (s === s.toLowerCase()) s = s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
    return s;
  }

  function vendorFromText(text) {
    const l = text.toLowerCase();
    for (const [name, , re] of VENDORS) if (re.test(l)) return name;
    return '';
  }

  function vendorFromFirstLine(lines) {
    for (const line of lines.slice(0, 8)) {
      const t = line.trim();
      if (t.length < 3 || t.length > 40) continue;
      if ((t.match(/[a-z]/gi) || []).length < 3) continue;
      if (datesInLine(t).length || amountsIn(t).length) continue;
      if (/welcome|thank|receipt|invoice|page\s+\d|www\.|http|@/i.test(t)) continue;
      return t.replace(/[^\w&'.\- ]/g, '').trim();
    }
    return '';
  }

  function parse(text, fileName, category) {
    const lines = text.split(/\r?\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const date = findDate(lines, category);
    const amount = findAmount(lines);

    let vendor = { value: '', conf: 'none' };
    const fv = fileName ? vendorFromFilename(fileName) : '';
    const tv = vendorFromText(text);
    if (fv) vendor = { value: fv, conf: 'ok' };
    else if (tv) vendor = { value: tv, conf: 'ok' };
    else { const lv = vendorFromFirstLine(lines); if (lv) vendor = { value: lv, conf: 'check' }; }

    // Fall back to anything typed into the file name
    if (fileName) {
      if (!date.value) { const d = datesInLine(fileName.replace(/_/g, ' ')); if (d.length) { date.value = d[0]; date.conf = 'check'; } }
      if (amount.value == null) { const a = amountsIn(fileName.replace(/_/g, ' ')); if (a.length) { amount.value = a[a.length - 1]; amount.conf = 'check'; } }
    }
    return { date, vendor, amount };
  }

  // ---------- main entry ----------
  // Returns { text, thumb, fields:{date,vendor,amount}, status:'ok'|'check'|'fail', message }
  async function readReceipt(file, category) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    let text = '', thumb = '', source = '';
    if (isPdf) {
      const doc = await openPdf(file);
      const first = await renderPdfPage(doc, 1, 1);
      thumb = first.toDataURL('image/jpeg', 0.85);
      const pages = Math.min(doc.numPages, 5);
      const parts = [];
      for (let p = 1; p <= pages; p++) parts.push(await pdfPageText(await doc.getPage(p)));
      text = parts.join('\n');
      source = 'pdf';
      if (text.replace(/\s/g, '').length < 30) {
        // Scanned PDF with no text layer: OCR the first page
        const canvas = await renderPdfPage(doc, 1, 2.5);
        text = (await ocr(prepForOcr(canvas, canvas.width, canvas.height))).text;
        source = 'ocr';
      }
    } else {
      const img = await loadImage(file);
      thumb = thumbFrom(img, img.naturalWidth, img.naturalHeight, 600);
      text = (await ocr(prepForOcr(img, img.naturalWidth, img.naturalHeight))).text;
      source = 'ocr';
    }

    const fields = parse(text, file.name, category);
    let status = 'ok', message = 'Read from the receipt. Give it a quick look.';
    if (!fields.date.value || fields.amount.value == null) {
      status = 'fail';
      message = "Couldn't read this one fully. Please fill in the highlighted fields.";
    } else if ([fields.date, fields.vendor, fields.amount].some((f) => f.conf !== 'ok')) {
      status = 'check';
      message = 'Please double check the highlighted fields.';
    }
    return { text, thumb, fields, status, message, source };
  }

  // Bigger render of a receipt for the preview window
  async function previewImage(file) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (isPdf) {
      const doc = await openPdf(file);
      const out = [];
      for (let p = 1; p <= Math.min(doc.numPages, 5); p++) out.push((await renderPdfPage(doc, p, 1.6)).toDataURL('image/jpeg', 0.9));
      return out;
    }
    const img = await loadImage(file);
    return [thumbFrom(img, img.naturalWidth, img.naturalHeight, 1800)];
  }

  return { readReceipt, previewImage, guessCategory, parse, warmUp: () => getOcr().catch(() => {}) };
})();
