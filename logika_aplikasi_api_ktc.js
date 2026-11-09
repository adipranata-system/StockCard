/**
 * ============================================================================
 * KTC DIGITAL STOCK CARD & OLD CORE ENGINE (app.js)
 * ============================================================================
 * Terhubung ke: Google Apps Script Web App (Spreadsheet TNPN, TTLP & GDrive)
 */

// KONFIGURASI ENDPOINT GOOGLE APPS SCRIPT
const API_URL = "https://script.google.com/macros/s/AKfycbx_0pePE9D-LOtyQvdJRoe4p2NfPaonOsMvZdgLVrMNtALlZD6bFG4NiWTtnjPdY5tTiA/exec";

// STATE GLOBAL APLIKASI
let currentSite = 'TNPN';
let activeTab = 'new-part';
let currentPartIndex = 0;

// Master Data dalam memori
let masterStockData = [];
let oldCoreRegisterData = [];
let skhqIncomingShipments = [];

// State Combobox Keyboard
let partComboboxIndex = -1;
let filteredPartList = [];
let skhqComboboxIndex = -1;
let filteredSkhqList = [];
let selectedSkhqValue = '';

// State Pengiriman & Dokumen
let selectedDispatchCoreIds = new Set();
let currentViewingManifestSj = null;

// State Kamera Live
let currentPhotoBase64 = null;
let cameraMediaStream = null;
let currentCameraFacingMode = 'environment'; // Kamera belakang HP default

/**
 * ============================================================================
 * 1. INISIALISASI & FETCH DATA DARI GOOGLE APPS SCRIPT
 * ============================================================================
 */
window.addEventListener('DOMContentLoaded', () => {
  setupKeyboardShortcuts();
  setupEnterToNextFieldNavigation();
  initFormDates();
  setupOutsideClickListeners();

  // Muat data langsung dari Google Sheets
  fetchSiteData(currentSite);
});

function initFormDates() {
  const today = new Date().toISOString().split('T')[0];
  const coreDateInput = document.getElementById('inputCoreDate');
  if (coreDateInput) coreDateInput.value = today;
  const skhqDateInput = document.getElementById('inputSkhqDate');
  if (skhqDateInput) skhqDateInput.value = today;
}

function setupOutsideClickListeners() {
  document.addEventListener('click', (e) => {
    const partDrop = document.getElementById('partComboboxDropdown');
    const partInp = document.getElementById('partComboboxInput');
    if (partDrop && !partDrop.contains(e.target) && e.target !== partInp) {
      closePartComboboxDropdown();
    }

    const skhqDrop = document.getElementById('skhqComboboxDropdown');
    const skhqInp = document.getElementById('skhqComboboxInput');
    if (skhqDrop && !skhqDrop.contains(e.target) && e.target !== skhqInp) {
      closeSkhqComboboxDropdown();
    }
  });
}

/**
 * Mengambil data komplit site dari backend Google Sheets
 */
async function fetchSiteData(site) {
  showToast(`Menghubungkan ke Gudang Site ${site}...`, 'info');
  setSyncStatus('Memuat data dari Google Sheets...');

  try {
    const response = await fetch(`${API_URL}?action=GET_ALL_DATA&site=${site}`);
    const json = await response.json();

    if (json.status === 'SUCCESS' && json.data) {
      masterStockData = json.data.parts || [];
      oldCoreRegisterData = json.data.oldCores || [];

      // Update timestamp sinkronisasi
      const now = new Date();
      const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth()+1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WITA`;
      setSyncStatus(`Sinkron Online: ${timeStr}`);

      if (masterStockData.length === 0) {
        loadFallbackMockData(site);
      }
    } else {
      throw new Error(json.message || 'Gagal memuat data');
    }
  } catch (err) {
    console.warn('Koneksi backend gagal, menggunakan data lokal cadangan:', err);
    loadFallbackMockData(site);
    setSyncStatus('Offline / Mode Lokal');
  }

  currentPartIndex = 0;
  initPartCombobox();
  initSkhqCombobox();
  renderStockCard();
  renderOldCoreTable();
  updateOldCoreCounters();
}

function setSyncStatus(txt) {
  const syncElem = document.getElementById('syncTimestamp');
  if (syncElem) syncElem.textContent = txt;
}

/**
 * ============================================================================
 * 2. SWITCH SITE & NAVIGASI TAB
 * ============================================================================
 */
function switchSite(siteKey) {
  if (currentSite === siteKey) return;
  currentSite = siteKey;

  // Ubah gaya visual tombol switcher
  const btnTNPN = document.getElementById('siteBtnTNPN');
  const btnTTLP = document.getElementById('siteBtnTTLP');
  const headerIndicator = document.getElementById('headerSiteIndicator');
  const cardSiteBadge = document.getElementById('cardSiteBadge');

  if (siteKey === 'TNPN') {
    if (btnTNPN) btnTNPN.className = "px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-black transition-all bg-amber-400 text-amber-950 shadow-sm flex items-center gap-1";
    if (btnTTLP) btnTTLP.className = "px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all text-slate-400 hover:text-white flex items-center gap-1";
  } else {
    if (btnTNPN) btnTNPN.className = "px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all text-slate-400 hover:text-white flex items-center gap-1";
    if (btnTTLP) btnTTLP.className = "px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-black transition-all bg-amber-400 text-amber-950 shadow-sm flex items-center gap-1";
  }

  if (headerIndicator) headerIndicator.textContent = siteKey;
  if (cardSiteBadge) cardSiteBadge.textContent = `SITE ${siteKey}`;

  fetchSiteData(siteKey);
}

function switchAppTab(tab) {
  activeTab = tab;
  const viewNewPart = document.getElementById('viewNewPart');
  const viewOldCore = document.getElementById('viewOldCore');
  const tabBtnNew = document.getElementById('tabBtnNewPart');
  const tabBtnCore = document.getElementById('tabBtnOldCore');
  const leadText = document.getElementById('tabStatusLeadText');

  if (tab === 'new-part') {
    if (viewNewPart) viewNewPart.classList.remove('hidden');
    if (viewOldCore) viewOldCore.classList.add('hidden');

    if (tabBtnNew) {
      tabBtnNew.className = "flex-1 flex items-center justify-center gap-1.5 sm:gap-2.5 py-2 sm:py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all border-2 border-amber-300 bg-[#FFFDF2] text-slate-900 shadow";
    }
    if (tabBtnCore) {
      tabBtnCore.className = "flex-1 flex items-center justify-center gap-1.5 sm:gap-2.5 py-2 sm:py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all border-2 border-transparent bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white";
    }
    if (leadText) leadText.textContent = "Cut-off Data Odoo (Part Baru):";
    renderStockCard();
  } else {
    if (viewNewPart) viewNewPart.classList.add('hidden');
    if (viewOldCore) viewOldCore.classList.remove('hidden');

    if (tabBtnNew) {
      tabBtnNew.className = "flex-1 flex items-center justify-center gap-1.5 sm:gap-2.5 py-2 sm:py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all border-2 border-transparent bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white";
    }
    if (tabBtnCore) {
      tabBtnCore.className = "flex-1 flex items-center justify-center gap-1.5 sm:gap-2.5 py-2 sm:py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all border-2 border-orange-400 bg-[#FFF8F0] text-orange-950 shadow";
    }
    if (leadText) leadText.textContent = "Status Monitoring Old Core:";
    renderOldCoreTable();
  }
}

/**
 * ============================================================================
 * 3. RENDER KARTU STOK PART BARU
 * ============================================================================
 */
function renderStockCard() {
  const item = masterStockData[currentPartIndex];
  if (!item) return;

  const pnElem = document.getElementById('cardPartNumber');
  const descElem = document.getElementById('cardPartDescription');
  const uomElem = document.getElementById('cardUom');
  const binElem = document.getElementById('cardBinLoc');
  const balanceElem = document.getElementById('cardStockBalance');
  const unitElem = document.getElementById('cardStockUnit');
  const begElem = document.getElementById('cardBeginningStock');
  const inElem = document.getElementById('cardTotalIncoming');
  const outElem = document.getElementById('cardTotalOutgoing');
  const balanceBox = document.getElementById('cardBalanceBox');
  const tbody = document.getElementById('cardLedgerBody');

  // Cross-site stock elements
  const crossNameElem = document.getElementById('crossSiteName');
  const crossQtyElem = document.getElementById('crossSiteQty');
  const crossBinElem = document.getElementById('crossSiteBin');

  if (item.otherSiteStock) {
    if (crossNameElem) crossNameElem.textContent = `Site ${item.otherSiteStock.site}`;
    if (crossQtyElem) crossQtyElem.textContent = item.otherSiteStock.qty;
    if (crossBinElem) crossBinElem.textContent = item.otherSiteStock.bin;
  }

  if (pnElem) pnElem.textContent = item.partNumber;
  if (descElem) descElem.textContent = item.partDescription;
  if (uomElem) uomElem.textContent = item.uom;
  if (binElem) binElem.textContent = item.binLoc;
  if (balanceElem) balanceElem.textContent = item.stockBalance;
  if (unitElem) unitElem.textContent = item.uom;
  if (begElem) begElem.textContent = item.beginningStock;
  if (inElem) inElem.textContent = item.incoming;
  if (outElem) outElem.textContent = item.outgoing;

  // Warna indikator saldo On Hand
  if (balanceBox) {
    if (item.stockBalance > 5) {
      balanceBox.className = "bg-emerald-700 text-white border-2 border-emerald-900 rounded-xl sm:rounded-2xl px-3.5 sm:px-6 py-1.5 sm:py-2 text-center sm:text-right shadow-md min-w-[110px] sm:min-w-[130px]";
    } else if (item.stockBalance > 0) {
      balanceBox.className = "bg-amber-600 text-white border-2 border-amber-800 rounded-xl sm:rounded-2xl px-3.5 sm:px-6 py-1.5 sm:py-2 text-center sm:text-right shadow-md min-w-[110px] sm:min-w-[130px]";
    } else {
      balanceBox.className = "bg-rose-700 text-white border-2 border-rose-900 rounded-xl sm:rounded-2xl px-3.5 sm:px-6 py-1.5 sm:py-2 text-center sm:text-right shadow-md min-w-[110px] sm:min-w-[130px]";
    }
  }

  // Render Tabel Mutasi Ledger
  if (tbody) {
    tbody.innerHTML = '';
    const history = item.history || [];

    if (history.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-8 text-slate-400 italic">Belum ada catatan transaksi mutasi Odoo</td>
        </tr>
      `;
      return;
    }

    history.forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.className = (idx % 2 === 0 ? 'bg-white/70' : 'bg-amber-50/50') + ' hover:bg-amber-100/60 transition-colors border-b border-amber-200/80';
      tr.innerHTML = `
        <td class="py-3 px-3 border-r border-amber-200 text-center font-mono font-bold text-slate-500">${idx + 1}</td>
        <td class="py-3 px-3 border-r border-amber-200 font-mono text-xs sm:text-sm font-semibold text-slate-800 whitespace-nowrap">${formatDateIndo(row.date)}</td>
        <td class="py-3 px-3 border-r border-amber-200 font-mono text-xs sm:text-sm font-bold text-slate-900">${row.docNo}</td>
        <td class="py-3 px-3 border-r border-amber-200 text-xs sm:text-sm font-semibold text-slate-800">${row.unit}</td>
        <td class="py-3 px-3 border-r border-amber-200 text-center font-mono font-bold text-emerald-800 ${row.inQty > 0 ? 'bg-emerald-50/60' : ''}">${row.inQty > 0 ? '+' + row.inQty : '-'}</td>
        <td class="py-3 px-3 border-r border-amber-200 text-center font-mono font-bold text-rose-800 ${row.outQty > 0 ? 'bg-rose-50/60' : ''}">${row.outQty > 0 ? '-' + row.outQty : '-'}</td>
        <td class="py-3 px-3 border-r border-amber-200 text-center font-mono font-black text-slate-950 text-sm sm:text-base bg-amber-100/50">${row.balance}</td>
        <td class="py-3 px-3 text-center">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${row.mechanic && row.mechanic !== '-' ? 'bg-slate-100 text-slate-900 border border-slate-300' : 'bg-slate-50 text-slate-400'}">
            ${row.mechanic && row.mechanic !== '-' ? '<i class="fa-solid fa-user-gear text-amber-600 text-[11px]"></i>' : ''}
            <span>${row.mechanic || '-'}</span>
          </span>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
}

function copyPartNumber() {
  const cur = masterStockData[currentPartIndex];
  if (!cur) return;
  const text = cur.cleanPn || cur.partNumber.replace(/[\[\]]/g, '');
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Part Number [${text}] disalin ke papan klip!`, 'success');
  }).catch(() => {
    // Fallback manual
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`Part Number [${text}] disalin!`, 'success');
  });
}

