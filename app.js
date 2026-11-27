/**
 * Mengambil 7 tanggal kalender berurutan hingga Kemarin (H-1) atau
 * hingga tanggal transaksi terbaru jika hari ini sudah ada data masuk/keluar.
 */
function getLastSevenActiveDates() {
  // Helper format tanggal lokal YYYY-MM-DD (anti pergeseran zona waktu UTC)
  const toLocalYMD = (dObj) => {
    const y = dObj.getFullYear();
    const m = String(dObj.getMonth() + 1).padStart(2, '0');
    const d = String(dObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Hitung tanggal Kemarin (H-1)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalYMD(yesterday);

  // Cari tanggal transaksi tertinggi yang tercatat di database
  let maxDbDateStr = '';
  masterStockData.forEach(part => {
    (part.history || []).forEach(h => {
      const d = String(h.date || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d > maxDbDateStr) {
        maxDbDateStr = d;
      }
    });
  });

  // Pilih tanggal akhir terbaru antara Kemarin (H-1) dan Transaksi Terakhir Database
  const endDateStr = (maxDbDateStr && maxDbDateStr > yesterdayStr) ? maxDbDateStr : yesterdayStr;

  // Bangun 7 hari kalender berurutan mundur dari endDateStr
  const [ey, em, ed] = endDateStr.split('-').map(Number);
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(ey, em - 1, ed - i);
    dates.push(toLocalYMD(dt));
  }

  return dates;
}

/**
 * Memeriksa kecocokan satuan antara CriticalParts dan StockCard
 */
function isCompatibleCriticalUom(ruleUom, partUom) {
  const r = String(ruleUom || '').trim().toUpperCase();
  const p = String(partUom || '').trim().toUpperCase();
  if (!r || !p) return true;
  if (r === p) return true;

  const uomAliases = {
    'DRUM': ['DRUM', 'DRM'],
    'PCS': ['PCS', 'PC', 'UNIT', 'EA', 'SET'],
    'PC': ['PCS', 'PC', 'UNIT', 'EA', 'SET'],
    'TBG': ['TBG', 'TBNG', 'TABUNG', 'CYL', 'TUBE']
  };

  const group = uomAliases[r] || [r];
  return group.includes(p);
}

/**
 * Mencocokkan 1 item StockCard dengan aturan keyword/PN dari sheet CriticalParts
 */
function doesStockItemMatchCriticalRule(stockItem, rule) {
  if (!isCompatibleCriticalUom(rule.satuan, stockItem.uom)) {
    return false;
  }

  const pn = String(stockItem.cleanPn || stockItem.partNumber || '').toUpperCase().trim();
  const desc = String(stockItem.partDescription || '').toUpperCase().trim();
  const combined = `${pn} ${desc}`;
  const kategori = String(rule.kategori || '').toUpperCase().trim();

  // Pengecualian khusus kategori TYRE agar O-Ring / Flap / Repair tidak terhitung sebagai ban utuh
  if (kategori === 'TYRE') {
    if (/\b(O-RING|ORING|FLAP|PENTIL|VALVE CORE|REPAIR|PATCH|INNER TUBE|BAN DALAM)\b/.test(combined)) {
      return false;
    }
  }

  // Pengecualian khusus kategori TABUNG agar aksesoris las tidak ikut terhitung
  if (kategori === 'TABUNG') {
    if (/\b(REGULATOR|REG|FLASHBACK|ARRESTOR|ARESTER|GAUGE|MANOMETER|VALVE|HOSE|SELANG|NOZZLE|TORCH|CUTTING TIP|ADAPTOR|ADAPTER|FITTING|COUPLING|CLAMP|TROLLEY|KERETA)\b/.test(combined)) {
      return false;
    }
  }

  const keywords = String(rule.partNumber || '')
    .split(',')
    .map(k => k.trim().toUpperCase())
    .filter(Boolean);

  if (keywords.length === 0) return false;

  const combinedNoDash = combined.replace(/-/g, '');

  return keywords.some(rawKw => {
    // Mendukung sintaks kunci Exact Match dengan tanda kurung siku "[...]" (contoh: "[C2H2]") di CriticalParts
    if (rawKw.startsWith('[') && rawKw.endsWith(']') && rawKw.length > 2) {
      const exactTarget = rawKw.slice(1, -1).trim();
      return exactTarget !== '' && pn === exactTarget;
    }

    const kw = rawKw;
    const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Khusus kode gas tabung utama (O2, C2H2, AR, N2): wajib PN persis atau mengandung kata GAS
    if (kategori === 'TABUNG' && ['O2', 'C2H2', 'AR', 'N2'].includes(kw)) {
      if (pn === kw || pn === `GAS-${kw}` || pn === `GAS ${kw}`) return true;
      const gasDescRegex = new RegExp(`(^|[^A-Z0-9])${escapedKw}([^A-Z0-9]|$)`);
      return /\bGAS\b/.test(desc) && gasDescRegex.test(combined);
    }

    // Pola ukuran ban (mengandung -R, X, atau / seperti 12.00-R24, 12.00-24, 23.1X26, 265/65-R17)
    // Huruf "R" dan tanda hubung dibuat opsional agar ban radial (-R24) & bias (-24) otomatis tergabung
    if (/-?R\d|\/\d|\dX\d/.test(kw)) {
      const flexiblePattern = escapedKw
        .replace(/-?R(\d)/g, '[-\\s]?R?[-\\s]?$1')
        .replace(/(\d)X(\d)/g, '$1[-\\s]?[XR]?[-\\s]?$2')
        .replace(/-/g, '[-\\s]?');
      const flexibleSizeRegex = new RegExp(`(^|[^0-9])${flexiblePattern}([^0-9]|$)`);
      if (flexibleSizeRegex.test(combined)) return true;

      const kwNoDashNoR = kw.replace(/-/g, '').replace(/R(\d)/g, '$1');
      const combinedNoDashNoR = combinedNoDash.replace(/R(\d)/g, '$1');
      return combinedNoDashNoR.includes(kwNoDashNoR);
    }

    // Pola kode part atau kekentalan oli (batas non-alfanumerik agar O2 tidak cocok ke CO2 & 10W tidak cocok ke 10W40)
    const boundaryRegex = new RegExp(`(^|[^A-Z0-9])${escapedKw}([^A-Z0-9]|$)`);
    return boundaryRegex.test(combined);
  });
}

/**
 * Mengelompokkan item CriticalParts (berdasarkan Kategori + Label Laporan)
 * dan menghitung nilai STOCK & OUT pada masing-masing dari 7 tanggal aktif
 */
function buildDailyCriticalReportRows(activeDates) {
  const groupedMap = new Map();
  const orderedGroups = [];

  criticalPartsList.forEach(rule => {
    const groupKey = `${rule.kategori}__${rule.labelLaporan}`;
    let group = groupedMap.get(groupKey);

    if (!group) {
      group = {
        kategori: rule.kategori || 'GENERAL',
        labelLaporan: rule.labelLaporan,
        aplikasiUnit: rule.aplikasiUnit || '-',
        satuan: rule.satuan || 'PCS',
        matchedPartsMap: new Map()
      };
      groupedMap.set(groupKey, group);
      orderedGroups.push(group);
    }

    masterStockData.forEach((stockItem, idx) => {
      if (doesStockItemMatchCriticalRule(stockItem, rule)) {
        const partKey = `${stockItem.cleanPn || stockItem.partNumber}_${idx}`;
        group.matchedPartsMap.set(partKey, stockItem);
      }
    });
  });

  // Hitung seri STOCK & OUT harian per kelompok item
  return orderedGroups.map(group => {
    const stockByDate = activeDates.map(() => 0);
    const outByDate = activeDates.map(() => 0);

    group.matchedPartsMap.forEach(part => {
      const history = part.history || [];
      let totalNetHistory = 0;

      history.forEach(h => {
        totalNetHistory += (parseFloat(h.inQty) || 0) - Math.abs(parseFloat(h.outQty) || 0);
      });

      // Saldo awal efektif sebelum seluruh transaksi yang tercatat di history
      const effectiveInitialStock = (parseFloat(part.stockBalance) || 0) - totalNetHistory;

      activeDates.forEach((targetDate, dIdx) => {
        let cumulativeNetUpToDate = 0;
        let outOnThisDate = 0;

        history.forEach(h => {
          const hDate = String(h.date || '').trim();
          const inVal = parseFloat(h.inQty) || 0;
          const outVal = Math.abs(parseFloat(h.outQty) || 0);

          if (hDate && hDate <= targetDate) {
            cumulativeNetUpToDate += (inVal - outVal);
          }
          if (hDate === targetDate) {
            outOnThisDate += outVal;
          }
        });

        const closingStock = Math.max(0, Math.round((effectiveInitialStock + cumulativeNetUpToDate) * 100) / 100);
        stockByDate[dIdx] += closingStock;
        outByDate[dIdx] += Math.round(outOnThisDate * 100) / 100;
      });
    });

    return {
      kategori: group.kategori,
      labelLaporan: group.labelLaporan,
      aplikasiUnit: group.aplikasiUnit,
      satuan: group.satuan,
      stockByDate: stockByDate,
      outByDate: outByDate
    };
  });
}

function renderDailyCriticalReportHeader(activeDates) {
  const siteSub = document.getElementById('criticalReportSiteSubtitle');
  const ymElem = document.getElementById('criticalReportYearMonth');
  const rangeElem = document.getElementById('criticalReportDateRangeText');
  const printedByElem = document.getElementById('criticalReportPrintedBy');
  const genAtElem = document.getElementById('criticalReportGeneratedAt');

  if (siteSub) siteSub.textContent = `FORM DAILY STOCK SITE : ${currentSite}`;

  const monthNamesId = [
    'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
    'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
  ];

  if (activeDates.length > 0) {
    const firstParts = activeDates[0].split('-');
    const lastParts = activeDates[activeDates.length - 1].split('-');
    const firstMonthName = monthNamesId[parseInt(firstParts[1], 10) - 1] || '';
    const lastMonthName = monthNamesId[parseInt(lastParts[1], 10) - 1] || '';
    const yearLabel = firstParts[0] === lastParts[0] ? lastParts[0] : `${firstParts[0]}/${lastParts[0]}`;
    const monthLabel = firstMonthName === lastMonthName ? lastMonthName : `${firstMonthName} - ${lastMonthName}`;

    if (ymElem) ymElem.textContent = `TAHUN: ${yearLabel} • BULAN: ${monthLabel}`;
    if (rangeElem) rangeElem.textContent = `${formatDateIndo(activeDates[0])} - ${formatDateIndo(activeDates[activeDates.length - 1])}`;
  }

  const userName = currentUser?.name || 'Adi Pranata';
  const userRole = currentUser?.role || 'Plant Department';
  if (printedByElem) {
    printedByElem.textContent = `${userName} (${userRole}) — Site ${currentSite}`;
  }

  const now = new Date();
  const printTimeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WITA`;
  if (genAtElem) {
    genAtElem.textContent = printTimeStr;
  }
}

function renderDailyCriticalReportTable(activeDates, reportRows) {
  const thead = document.getElementById('criticalReportTableHead');
  const tbody = document.getElementById('criticalReportTableBody');
  if (!thead || !tbody) return;

  const colCount = activeDates.length;
  const totalDayCols = colCount * 2;
  const dayColWidth = (53.7 / Math.max(totalDayCols, 1)).toFixed(3) + '%';

  const dayHeadersHtml = activeDates.map(d => {
    const dayNum = d.split('-')[2] || d;
    return `<th style="width:${dayColWidth};" class="py-1 px-0.5 border border-slate-900 text-center font-mono font-black text-[10.5px] bg-slate-100">${dayNum}</th>`;
  }).join('');

  thead.innerHTML = `
    <tr class="bg-slate-200 text-slate-950 font-black uppercase text-[10.5px]">
      <th rowspan="2" style="width:3.2%;" class="py-1.5 px-0.5 border border-slate-900 text-center">No</th>
      <th rowspan="2" style="width:19.8%;" class="py-1.5 px-1.5 border border-slate-900 text-left">Item / Size</th>
      <th rowspan="2" style="width:14.5%;" class="py-1.5 px-1.5 border border-slate-900 text-left">Aplikasi / Unit</th>
      <th colspan="${colCount}" class="py-1 px-1 border border-slate-900 text-center bg-amber-100 text-slate-950 tracking-wider">STOCK</th>
      <th rowspan="2" style="width:8.8%;" class="py-1.5 px-0.5 border-y border-x-2 border-slate-900 text-center bg-slate-200 uom-divider-col">UOM</th>
      <th colspan="${colCount}" class="py-1 px-1 border border-slate-900 text-center bg-blue-100 text-slate-950 tracking-wider">OUT</th>
    </tr>
    <tr>
      ${dayHeadersHtml}
      ${dayHeadersHtml}
    </tr>
  `;

  const categoryTitles = {
    'LOG': 'LOG (LUBRICANTS & GREASE)',
    'TYRE': 'TYRE',
    'BATTERY': 'BATTERY',
    'TABUNG': 'TABUNG / GAS'
  };

  tbody.innerHTML = '';
  let lastCategory = null;
  let catSeqNo = 0;

  reportRows.forEach(row => {
    if (row.kategori !== lastCategory) {
      lastCategory = row.kategori;
      catSeqNo = 0;
      const catTitle = categoryTitles[row.kategori] || row.kategori;
      const totalCols = 4 + (colCount * 2);

      const catTr = document.createElement('tr');
      catTr.className = 'bg-slate-800 text-white font-black uppercase text-[10.5px] tracking-wider cat-divider-row';
      catTr.innerHTML = `
        <td colspan="${totalCols}" class="py-1 px-2 border border-slate-900">${catTitle}</td>
      `;
      tbody.appendChild(catTr);
    }

    catSeqNo += 1;

    const stockCellsHtml = row.stockByDate.map(val => {
      const isZero = val === 0;
      const cellClass = isZero
        ? 'bg-emerald-300 text-emerald-950 font-black zero-stock-cell'
        : 'bg-white text-slate-950 font-extrabold';
      return `<td style="width:${dayColWidth};" class="py-1 px-0.5 border border-slate-900 text-center font-mono text-[10.5px] ${cellClass}">${val}</td>`;
    }).join('');

    const outCellsHtml = row.outByDate.map(val => {
      if (val > 0) {
        return `<td style="width:${dayColWidth};" class="py-1 px-0.5 border border-slate-900 text-center font-mono font-black text-[10.5px] text-rose-900 bg-rose-50/60 out-active-cell">${val}</td>`;
      }
      return `<td style="width:${dayColWidth};" class="py-1 px-0.5 border border-slate-900 text-center font-mono text-[10px] text-slate-400">-</td>`;
    }).join('');

    const tr = document.createElement('tr');
    tr.className = 'text-slate-900 border-b border-slate-900';
    tr.innerHTML = `
      <td style="width:3.2%;" class="py-1 px-0.5 border border-slate-900 text-center font-mono font-bold text-slate-700">${catSeqNo}</td>
      <td style="width:19.8%;" class="py-1 px-1.5 border border-slate-900 font-sans font-extrabold text-slate-950 col-nowrap col-item">${row.labelLaporan}</td>
      <td style="width:14.5%;" class="py-1 px-1.5 border border-slate-900 font-sans font-semibold text-slate-800 col-nowrap col-app">${row.aplikasiUnit}</td>
      ${stockCellsHtml}
      <td style="width:8.8%;" class="py-1 px-0.5 border-y border-x-2 border-slate-900 text-center font-sans font-bold text-[9px] bg-slate-100 col-nowrap col-uom uom-divider-col">${row.satuan}</td>
      ${outCellsHtml}
    `;
    tbody.appendChild(tr);
  });
}

function printDailyCriticalReport() {
  const element = document.getElementById('printableCriticalReportDocument');
  if (!element) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }

  const todayTag = new Date().toISOString().split('T')[0];

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Daily_Critical_Report_${currentSite}_${todayTag}</title>
      <style>
        @page { size: A4 portrait; margin: 5mm 6mm; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 0;
          background: #ffffff;
          color: #0f172a;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .hidden { display: none !important; }
        .flex { display: flex; }
        .flex-col { flex-direction: column; }
        .justify-between { justify-content: space-between; }
        .items-start { align-items: flex-start; }
        .items-center { align-items: center; }
        .justify-center { justify-content: center; }
        .shrink-0 { flex-shrink: 0; }
        .gap-2 { gap: 8px; }
        .gap-3 { gap: 10px; }

        .border-b-4 { border-bottom-width: 3px; }
        .border-double { border-bottom-style: double; }
        .border-2 { border: 1.5px solid #0f172a; }
        .border { border: 1px solid #0f172a; }
        .border-t { border-top: 1px solid #cbd5e1; }
        .border-t-2 { border-top: 1.5px solid #0f172a; }
        .border-slate-900 { border-color: #0f172a; }
        .border-slate-800 { border-color: #1e293b; }
        .border-slate-300 { border-color: #cbd5e1; }
        .rounded-lg { border-radius: 6px; }
        .rounded-xl { border-radius: 8px; }

        .px-3\\.5 { padding-left: 10px; padding-right: 10px; }
        .px-3 { padding-left: 8px; padding-right: 8px; }
        .px-2 { padding-left: 6px; padding-right: 6px; }
        .px-1\\.5 { padding-left: 4px; padding-right: 4px; }
        .px-1 { padding-left: 2.5px; padding-right: 2.5px; }
        .px-0\\.5 { padding-left: 1.5px; padding-right: 1.5px; }
        .py-2 { padding-top: 5px; padding-bottom: 5px; }
        .py-1\\.5 { padding-top: 3.5px; padding-bottom: 3.5px; }
        .py-1 { padding-top: 2.5px; padding-bottom: 2.5px; }
        .pb-2\\.5 { padding-bottom: 6px; }
        .pt-0\\.5 { padding-top: 2px; }
        .pt-2\\.5 { padding-top: 6px; }
        .mb-3 { margin-bottom: 7px; }
        .mt-0\\.5 { margin-top: 2px; }
        .mt-2 { margin-top: 4px; }
        .mt-3 { margin-top: 7px; }

        .bg-white { background-color: #ffffff; }
        .bg-slate-50 { background-color: #f8fafc; }
        .bg-slate-100 { background-color: #f1f5f9; }
        .bg-slate-200 { background-color: #e2e8f0; }
        .bg-slate-800, .cat-divider-row { background-color: #1e293b !important; color: #ffffff !important; }
        .bg-amber-100 { background-color: #fef3c7; }
        .bg-blue-100 { background-color: #dbeafe; }
        .bg-rose-600 { background-color: #e11d48; }
        .zero-stock-cell, .bg-emerald-300 { background-color: #86efac !important; color: #052e16 !important; font-weight: 900 !important; }
        .out-active-cell { background-color: #fff1f2 !important; color: #881337 !important; font-weight: 900 !important; }

        .font-sans { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace; }
        .font-black { font-weight: 900; }
        .font-extrabold { font-weight: 800; }
        .font-bold { font-weight: 700; }
        .font-semibold { font-weight: 600; }
        .font-medium { font-weight: 500; }
        .italic { font-style: italic; }
        .uppercase { text-transform: uppercase; }
        .text-left { text-align: left; }
        .text-center { text-align: center; }
        .text-right, .sm\\:text-right { text-align: right; }
        .leading-tight { line-height: 1.18; }
        .tracking-tight { letter-spacing: -0.02em; }
        .tracking-wider { letter-spacing: 0.04em; }
        .col-nowrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .text-lg, .sm\\:text-xl { font-size: 15.5px; }
        .text-xs { font-size: 10.5px; }
        .text-\\[11px\\] { font-size: 10px; }
        .text-\\[10\\.5px\\] { font-size: 9.5px; }
        .text-\\[10px\\] { font-size: 9px; }
        .text-\\[9\\.5px\\] { font-size: 8.5px; }
        .text-\\[9px\\] { font-size: 8.5px; }

        .text-white { color: #ffffff; }
        .text-slate-950 { color: #020617; }
        .text-slate-900 { color: #0f172a; }
        .text-slate-800 { color: #1e293b; }
        .text-slate-700 { color: #334155; }
        .text-slate-600 { color: #475569; }
        .text-slate-400 { color: #94a3b8; }
        .text-amber-800 { color: #92400e; }

        .h-12 { height: 38px; }
        .w-12 { width: 38px; }
        .w-auto { width: auto; }
        .object-contain { object-fit: contain; }

        table { width: 100%; table-layout: fixed; border-collapse: collapse; }
        #criticalReportTable th {
          padding: 2.8px 2px !important;
          line-height: 1.15 !important;
          font-size: 9.5px !important;
        }
        #criticalReportTable td {
          padding: 2.3px 2px !important;
          line-height: 1.15 !important;
          font-size: 9.5px !important;
        }
        #criticalReportTable td.col-item {
          padding-left: 4px !important;
          padding-right: 3px !important;
          font-size: 9.5px !important;
          letter-spacing: -0.015em;
        }
        #criticalReportTable td.col-app {
          padding-left: 4px !important;
          padding-right: 3px !important;
          font-size: 9px !important;
          letter-spacing: -0.01em;
        }
        #criticalReportTable td.col-uom {
          padding-left: 1.5px !important;
          padding-right: 1.5px !important;
          font-size: 8.5px !important;
          letter-spacing: -0.02em;
        }
        #criticalReportTable .uom-divider-col {
          border-left: 1.8px solid #0f172a !important;
          border-right: 1.8px solid #0f172a !important;
          background-color: #f1f5f9 !important;
        }
        #criticalReportTable td.font-mono {
          font-size: 10.5px !important;
        }
        #criticalReportTable tr.cat-divider-row td {
          padding: 3px 6px !important;
          font-size: 9.5px !important;
        }
        .space-y-0\\.5 > * + * { margin-top: 2px; }
        .mt-3.pt-2\\.5 { break-inside: avoid; page-break-inside: avoid; }
        @media (min-width: 640px) {
          .sm\\:flex-row { flex-direction: row; }
          .sm\\:items-center { align-items: center; }
        }
      </style>
    </head>
    <body>
      ${element.innerHTML}
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.focus();
            window.print();
            window.close();
          }, 200);
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

function formatDateIndo(dateStr) {
  if (!dateStr) return '-';
  const parts = String(dateStr).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toastNotification');
  const toastMsg = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');

  if (!toast || !toastMsg || !toastIcon) return;
  toastMsg.textContent = msg;

  if (type === 'success') {
    toastIcon.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
  } else if (type === 'warning') {
    toastIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-amber-400"></i>';
  } else {
    toastIcon.innerHTML = '<i class="fa-solid fa-circle-info text-blue-400"></i>';
  }

  toast.classList.remove('translate-y-24', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-24', 'opacity-0');
  }, 3000);
}