/**
 * ============================================================================
 * 4. COMBOBOX PART KARTU STOK (KEYBOARD-FRIENDLY)
 * ============================================================================
 */
function initPartCombobox() {
  const inp = document.getElementById('partComboboxInput');
  if (inp) inp.value = '';
  updateClearButtonVisibility();
  filterPartCombobox('');
}

function clearPartComboboxInput() {
  const inp = document.getElementById('partComboboxInput');
  if (inp) {
    inp.value = '';
    inp.focus();
  }
  updateClearButtonVisibility();
  filterPartCombobox('');
  openPartComboboxDropdown();
}

function updateClearButtonVisibility() {
  const inp = document.getElementById('partComboboxInput');
  const btn = document.getElementById('clearPartComboboxBtn');
  if (!inp || !btn) return;
  if (inp.value && inp.value.trim().length > 0) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

function togglePartComboboxDropdown() {
  const drop = document.getElementById('partComboboxDropdown');
  if (!drop) return;
  if (drop.classList.contains('hidden')) {
    openPartComboboxDropdown();
  } else {
    closePartComboboxDropdown();
  }
}

function openPartComboboxDropdown() {
  const drop = document.getElementById('partComboboxDropdown');
  const arrow = document.getElementById('partComboboxArrow');
  if (!drop) return;
  filterPartCombobox(document.getElementById('partComboboxInput').value);
  drop.classList.remove('hidden');
  if (arrow) arrow.style.transform = 'rotate(180deg)';
}

function closePartComboboxDropdown() {
  const drop = document.getElementById('partComboboxDropdown');
  const arrow = document.getElementById('partComboboxArrow');
  if (!drop) return;
  drop.classList.add('hidden');
  partComboboxIndex = -1;
  if (arrow) arrow.style.transform = 'rotate(0deg)';
}

function handlePartComboboxInput(val) {
  updateClearButtonVisibility();
  openPartComboboxDropdown();
  filterPartCombobox(val);
}

function filterPartCombobox(query) {
  const q = (query || '').toLowerCase().trim();
  const drop = document.getElementById('partComboboxDropdown');
  if (!drop) return;

  filteredPartList = masterStockData.filter(item => {
    if (!q) return true;
    return item.partNumber.toLowerCase().includes(q) ||
           item.partDescription.toLowerCase().includes(q) ||
           item.binLoc.toLowerCase().includes(q);
  });

  drop.innerHTML = '';
  partComboboxIndex = -1;

  if (filteredPartList.length === 0) {
    drop.innerHTML = `
      <div class="p-3 text-xs text-slate-500 italic text-center">
        Tidak ada part yang cocok dengan "${query}"
      </div>
    `;
    return;
  }

  filteredPartList.forEach((item, idx) => {
    const originalIndex = masterStockData.indexOf(item);
    const div = document.createElement('div');
    div.id = `part-combo-opt-${idx}`;
    div.className = "px-3.5 py-2.5 hover:bg-amber-100 cursor-pointer flex items-center justify-between text-left transition-colors border-b border-slate-100 last:border-none";
    div.onclick = () => selectPartFromCombobox(originalIndex);

    div.innerHTML = `
      <div>
        <div class="font-mono font-bold text-slate-900 text-sm sm:text-base">${item.partNumber}</div>
        <div class="text-xs sm:text-sm font-semibold text-slate-700 leading-snug">${item.partDescription}</div>
        <div class="text-[11px] font-bold text-amber-800 mt-0.5">
          <i class="fa-solid fa-location-dot mr-1 text-amber-600"></i>Rak: ${item.binLoc}
        </div>
      </div>
      <div class="text-right pl-3 shrink-0">
        <span class="text-[10px] font-bold text-slate-400 block uppercase">Sisa</span>
        <span class="font-mono text-base font-black ${item.stockBalance > 0 ? 'text-emerald-700' : 'text-rose-600'}">
          ${item.stockBalance} ${item.uom}
        </span>
      </div>
    `;
    drop.appendChild(div);
  });
}

function handlePartComboboxKeydown(e) {
  const drop = document.getElementById('partComboboxDropdown');
  const isVisible = drop && !drop.classList.contains('hidden');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!isVisible) {
      openPartComboboxDropdown();
      return;
    }
    if (filteredPartList.length > 0) {
      partComboboxIndex = (partComboboxIndex + 1) % filteredPartList.length;
      highlightComboboxOption('part-combo-opt', partComboboxIndex, filteredPartList.length, 'combobox-item-active');
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!isVisible) return;
    if (filteredPartList.length > 0) {
      partComboboxIndex = (partComboboxIndex - 1 + filteredPartList.length) % filteredPartList.length;
      highlightComboboxOption('part-combo-opt', partComboboxIndex, filteredPartList.length, 'combobox-item-active');
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (isVisible && partComboboxIndex >= 0 && partComboboxIndex < filteredPartList.length) {
      const chosen = filteredPartList[partComboboxIndex];
      selectPartFromCombobox(masterStockData.indexOf(chosen));
    } else if (isVisible && filteredPartList.length > 0) {
      selectPartFromCombobox(masterStockData.indexOf(filteredPartList[0]));
    } else {
      openPartComboboxDropdown();
    }
  } else if (e.key === 'Escape') {
    closePartComboboxDropdown();
  }
}

function selectPartFromCombobox(origIdx) {
  currentPartIndex = origIdx;
  const cur = masterStockData[currentPartIndex];
  const inp = document.getElementById('partComboboxInput');
  if (inp && cur) {
    inp.value = `${cur.partNumber} - ${cur.partDescription}`;
  }
  updateClearButtonVisibility();
  closePartComboboxDropdown();
  renderStockCard();
  showToast(`Membuka Kartu Stok: ${cur.partNumber}`, 'info');
}

/**
 * ============================================================================
 * 5. COMBOBOX ASAL SURAT JALAN SKHQ (OLD CORE)
 * ============================================================================
 */
function initSkhqCombobox() {
  filterSkhqCombobox('');
}

function toggleSkhqComboboxDropdown() {
  const drop = document.getElementById('skhqComboboxDropdown');
  if (!drop) return;
  if (drop.classList.contains('hidden')) {
    openSkhqComboboxDropdown();
  } else {
    closeSkhqComboboxDropdown();
  }
}

function openSkhqComboboxDropdown() {
  const drop = document.getElementById('skhqComboboxDropdown');
  const arrow = document.getElementById('skhqComboboxArrow');
  if (!drop) return;
  filterSkhqCombobox(document.getElementById('skhqComboboxInput').value);
  drop.classList.remove('hidden');
  if (arrow) arrow.style.transform = 'rotate(180deg)';
}

function closeSkhqComboboxDropdown() {
  const drop = document.getElementById('skhqComboboxDropdown');
  const arrow = document.getElementById('skhqComboboxArrow');
  if (!drop) return;
  drop.classList.add('hidden');
  skhqComboboxIndex = -1;
  if (arrow) arrow.style.transform = 'rotate(0deg)';
}

function handleSkhqComboboxInput(val) {
  openSkhqComboboxDropdown();
  filterSkhqCombobox(val);
  selectedSkhqValue = val;
}

function filterSkhqCombobox(query) {
  const q = (query || '').toLowerCase().trim();
  const drop = document.getElementById('skhqComboboxDropdown');
  if (!drop) return;

  const unreceived = skhqIncomingShipments.filter(item => !item.coreReceivedAtSite);

  filteredSkhqList = unreceived.filter(item => {
    if (!q) return true;
    return item.sjSkhq.toLowerCase().includes(q) ||
           item.partDescription.toLowerCase().includes(q) ||
           item.partNumber.toLowerCase().includes(q) ||
           item.unitAssigned.toLowerCase().includes(q);
  });

  drop.innerHTML = '';
  skhqComboboxIndex = -1;

  if (filteredSkhqList.length > 0) {
    filteredSkhqList.forEach((item, idx) => {
      const div = document.createElement('div');
      div.id = `skhq-combo-opt-${idx}`;
      div.className = "px-3 py-2 hover:bg-orange-100 cursor-pointer flex items-center justify-between text-left transition-colors border-b border-orange-100 last:border-none";
      div.onclick = () => selectSkhqFromCombobox(item);

      div.innerHTML = `
        <div>
          <div class="flex items-center gap-2">
            <span class="font-mono font-black text-xs sm:text-sm text-orange-950 bg-orange-200 px-2 py-0.5 rounded">${item.sjSkhq}</span>
            <span class="text-[11px] font-bold text-slate-600">Unit: ${item.unitAssigned}</span>
          </div>
          <div class="text-xs font-bold text-slate-800 mt-1">${item.partDescription}</div>
          <div class="text-[10px] font-mono text-slate-500">${item.partNumber} • Tgl: ${formatDateIndo(item.date)}</div>
        </div>
        <span class="text-xs font-bold text-orange-700 bg-orange-50 px-2 py-1 rounded border border-orange-200">
          PILIH <i class="fa-solid fa-check ml-0.5"></i>
        </span>
      `;
      drop.appendChild(div);
    });
  }

  // Opsi manual
  const manualDiv = document.createElement('div');
  manualDiv.className = "px-3 py-2.5 bg-orange-50 hover:bg-orange-100 cursor-pointer text-xs font-bold text-orange-900 flex items-center justify-between border-t border-orange-200";
  manualDiv.onclick = () => selectManualSkhqEntry(q || 'SJ-SKHQ-MANUAL');
  manualDiv.innerHTML = `
    <div class="flex items-center gap-1.5">
      <i class="fa-solid fa-pen-to-square text-orange-600"></i>
      <span>Gunakan Input Manual: <strong>"${(q || 'SJ-SKHQ-MANUAL').toUpperCase()}"</strong></span>
    </div>
    <span class="text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-orange-300 text-orange-800">[Enter]</span>
  `;
  drop.appendChild(manualDiv);
}

function handleSkhqComboboxKeydown(e) {
  const drop = document.getElementById('skhqComboboxDropdown');
  const isVisible = drop && !drop.classList.contains('hidden');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!isVisible) {
      openSkhqComboboxDropdown();
      return;
    }
    if (filteredSkhqList.length > 0) {
      skhqComboboxIndex = (skhqComboboxIndex + 1) % filteredSkhqList.length;
      highlightComboboxOption('skhq-combo-opt', skhqComboboxIndex, filteredSkhqList.length, 'combobox-item-active-orange');
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!isVisible) return;
    if (filteredSkhqList.length > 0) {
      skhqComboboxIndex = (skhqComboboxIndex - 1 + filteredSkhqList.length) % filteredSkhqList.length;
      highlightComboboxOption('skhq-combo-opt', skhqComboboxIndex, filteredSkhqList.length, 'combobox-item-active-orange');
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (isVisible && skhqComboboxIndex >= 0 && skhqComboboxIndex < filteredSkhqList.length) {
      selectSkhqFromCombobox(filteredSkhqList[skhqComboboxIndex]);
    } else if (isVisible && filteredSkhqList.length > 0) {
      selectSkhqFromCombobox(filteredSkhqList[0]);
    } else {
      const val = document.getElementById('skhqComboboxInput').value.trim();
      selectManualSkhqEntry(val || 'SJ-SKHQ-MANUAL');
    }
  } else if (e.key === 'Escape') {
    closeSkhqComboboxDropdown();
  }
}

function selectSkhqFromCombobox(item) {
  selectedSkhqValue = item.sjSkhq;
  const inp = document.getElementById('skhqComboboxInput');
  if (inp) inp.value = `[${item.sjSkhq}] ${item.partDescription} (Unit ${item.unitAssigned})`;

  const pInp = document.getElementById('inputCorePart');
  const dInp = document.getElementById('inputCoreDesc');
  const uInp = document.getElementById('inputCoreUnit');
  
  if (pInp) pInp.value = item.partNumber;
  if (dInp) dInp.value = item.partDescription;
  if (uInp) uInp.value = item.unitAssigned;

  closeSkhqComboboxDropdown();

  const qtyInp = document.getElementById('inputCoreQty');
  if (qtyInp) setTimeout(() => qtyInp.focus(), 50);
}

function selectManualSkhqEntry(manualNo) {
  const cleanNo = (manualNo || 'SJ-SKHQ-MANUAL').toUpperCase().trim();
  selectedSkhqValue = cleanNo;
  const inp = document.getElementById('skhqComboboxInput');
  if (inp) inp.value = `[MANUAL] ${cleanNo}`;

  const pInp = document.getElementById('inputCorePart');
  const dInp = document.getElementById('inputCoreDesc');
  const uInp = document.getElementById('inputCoreUnit');

  if (pInp) { pInp.readOnly = false; pInp.value = ''; }
  if (dInp) { dInp.readOnly = false; dInp.value = ''; }
  if (uInp) { uInp.readOnly = false; uInp.value = ''; }

  closeSkhqComboboxDropdown();
  if (uInp) setTimeout(() => uInp.focus(), 50);
}

function highlightComboboxOption(prefix, activeIdx, total, activeClass) {
  for (let i = 0; i < total; i++) {
    const el = document.getElementById(`${prefix}-${i}`);
    if (!el) continue;
    if (i === activeIdx) {
      el.classList.add(activeClass);
      el.scrollIntoView({ block: 'nearest' });
    } else {
      el.classList.remove(activeClass);
    }
  }
}

function setupEnterToNextFieldNavigation() {
  const form = document.getElementById('formOldCore');
  if (!form) return;

  const enterNavs = form.querySelectorAll('.enter-nav');
  enterNavs.forEach((input, idx) => {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        const drop = document.getElementById('skhqComboboxDropdown');
        if (this.id === 'skhqComboboxInput' && drop && !drop.classList.contains('hidden')) {
          return;
        }
        e.preventDefault();
        const next = enterNavs[idx + 1];
        if (next) {
          next.focus();
          if (next.select) next.select();
        } else {
          const submitBtn = document.getElementById('submitOldCoreBtn');
          if (submitBtn) submitBtn.focus();
        }
      }
    });
  });
}

/**
 * ============================================================================
 * 6. REGISTER OLD CORE & KAMERA LIVE
 * ============================================================================
 */
function renderOldCoreTable() {
  const tbody = document.getElementById('oldCoreTableBody');
  const mobileContainer = document.getElementById('oldCoreMobileCardList');
  const filterElem = document.getElementById('filterOldCoreStatus');
  const filter = filterElem ? filterElem.value : 'ALL';

  let list = oldCoreRegisterData;
  if (filter === 'PENDING') {
    list = list.filter(item => item.status === 'PENDING');
  } else if (filter === 'SENT') {
    list = list.filter(item => item.status === 'SENT');
  }

  // 1. TAMPILAN KARTU HP
  if (mobileContainer) {
    mobileContainer.innerHTML = '';
    if (list.length === 0) {
      mobileContainer.innerHTML = `
        <div class="text-center py-8 text-slate-400 italic text-xs">
          Tidak ada data Old Core untuk filter ini
        </div>
      `;
    } else {
      list.forEach(row => {
        const isPending = row.status === 'PENDING';
        const card = document.createElement('div');
        card.className = "bg-white p-3 rounded-2xl border-2 border-orange-200 shadow-sm space-y-2.5";
        const photoSrc = row.photoUrl || row.photoData || `https://placehold.co/80x60/334155/f8fafc?text=${encodeURIComponent(row.unitId)}`;

        card.innerHTML = `
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-xs font-black">
                  UNIT ${row.unitId}
                </span>
                <span class="font-mono text-xs font-bold text-orange-950 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                  Ex ${row.sjSkhq}
                </span>
              </div>
              <div class="font-mono font-black text-sm text-slate-900 mt-1">${row.partNumber}</div>
              <div class="font-bold text-xs text-slate-800 leading-snug">${row.partDescription}</div>
            </div>

            <div class="shrink-0 cursor-pointer" onclick="previewItemPhoto('${row.id}')" title="Ketuk untuk melihat foto">
              <img src="${photoSrc}" alt="Foto" class="w-14 h-12 object-cover rounded-xl border border-slate-300 shadow-sm">
            </div>
          </div>

          <div class="text-[11px] text-slate-600 bg-orange-50/60 p-2 rounded-xl border border-orange-100 flex items-center justify-between">
            <div><i class="fa-solid fa-wrench mr-1 text-orange-500"></i>${row.condition}</div>
            <div class="font-mono font-bold text-slate-800">Rak: ${row.binLoc}</div>
          </div>

          <div class="flex items-center justify-between pt-1 gap-2">
            <div>
              ${isPending ? `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-900 rounded-full text-[10px] font-bold border border-amber-300">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Di Palet ${currentSite}
                </span>
              ` : `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-900 rounded-full text-[10px] font-bold border border-blue-300">
                  <span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span> Terkirim SKHQ
                </span>
              `}
            </div>

            <div>
              ${isPending ? `
                <button onclick="promptSingleItemSjSite('${row.id}')" class="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1">
                  <i class="fa-solid fa-truck-ramp-box"></i> Kirim (SJ)
                </button>
              ` : `
                <button onclick="openPrintManifestModalForSj('${row.sjSiteNumber}')" class="px-2.5 py-1.5 bg-blue-50 text-blue-800 font-mono font-black text-[11px] rounded-xl border border-blue-300 flex items-center gap-1">
                  <i class="fa-solid fa-print"></i> ${row.sjSiteNumber}
                </button>
              `}
            </div>
          </div>
        `;
        mobileContainer.appendChild(card);
      });
    }
  }

  // 2. TAMPILAN TABEL DESKTOP
  if (tbody) {
    tbody.innerHTML = '';
    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-10 text-slate-400 italic">
            Tidak ada data Old Core untuk filter ini
          </td>
        </tr>
      `;
      return;
    }

    list.forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.className = (idx % 2 === 0 ? 'bg-white' : 'bg-orange-50/40') + ' hover:bg-orange-100/60 transition-colors';
      const isPending = row.status === 'PENDING';

      tr.innerHTML = `
        <td class="py-3.5 px-3 border-r border-orange-200 text-center font-mono font-bold text-slate-500">${idx + 1}</td>
        <td class="py-3.5 px-3 border-r border-orange-200 font-mono text-sm font-semibold text-slate-800 whitespace-nowrap">${formatDateIndo(row.date)}</td>
        <td class="py-3.5 px-3 border-r border-orange-200 font-mono font-bold text-slate-900 text-sm">
          ${row.partNumber}
        </td>
        <td class="py-3.5 px-3 border-r border-orange-200">
          <div class="font-bold text-slate-800 text-sm">${row.partDescription}</div>
          <div class="text-xs text-slate-500 mt-0.5"><i class="fa-solid fa-wrench mr-1 text-orange-500"></i>${row.condition}</div>
          ${row.photoUrl || row.hasPhoto ? '<span class="inline-block mt-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200"><i class="fa-solid fa-camera mr-1"></i>Ada Foto Fisik</span>' : ''}
        </td>
        <td class="py-3.5 px-3 border-r border-orange-200 font-bold font-mono text-slate-800 text-center">
          <span class="px-2 py-1 bg-slate-100 border border-slate-300 rounded-md text-xs sm:text-sm">
            ${row.unitId}
          </span>
        </td>
        <td class="py-3.5 px-3 border-r border-orange-200">
          <span class="font-mono text-xs font-black bg-amber-100 border border-amber-300 text-amber-900 px-2 py-1 rounded inline-block">
            ${row.sjSkhq || 'Non-SJ'}
          </span>
        </td>
        <td class="py-3.5 px-3 border-r border-orange-200 text-xs">
          ${isPending ? `
            <div class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-full font-bold">
              <span class="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>Di Palet ${currentSite}</span>
            </div>
            <div class="text-[11px] font-mono font-semibold text-slate-500 mt-1">Rak: ${row.binLoc}</div>
          ` : `
            <div class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-900 border border-blue-300 rounded-full font-bold">
              <span class="w-2 h-2 rounded-full bg-blue-600"></span>
              <span>Terkirim SKHQ</span>
            </div>
            <div class="text-[11px] font-mono text-slate-500 mt-1">Tgl: ${formatDateIndo(row.dateSent)}</div>
          `}
        </td>
        <td class="py-3.5 px-3 text-center">
          <div class="flex flex-col gap-1.5 items-center justify-center">
            ${isPending ? `
              <button onclick="promptSingleItemSjSite('${row.id}')" class="w-full px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold text-xs rounded-xl border border-blue-300 shadow-sm transition-all flex items-center justify-center gap-1.5">
                <i class="fa-solid fa-truck-ramp-box text-blue-600"></i> Kirim (SJ Site)
              </button>
            ` : `
              <button onclick="openPrintManifestModalForSj('${row.sjSiteNumber}')" class="w-full px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-mono font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1">
                <i class="fa-solid fa-print"></i> ${row.sjSiteNumber}
              </button>
            `}
            <button onclick="previewItemPhoto('${row.id}')" class="w-full px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-300 flex items-center justify-center gap-1 transition-all">
              <i class="fa-solid fa-image text-slate-500"></i> ${row.photoUrl || row.hasPhoto ? 'Lihat Foto' : 'Tanpa Foto'}
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  updateOldCoreCounters();
}

function updateOldCoreCounters() {
  const pendingCount = oldCoreRegisterData.filter(item => item.status === 'PENDING').length;
  const sentCount = oldCoreRegisterData.filter(item => item.status === 'SENT').length;
  const dueCount = skhqIncomingShipments.filter(item => !item.coreReceivedAtSite).length;

  const badge = document.getElementById('oldCoreCountBadge');
  if (badge) badge.textContent = `${pendingCount}`;

  const pElem = document.getElementById('summaryCorePending');
  if (pElem) pElem.textContent = `${pendingCount} Unit`;

  const sElem = document.getElementById('summaryCoreSent');
  if (sElem) sElem.textContent = `${sentCount} Unit`;

  const dElem = document.getElementById('summaryCoreDue');
  if (dElem) dElem.textContent = `${dueCount} SJ`;
}

// LOGIKA KAMERA LIVE
function triggerGalleryPicker() {
  const inp = document.getElementById('inputCorePhotoGallery');
  if (inp) inp.click();
}

function triggerNativeCameraInput() {
  closeLiveCameraModal();
  const inp = document.getElementById('inputCorePhotoNativeCamera');
  if (inp) inp.click();
}

function handleFilePhotoSelected(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      applyCapturedPhoto(e.target.result, file.name || 'Foto Kamera');
    };
    reader.readAsDataURL(file);
  }
}

async function openLiveCameraModal() {
  const modal = document.getElementById('liveCameraModal');
  const video = document.getElementById('cameraVideo');
  if (!modal || !video) return;

  modal.classList.remove('hidden');

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('WebRTC Camera tidak didukung');
    }

    stopCameraStream();

    const constraints = {
      video: {
        facingMode: { ideal: currentCameraFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    cameraMediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = cameraMediaStream;
    await video.play();
  } catch (err) {
    console.warn('Gagal live camera, beralih ke native:', err);
    closeLiveCameraModal();
    triggerNativeCameraInput();
  }
}

function closeLiveCameraModal() {
  const modal = document.getElementById('liveCameraModal');
  if (modal) modal.classList.add('hidden');
  stopCameraStream();
}

function stopCameraStream() {
  if (cameraMediaStream) {
    cameraMediaStream.getTracks().forEach(track => track.stop());
    cameraMediaStream = null;
  }
  const video = document.getElementById('cameraVideo');
  if (video) video.srcObject = null;
}

function toggleCameraFacing() {
  currentCameraFacingMode = (currentCameraFacingMode === 'environment') ? 'user' : 'environment';
  openLiveCameraModal();
}

function captureLiveSnapshot() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  if (!video || !canvas) return;

  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, width, height);

  const photoDataUrl = canvas.toDataURL('image/jpeg', 0.85);
  applyCapturedPhoto(photoDataUrl, 'Jepretan Kamera');
  closeLiveCameraModal();
  showToast('Foto berhasil dijepret & tersimpan!', 'success');
}

function applyCapturedPhoto(base64Data, labelText = 'Foto Komponen') {
  currentPhotoBase64 = base64Data;
  const emptyState = document.getElementById('photoEmptyState');
  const capturedState = document.getElementById('photoCapturedState');
  const thumb = document.getElementById('photoThumbImg');
  const meta = document.getElementById('photoMetaText');

  if (emptyState) emptyState.classList.add('hidden');
  if (capturedState) capturedState.classList.remove('hidden');
  if (thumb) thumb.src = base64Data;
  if (meta) meta.textContent = labelText;
}

function removeCapturedPhoto() {
  currentPhotoBase64 = null;
  const emptyState = document.getElementById('photoEmptyState');
  const capturedState = document.getElementById('photoCapturedState');
  const thumb = document.getElementById('photoThumbImg');

  if (emptyState) emptyState.classList.remove('hidden');
  if (capturedState) capturedState.classList.add('hidden');
  if (thumb) thumb.src = '';

  const inpGal = document.getElementById('inputCorePhotoGallery');
  const inpCam = document.getElementById('inputCorePhotoNativeCamera');
  if (inpGal) inpGal.value = '';
  if (inpCam) inpCam.value = '';

  showToast('Foto dibatalkan', 'info');
}

// SIMPAN PENERIMAAN OLD CORE (POST KE GOOGLE APPS SCRIPT)
async function saveNewOldCore(e) {
  e.preventDefault();
  const sjSkhqSelect = selectedSkhqValue || document.getElementById('skhqComboboxInput').value.trim() || 'SJ-SKHQ-MANUAL';
  const date = document.getElementById('inputCoreDate').value;
  const unit = document.getElementById('inputCoreUnit').value.toUpperCase().trim();
  const pn = document.getElementById('inputCorePart').value;
  const cleanPn = pn.replace(/[\[\]]/g, '').trim();
  const desc = document.getElementById('inputCoreDesc').value;
  const qty = parseInt(document.getElementById('inputCoreQty').value) || 1;
  const bin = document.getElementById('inputCoreBin').value.trim() || 'PALET-CORE-01';
  const remark = document.getElementById('inputCoreRemark').value.trim() || 'Fisik bekas diterima dari mekanik';
  
  const newCoreId = 'CORE-' + Date.now().toString().slice(-4);
  const cleanSj = sjSkhqSelect.startsWith('[MANUAL]') ? sjSkhqSelect.replace('[MANUAL] ', '') : sjSkhqSelect;

  const newRecord = {
    id: newCoreId,
    date: date,
    partNumber: pn,
    cleanPn: cleanPn,
    partDescription: desc,
    desc: desc,
    unitId: unit,
    sjSkhq: cleanSj,
    qty: qty,
    binLoc: bin,
    condition: remark,
    hasPhoto: !!currentPhotoBase64,
    photoData: currentPhotoBase64,
    photoBase64: currentPhotoBase64,
    status: 'PENDING',
    sjSiteNumber: '',
    dateSent: ''
  };

  showToast('Menyimpan Old Core & mengunggah foto...', 'info');

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'SAVE_OLD_CORE',
        site: currentSite,
        record: newRecord
      })
    });
    const resJson = await res.json();
    if (resJson.status === 'SUCCESS' && resJson.data && resJson.data.photoUrl) {
      newRecord.photoUrl = resJson.data.photoUrl;
    }
  } catch (err) {
    console.warn('Gagal sinkron backend GAS:', err);
  }

  // Tandai SJ SKHQ terkait
  const matchedSkhq = skhqIncomingShipments.find(item => item.sjSkhq === newRecord.sjSkhq);
  if (matchedSkhq) {
    matchedSkhq.coreReceivedAtSite = true;
    matchedSkhq.refCoreId = newCoreId;
  }

  oldCoreRegisterData.unshift(newRecord);
  closeInputOldCoreModal();
  document.getElementById('formOldCore').reset();
  selectedSkhqValue = '';
  removeCapturedPhoto();
  document.getElementById('inputCoreDate').value = new Date().toISOString().split('T')[0];

  renderOldCoreTable();
  showToast(`Old Core ${pn} (Ex ${cleanSj}) tersimpan di palet ${currentSite}!`, 'success');
}

/**
 * ============================================================================
 * 7. PENGIRIMAN OLD CORE KE SKHQ & DOWNLOAD PDF SURAT JALAN
 * ============================================================================
 */
function openSendToSkhqModal() {
  const pendingItems = oldCoreRegisterData.filter(x => x.status === 'PENDING');
  if (pendingItems.length === 0) {
    showToast('Tidak ada barang bekas di palet yang menunggu dikirim!', 'warning');
    return;
  }

  selectedDispatchCoreIds.clear();
  pendingItems.forEach(item => selectedDispatchCoreIds.add(item.id));
  renderDispatchItemsList(pendingItems);

  const siteSjInput = document.getElementById('inputSiteSjNumber');
  if (siteSjInput && !siteSjInput.value) {
    siteSjInput.value = `SJ-${currentSite}-05`;
  }

  const dateInp = document.getElementById('inputSkhqDate');
  if (dateInp) dateInp.value = new Date().toISOString().split('T')[0];

  const modal = document.getElementById('sendToSkhqModal');
  if (modal) modal.classList.remove('hidden');
}

function renderDispatchItemsList(pendingItems) {
  const container = document.getElementById('dispatchItemsSelectionList');
  const selectAll = document.getElementById('selectAllDispatchCheckbox');
  const badge = document.getElementById('dispatchSelectedCountBadge');

  if (!container) return;
  container.innerHTML = '';

  if (selectAll) {
    selectAll.checked = selectedDispatchCoreIds.size === pendingItems.length && pendingItems.length > 0;
  }
  if (badge) {
    badge.textContent = `${selectedDispatchCoreIds.size} dari ${pendingItems.length} Dipilih`;
  }

  pendingItems.forEach(item => {
    const isChecked = selectedDispatchCoreIds.has(item.id);
    const div = document.createElement('label');
    div.className = `p-2.5 rounded-xl border-2 flex items-center justify-between gap-2.5 cursor-pointer transition-all ${
      isChecked ? 'bg-white border-blue-400 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-60'
    }`;

    div.innerHTML = `
      <div class="flex items-center gap-3">
        <input 
          type="checkbox" 
          value="${item.id}" 
          ${isChecked ? 'checked' : ''} 
          onchange="toggleDispatchItem('${item.id}', this.checked)"
          class="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 shrink-0"
        >
        <div>
          <div class="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-1.5 flex-wrap">
            <span class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-950 font-mono text-xs font-black">${item.unitId}</span>
            <span>${item.partDescription}</span>
          </div>
          <div class="text-[11px] font-mono text-slate-500 mt-0.5">
            ${item.partNumber} • Ex SJ: <strong class="text-orange-950">${item.sjSkhq}</strong> (Palet: ${item.binLoc})
          </div>
        </div>
      </div>
      <div class="text-right shrink-0">
        <span class="text-xs font-mono font-black px-2 py-1 rounded bg-blue-50 text-blue-800 border border-blue-200">
          ${item.qty} PC
        </span>
      </div>
    `;
    container.appendChild(div);
  });
}

function toggleDispatchItem(id, isChecked) {
  if (isChecked) {
    selectedDispatchCoreIds.add(id);
  } else {
    selectedDispatchCoreIds.delete(id);
  }
  const pendingItems = oldCoreRegisterData.filter(x => x.status === 'PENDING');
  renderDispatchItemsList(pendingItems);
}

function toggleSelectAllDispatch(isChecked) {
  const pendingItems = oldCoreRegisterData.filter(x => x.status === 'PENDING');
  if (isChecked) {
    pendingItems.forEach(item => selectedDispatchCoreIds.add(item.id));
  } else {
    selectedDispatchCoreIds.clear();
  }
  renderDispatchItemsList(pendingItems);
}

function closeSendToSkhqModal() {
  const modal = document.getElementById('sendToSkhqModal');
  if (modal) modal.classList.add('hidden');
}

async function confirmDispatchToSkhq() {
  const siteSjNumber = document.getElementById('inputSiteSjNumber').value.trim().toUpperCase();
  const sendDate = document.getElementById('inputSkhqDate').value || new Date().toISOString().split('T')[0];

  if (!siteSjNumber) {
    showToast('Nomor Surat Jalan Site wajib diisi!', 'warning');
    return;
  }
  if (selectedDispatchCoreIds.size === 0) {
    showToast('Pilih minimal 1 komponen bekas untuk dikirim!', 'warning');
    return;
  }

  const idsArray = Array.from(selectedDispatchCoreIds);

  // Kirim ke Google Apps Script backend
  try {
    fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'DISPATCH_OLD_CORE',
        site: currentSite,
        coreIds: idsArray,
        sjSiteNumber: siteSjNumber,
        dateSent: sendDate
      })
    });
  } catch (e) {
    console.warn(e);
  }

  let count = 0;
  oldCoreRegisterData.forEach(item => {
    if (item.status === 'PENDING' && selectedDispatchCoreIds.has(item.id)) {
      item.status = 'SENT';
      item.sjSiteNumber = siteSjNumber;
      item.dateSent = sendDate;
      count++;
    }
  });

  selectedDispatchCoreIds.clear();
  closeSendToSkhqModal();
  renderOldCoreTable();
  showToast(`Sukses! ${count} item dikirim dengan Surat Jalan: ${siteSjNumber}`, 'success');

  setTimeout(() => {
    openPrintManifestModalForSj(siteSjNumber);
  }, 350);
}

function promptSingleItemSjSite(coreId) {
  const defaultSj = `SJ-${currentSite}-05`;
  const input = prompt(`Masukkan Nomor Surat Jalan Site ${currentSite} untuk item ini:`, defaultSj);
  if (!input || !input.trim()) return;

  const item = oldCoreRegisterData.find(x => x.id === coreId);
  if (item) {
    item.status = 'SENT';
    item.sjSiteNumber = input.trim().toUpperCase();
    item.dateSent = new Date().toISOString().split('T')[0];

    try {
      fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'DISPATCH_OLD_CORE',
          site: currentSite,
          coreIds: [coreId],
          sjSiteNumber: item.sjSiteNumber,
          dateSent: item.dateSent
        })
      });
    } catch(e) {}

    renderOldCoreTable();
    showToast(`Item ${item.partNumber} dikaitkan ke Surat Jalan Site ${item.sjSiteNumber}!`, 'success');
    openPrintManifestModalForSj(item.sjSiteNumber);
  }
}

function openPrintManifestModalForSj(sjNumber) {
  currentViewingManifestSj = sjNumber;
  const items = oldCoreRegisterData.filter(x => x.sjSiteNumber === sjNumber);
  if (items.length === 0) {
    showToast('Data untuk Surat Jalan ini tidak ditemukan!', 'warning');
    return;
  }

  const docNo = document.getElementById('manifestDocNumber');
  const docDate = document.getElementById('manifestDocDate');
  const tbody = document.getElementById('manifestTableBody');

  if (docNo) docNo.textContent = sjNumber;
  if (docDate) docDate.textContent = formatDateIndo(items[0].dateSent || new Date().toISOString().split('T')[0]);

  if (tbody) {
    tbody.innerHTML = '';
    items.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-200 text-slate-800';
      const photoSrc = item.photoUrl || item.photoData || `https://placehold.co/100x80/e2e8f0/475569?text=${encodeURIComponent(item.unitId)}`;

      tr.innerHTML = `
        <td class="py-2 px-2 border border-slate-300 text-center font-bold">${idx + 1}</td>
        <td class="py-2 px-2 border border-slate-300 text-center">
          <img src="${photoSrc}" alt="Foto Core" class="w-20 h-16 object-cover rounded mx-auto border border-slate-300">
        </td>
        <td class="py-2 px-3 border border-slate-300">
          <div class="font-mono font-bold text-slate-900">${item.partNumber}</div>
          <div class="font-semibold text-slate-800">${item.partDescription}</div>
          <div class="text-[10px] text-slate-500 font-mono">ID Tag: ${item.id}</div>
        </td>
        <td class="py-2 px-2 border border-slate-300 text-center font-mono font-black text-slate-900">${item.unitId}</td>
        <td class="py-2 px-2 border border-slate-300 text-center font-mono font-bold text-orange-950 bg-orange-50/50">${item.sjSkhq}</td>
        <td class="py-2 px-2 border border-slate-300 text-center font-bold text-sm">${item.qty}</td>
        <td class="py-2 px-3 border border-slate-300 text-slate-700">${item.condition}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  const modal = document.getElementById('printManifestModal');
  if (modal) modal.classList.remove('hidden');
}

function closePrintManifestModal() {
  const modal = document.getElementById('printManifestModal');
  if (modal) modal.classList.add('hidden');
}

function printManifestDocument() {
  window.print();
}

function downloadManifestPdf() {
  const element = document.getElementById('printableManifestDocument');
  if (!element) return;

  const sjName = currentViewingManifestSj || 'SJ-SITE-OLDCORE';
  showToast('Sedang membuat file PDF Surat Jalan...', 'info');

  const opt = {
    margin: [8, 8, 8, 8],
    filename: `Surat_Jalan_OldCore_${sjName}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  if (window.html2pdf) {
    window.html2pdf().set(opt).from(element).save().then(() => {
      showToast(`File PDF Surat Jalan ${sjName} berhasil diunduh!`, 'success');
    }).catch(err => {
      console.error(err);
      window.print();
    });
  } else {
    window.print();
  }
}

function previewItemPhoto(coreId) {
  const item = oldCoreRegisterData.find(x => x.id === coreId);
  if (!item) return;

  const photo = item.photoUrl || item.photoData;
  if (photo) {
    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head><title>Foto Komponen - ${item.partNumber}</title><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0; background:#0f172a; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family:sans-serif; padding:16px; box-sizing:border-box;">
          <div style="background:#1e293b; padding:20px; border-radius:16px; border:2px solid #f97316; max-width:550px; width:100%; text-align:center;">
            <img src="${photo}" alt="${item.partDescription}" style="max-height:65vh; max-width:100%; object-fit:contain; border-radius:10px;">
            <div style="margin-top:14px; text-align:left;">
              <span style="background:#f97316; color:white; font-size:11px; font-weight:bold; padding:2px 8px; border-radius:4px;">UNIT: ${item.unitId}</span>
              <span style="background:#334155; color:#f8fafc; font-size:11px; font-family:monospace; padding:2px 8px; border-radius:4px; margin-left:6px;">${item.partNumber}</span>
              <h3 style="color:#ffffff; margin:8px 0 4px 0; font-size:16px;">${item.partDescription}</h3>
              <p style="color:#94a3b8; margin:0; font-size:13px;">Kondisi: ${item.condition}</p>
            </div>
          </div>
        </body>
        </html>
      `);
    }
  } else {
    showToast('Komponen ini belum memiliki foto fisik.', 'warning');
  }
}

/**
 * ============================================================================
 * 8. PROSES FILE EXCEL ODOO (IN & OUT)
 * ============================================================================
 */
function openUploadModal() {
  const modal = document.getElementById('uploadModal');
  if (modal) modal.classList.remove('hidden');
}
function closeUploadModal() {
  const modal = document.getElementById('uploadModal');
  if (modal) modal.classList.add('hidden');
}

function handleDragOver(e) {
  e.preventDefault();
  const drop = document.getElementById('dropZone');
  if (drop) drop.classList.add('border-emerald-600', 'bg-emerald-50');
}
function handleDragLeave(e) {
  e.preventDefault();
  const drop = document.getElementById('dropZone');
  if (drop) drop.classList.remove('border-emerald-600', 'bg-emerald-50');
}
function handleDrop(e) {
  e.preventDefault();
  const drop = document.getElementById('dropZone');
  if (drop) drop.classList.remove('border-emerald-600', 'bg-emerald-50');
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    processUploadedOdooFile(e.dataTransfer.files[0]);
  }
}
function handleFileSelect(e) {
  if (e.target.files && e.target.files[0]) {
    processUploadedOdooFile(e.target.files[0]);
  }
}

async function processUploadedOdooFile(file) {
  showToast(`Membaca file "${file.name}"...`, 'info');

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (rawRows.length < 2) {
        showToast('File tidak memiliki baris data.', 'warning');
        return;
      }

      // Deteksi otomatis apakah file IN atau OUT berdasarkan nama file atau header
      const fileNameUpper = file.name.toUpperCase();
      const isIncoming = fileNameUpper.includes('IN') || fileNameUpper.includes('MOVE') || fileNameUpper.includes('SPB');
      const actionType = isIncoming ? 'IMPORT_ODOO_IN' : 'IMPORT_ODOO_OUT';

      showToast(`Mengunggah ke database Site ${currentSite}...`, 'info');

      const response = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: actionType,
          site: currentSite,
          data: rawRows
        })
      });

      const resJson = await response.json();
      closeUploadModal();

      if (resJson.status === 'SUCCESS') {
        showToast(resJson.data.message || 'File Odoo berhasil disinkronkan!', 'success');
        fetchSiteData(currentSite); // Refresh data
      } else {
        throw new Error(resJson.message);
      }
    } catch (err) {
      console.error(err);
      showToast('Gagal memproses file Odoo: ' + err.message, 'warning');
    }
  };
  reader.readAsArrayBuffer(file);
}

function simulateOdooUploadToday() {
  const target = masterStockData[0];
  if (!target) return;

  target.history = target.history || [];
  target.history.push({
    date: '2026-11-08',
    docNo: 'MR-2611-4190',
    unit: '4315 (14H GRADER)',
    inQty: 0,
    outQty: 2,
    balance: target.stockBalance - 2,
    mechanic: 'Rudi Hartono'
  });

  target.outgoing += 2;
  target.stockBalance -= 2;

  closeUploadModal();
  renderStockCard();
  showToast('Simulasi sinkronisasi Odoo berhasil! Sisa stok terupdate.', 'success');
}

/**
 * ============================================================================
 * 9. MODAL & SHORTCUT GLOBAL (F2, ALT+P, ESCAPE)
 * ============================================================================
 */
function openInputOldCoreModal() {
  const modal = document.getElementById('inputOldCoreModal');
  if (modal) modal.classList.remove('hidden');
  initSkhqCombobox();
  setTimeout(() => {
    const skhqInput = document.getElementById('skhqComboboxInput');
    if (skhqInput) skhqInput.focus();
  }, 100);
}

function closeInputOldCoreModal() {
  const modal = document.getElementById('inputOldCoreModal');
  if (modal) modal.classList.add('hidden');
  closeSkhqComboboxDropdown();
}

function toggleSkhqOutstandingModal() {
  const modal = document.getElementById('skhqOutstandingModal');
  if (!modal) return;
  if (modal.classList.contains('hidden')) {
    renderSkhqOutstandingList();
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
  }
}

function renderSkhqOutstandingList() {
  const container = document.getElementById('skhqOutstandingListContainer');
  if (!container) return;
  container.innerHTML = '';

  const pendingSkhq = skhqIncomingShipments.filter(item => !item.coreReceivedAtSite);

  if (pendingSkhq.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-500">
        <i class="fa-solid fa-circle-check text-4xl text-emerald-500 mb-2"></i>
        <p class="font-bold text-sm">Semua SJ SKHQ sudah diterima fisik barang bekasnya!</p>
      </div>
    `;
    return;
  }

  pendingSkhq.forEach(item => {
    const div = document.createElement('div');
    div.className = "p-3.5 bg-rose-50 border-2 border-rose-200 rounded-2xl flex items-center justify-between";
    div.innerHTML = `
      <div>
        <div class="flex items-center gap-2">
          <span class="font-mono font-black text-sm text-rose-900 bg-rose-200 px-2 py-0.5 rounded">${item.sjSkhq}</span>
          <span class="text-xs text-rose-700 font-bold">Tgl: ${formatDateIndo(item.date)}</span>
        </div>
        <div class="font-bold text-slate-800 text-sm mt-1">${item.partDescription}</div>
        <div class="text-xs text-slate-500 font-medium">Unit: <strong>${item.unitAssigned}</strong> • Hutang: ${item.qtyIncoming} Unit</div>
      </div>
      <button onclick="quickReceiveSkhq('${item.sjSkhq}')" class="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow transition-all">
        + Terima Fisik
      </button>
    `;
    container.appendChild(div);
  });
}

function quickReceiveSkhq(sjSkhq) {
  toggleSkhqOutstandingModal();
  openInputOldCoreModal();
  const matched = skhqIncomingShipments.find(x => x.sjSkhq === sjSkhq);
  if (matched) selectSkhqFromCombobox(matched);
}

function toggleQuickSearchModal() {
  const modal = document.getElementById('searchModal');
  const input = document.getElementById('globalSearchInput');
  if (!modal) return;
  if (modal.classList.contains('hidden')) {
    modal.classList.remove('hidden');
    if (input) {
      input.value = '';
      filterQuickSearch('');
      setTimeout(() => input.focus(), 50);
    }
  } else {
    modal.classList.add('hidden');
  }
}

function filterQuickSearch(query) {
  const container = document.getElementById('quickSearchResults');
  if (!container) return;
  container.innerHTML = '';
  const q = query.toLowerCase().trim();

  const filtered = masterStockData.filter(item => {
    return item.partNumber.toLowerCase().includes(q) ||
           item.partDescription.toLowerCase().includes(q) ||
           item.binLoc.toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400">
        <i class="fa-solid fa-circle-question text-3xl mb-2 text-slate-300"></i>
        <p class="font-bold text-sm">Tidak ditemukan part yang cocok</p>
      </div>
    `;
    return;
  }

  filtered.forEach(item => {
    const originalIndex = masterStockData.indexOf(item);
    const div = document.createElement('div');
    div.className = 'p-3 hover:bg-amber-50 cursor-pointer rounded-xl flex items-center justify-between transition-colors border-b border-slate-100 last:border-none';
    div.onclick = () => {
      switchAppTab('new-part');
      selectPartFromCombobox(originalIndex);
      toggleQuickSearchModal();
    };
    div.innerHTML = `
      <div>
        <div class="font-mono font-bold text-slate-900 text-sm sm:text-base">${item.partNumber}</div>
        <div class="text-xs sm:text-sm font-semibold text-slate-600">${item.partDescription}</div>
        <div class="text-xs text-amber-800 font-bold mt-0.5">
          <i class="fa-solid fa-location-dot mr-1 text-amber-600"></i>Rak: ${item.binLoc}
        </div>
      </div>
      <div class="text-right">
        <span class="text-xs font-bold text-slate-400 block uppercase">Sisa Stok</span>
        <span class="font-mono text-lg font-black ${item.stockBalance > 0 ? 'text-emerald-700' : 'text-rose-600'}">
          ${item.stockBalance} ${item.uom}
        </span>
      </div>
    `;
    container.appendChild(div);
  });
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      toggleQuickSearchModal();
    }
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      switchAppTab('new-part');
      const partInput = document.getElementById('partComboboxInput');
      if (partInput) {
        partInput.focus();
        partInput.select();
      }
    }
    if (e.key === 'Escape') {
      closeLiveCameraModal();
      closePartComboboxDropdown();
      closeSkhqComboboxDropdown();
      closeUploadModal();
      const searchModal = document.getElementById('searchModal');
      if (searchModal) searchModal.classList.add('hidden');
      closeInputOldCoreModal();
      closeSendToSkhqModal();
      closePrintManifestModal();
      const outModal = document.getElementById('skhqOutstandingModal');
      if (outModal) outModal.classList.add('hidden');
    }
  });
}

function formatDateIndo(dateStr) {
  if (!dateStr) return '-';
  const parts = String(dateStr).split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
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

/**
 * DATA CADANGAN LOKAL (JIKA KONEKSI INTERNET SEDANG TERPUTUS)
 */
function loadFallbackMockData(site) {
  if (site === 'TNPN') {
    masterStockData = [
      {
        partNumber: '[0001-367-004]',
        cleanPn: '0001-367-004',
        partDescription: 'STARTING MOTOR DEUTZ ENGINE',
        uom: 'PC',
        binLoc: 'G.01-10A-2',
        beginningStock: 0,
        incoming: 15,
        outgoing: 3,
        stockBalance: 12,
        otherSiteStock: { site: 'TTLP', qty: 6, bin: 'R.02-B1' },
        history: [
          { date: '2026-10-15', docNo: 'TNPN/SPB/2026/10/1102', unit: 'PO-KTC-DEUTZ PUSAT', inQty: 10, outQty: 0, balance: 10, mechanic: '-' },
          { date: '2026-10-22', docNo: 'MR-2610-8841', unit: '1109 (EX1200-6)', inQty: 0, outQty: 1, balance: 9, mechanic: 'Bambang W.' },
          { date: '2026-11-01', docNo: 'TNPN/SPB/2026/11/0411', unit: 'TRANSFER SITE TBL3', inQty: 5, outQty: 0, balance: 14, mechanic: '-' },
          { date: '2026-11-05', docNo: 'MR-2611-4019', unit: '1304 (ZX870H)', inQty: 0, outQty: 1, balance: 13, mechanic: 'Agus Santoso' },
          { date: '2026-11-07', docNo: 'MR-2611-4088', unit: '27125 (XGA3250)', inQty: 0, outQty: 1, balance: 12, mechanic: 'Supriadi' }
        ]
      },
      {
        partNumber: '[001-553-3901]',
        cleanPn: '001-553-3901',
        partDescription: 'CABIN TILT PUMP ASSY',
        uom: 'PC',
        binLoc: 'G.01-01B-3',
        beginningStock: 1,
        incoming: 3,
        outgoing: 1,
        stockBalance: 3,
        otherSiteStock: { site: 'TTLP', qty: 1, bin: 'R.01-C3' },
        history: [
          { date: '2026-09-01', docNo: 'SALDO-AWAL-2026', unit: 'INVENTORY OPNAME', inQty: 1, outQty: 0, balance: 1, mechanic: '-' },
          { date: '2026-10-10', docNo: 'MR-2610-3321', unit: '27124 (XGA3250)', inQty: 0, outQty: 1, balance: 3, mechanic: 'Joko Widodo' }
        ]
      }
    ];

    oldCoreRegisterData = [
      {
        id: 'CORE-101',
        date: '2026-11-07',
        partNumber: '[0001-367-004]',
        cleanPn: '0001-367-004',
        partDescription: 'STARTING MOTOR DEUTZ ENGINE',
        unitId: '27125',
        sjSkhq: 'SJ-SKHQ-01',
        qty: 1,
        binLoc: 'PALET-CORE-A1',
        condition: 'Armature terbakar, siap re-winding',
        status: 'PENDING',
        sjSiteNumber: '',
        dateSent: ''
      }
    ];

    skhqIncomingShipments = [
      {
        sjSkhq: 'SJ-SKHQ-01',
        date: '2026-10-15',
        partNumber: '[0001-367-004]',
        partDescription: 'STARTING MOTOR DEUTZ ENGINE',
        unitAssigned: '27125',
        qtyIncoming: 1,
        coreReceivedAtSite: true
      },
      {
        sjSkhq: 'SJ-SKHQ-06',
        date: '2026-11-04',
        partNumber: '[0001-367-004]',
        partDescription: 'STARTING MOTOR DEUTZ ENGINE',
        unitAssigned: '1110',
        qtyIncoming: 1,
        coreReceivedAtSite: false
      }
    ];
  } else {
    // TTLP
    masterStockData = [
      {
        partNumber: '[0001-367-004]',
        cleanPn: '0001-367-004',
        partDescription: 'STARTING MOTOR DEUTZ ENGINE',
        uom: 'PC',
        binLoc: 'R.02-B1',
        beginningStock: 2,
        incoming: 6,
        outgoing: 2,
        stockBalance: 6,
        otherSiteStock: { site: 'TNPN', qty: 12, bin: 'G.01-10A-2' },
        history: [
          { date: '2026-09-15', docNo: 'TTLP/SPB/2026/09/018', unit: 'TERIMA PUSAT', inQty: 6, outQty: 0, balance: 8, mechanic: '-' },
          { date: '2026-11-02', docNo: 'MR-TTLP-2611-104', unit: 'DT-7223 (SHACMAN)', inQty: 0, outQty: 1, balance: 6, mechanic: 'Irfan M.' }
        ]
      }
    ];
    oldCoreRegisterData = [];
    skhqIncomingShipments = [];
  }
}