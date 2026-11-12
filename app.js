/**
 * ============================================================================
 * KTC STOCK CARD DIGITAL SYSTEM (v3.0.0 - Enterprise Web Edition)
 * Client-Side Application Engine & Central Sync API
 * 
 * Author: Adi Pranata (Plant & Logistics Supervisor)
 * Copyright (c) 2026 PT. KTC Coal Mining & Energy. All Rights Reserved.
 * ============================================================================
 */

// CENTRAL GOOGLE APPS SCRIPT WEB APP ENDPOINT
const API_URL = "https://script.google.com/macros/s/AKfycbx_0pePE9D-LOtyQvdJRoe4p2NfPaonOsMvZdgLVrMNtALlZD6bFG4NiWTtnjPdY5tTiA/exec";

// GLOBAL APPLICATION STATE
let currentUser = null;
let currentSite = 'TNPN';
let activeTab = 'new-part';
let currentPartIndex = -1; // Standby / Empty by default upon initial load

// IN-MEMORY MASTER CACHE
let masterStockData = [];
let oldCoreRegisterData = [];
let masterEquipmentList = [];
let skhqPendingList = [];

// COMBOBOX NAVIGATION STATE
let partComboboxIndex = -1;
let filteredPartList = [];
let skhqComboboxIndex = -1;
let filteredSkhqList = [];
let selectedSkhqValue = '';
let currentMaxCoreQuota = null; // Quota tracker batas maksimum supply SKHQ

// COMBOBOX UNIT ID (MASTEREQUIPMENT) STATE
let unitComboboxIndex = -1;
let filteredUnitList = [];

// DISPATCH & MANIFEST STATE
let selectedDispatchCoreIds = new Set();
let currentViewingManifestSj = null;
let currentPhotoBase64 = null;
let cameraMediaStream = null;
let currentCameraFacingMode = 'environment';

// INITIALIZATION ON DOM READY
window.addEventListener('DOMContentLoaded', () => {
  checkStoredUserAuth();
  setupKeyboardShortcuts();
  setupEnterToNextFieldNavigation();
  initFormDates();
  setupOutsideClickListeners();
});

/**
 * ============================================================================
 * 1. USER AUTHENTICATION & DEVICE SESSION (AUTO-REMEMBER & ROLE PERMISSIONS)
 * ============================================================================
 */
function checkStoredUserAuth() {
  const stored = localStorage.getItem('ktc_authenticated_user');
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
      applyUserSession(currentUser);
      return;
    } catch (e) {
      localStorage.removeItem('ktc_authenticated_user');
    }
  }
  const loginModal = document.getElementById('loginModal');
  if (loginModal) loginModal.classList.remove('hidden');
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const uInp = document.getElementById('loginUsername');
  const pInp = document.getElementById('loginPassword');
  const btn = document.getElementById('btnLoginSubmit');
  const errBox = document.getElementById('loginErrorMsg');

  const username = uInp.value.trim();
  const password = pInp.value.trim();

  if (!username || !password) return;

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> <span>CHECKING DATABASE...</span>`;
  if (errBox) errBox.classList.add('hidden');

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'LOGIN',
        username: username,
        password: password
      })
    });

    const resJson = await res.json();
    if (resJson.status === 'SUCCESS' && resJson.user) {
      currentUser = resJson.user;
      localStorage.setItem('ktc_authenticated_user', JSON.stringify(currentUser));
      applyUserSession(currentUser);
      showToast(`Welcome back, ${currentUser.name}!`, 'success');
    } else {
      throw new Error(resJson.message || 'Invalid Username or Password!');
    }
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-right-to-bracket text-lg"></i> <span>SIGN IN & REMEMBER DEVICE</span>`;
  }
}

function applyUserSession(user) {
  const loginModal = document.getElementById('loginModal');
  if (loginModal) loginModal.classList.add('hidden');

  const uNameElem = document.getElementById('headerUserName');
  if (uNameElem) {
    uNameElem.textContent = user.name || 'Adi Pranata';
  }

  const roleUpper = String(user.role || '').toUpperCase().trim();
  const siteUpper = String(user.site || '').toUpperCase().trim();

  // Deteksi wewenang role VIEWER
  const isViewer = roleUpper === 'VIEWER' || roleUpper.includes('VIEWER');
  const isSuper = roleUpper.includes('SUPER') || roleUpper.includes('ADMIN') || siteUpper === 'ALL' || roleUpper.includes('PLANNER');

  // Pengaturan Tampilan Role Badge di Header
  const roleBadge = document.getElementById('headerRoleBadge');
  if (roleBadge) {
    if (isViewer) {
      roleBadge.textContent = 'Viewer (Stock Card Only)';
    } else if (roleUpper.includes('SUPER')) {
      roleBadge.textContent = 'Plant & Logistics Spv';
    } else {
      roleBadge.textContent = user.role || 'Warehouse Storeman';
    }
  }

  // Penerapan Isolasi Khusus Role VIEWER
  const importBtn = document.getElementById('headerImportBtn');
  const tabSwitcher = document.getElementById('mainTabSwitcherContainer');

  if (isViewer) {
    // Sembunyikan Tombol Import Odoo dan Bilah Tab Switcher
    if (importBtn) importBtn.classList.add('hidden');
    if (tabSwitcher) tabSwitcher.classList.add('hidden');

    // Kunci tampilan ke Active Stock Card murni
    switchAppTab('new-part');
  } else {
    // Tampilkan untuk role operasional (Storeman, Supervisor, Admin)
    if (importBtn) importBtn.classList.remove('hidden');
    if (tabSwitcher) tabSwitcher.classList.remove('hidden');
  }

  // Pengaturan Akses Switcher Site (TNPN / TTLP)
  const switcher = document.getElementById('supervisorSiteSwitcher');
  if (isSuper) {
    if (switcher) switcher.classList.remove('hidden');
    currentSite = (siteUpper === 'ALL' || !siteUpper) ? 'TNPN' : siteUpper;
  } else {
    if (switcher) switcher.classList.add('hidden');
    currentSite = siteUpper || 'TNPN';
  }

  updateSiteVisuals();
  fetchSiteData(currentSite);
}

function handleLogout() {
  const modal = document.getElementById('logoutConfirmModal');
  if (modal) modal.classList.remove('hidden');
}

function closeLogoutModal() {
  const modal = document.getElementById('logoutConfirmModal');
  if (modal) modal.classList.add('hidden');
}

function executeLogout() {
  localStorage.removeItem('ktc_authenticated_user');
  currentUser = null;
  closeLogoutModal();

  // Reset Elemen Tampilan ke Kondisi Standar
  const importBtn = document.getElementById('headerImportBtn');
  const tabSwitcher = document.getElementById('mainTabSwitcherContainer');
  if (importBtn) importBtn.classList.remove('hidden');
  if (tabSwitcher) tabSwitcher.classList.remove('hidden');

  const uInp = document.getElementById('loginUsername');
  const pInp = document.getElementById('loginPassword');
  if (uInp) uInp.value = '';
  if (pInp) pInp.value = '';

  const loginModal = document.getElementById('loginModal');
  if (loginModal) loginModal.classList.remove('hidden');

  showToast('You have signed out.', 'info');
}

function updateSiteVisuals() {
  const headerIndicator = document.getElementById('headerSiteIndicator');
  const cardBadge = document.getElementById('cardSiteBadge');
  const crossSiteName = document.getElementById('crossSiteName');
  const manifestSub = document.getElementById('manifestSiteSubtitle');

  if (headerIndicator) headerIndicator.textContent = `SITE ${currentSite}`;
  if (cardBadge) cardBadge.textContent = `SITE ${currentSite}`;
  if (crossSiteName) crossSiteName.textContent = currentSite === 'TNPN' ? 'Site TTLP' : 'Site TNPN';
  if (manifestSub) manifestSub.textContent = `Plant & Warehouse Department - Logistics Site ${currentSite}`;

  const btnTNPN = document.getElementById('siteBtnTNPN');
  const btnTTLP = document.getElementById('siteBtnTTLP');
  if (btnTNPN && btnTTLP) {
    if (currentSite === 'TNPN') {
      btnTNPN.className = "px-3 py-1.5 rounded-lg text-xs font-black transition-all bg-amber-400 text-amber-950 shadow-sm flex items-center gap-1";
      btnTTLP.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-white flex items-center gap-1";
    } else {
      btnTNPN.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-white flex items-center gap-1";
      btnTTLP.className = "px-3 py-1.5 rounded-lg text-xs font-black transition-all bg-amber-400 text-amber-950 shadow-sm flex items-center gap-1";
    }
  }
}

function switchSite(siteKey) {
  const roleUpper = String(currentUser?.role || '').toUpperCase();
  const siteUpper = String(currentUser?.site || '').toUpperCase();
  const isSuper = roleUpper.includes('SUPER') || roleUpper.includes('ADMIN') || siteUpper === 'ALL' || roleUpper.includes('PLANNER');

  if (!isSuper && siteUpper !== siteKey) {
    showToast('Access restricted to your assigned site.', 'warning');
    return;
  }
  currentSite = siteKey;
  currentPartIndex = -1;
  updateSiteVisuals();
  fetchSiteData(siteKey);
  showToast(`Switched to Site ${siteKey} Warehouse`, 'info');
}

/**
 * ============================================================================
 * 2. LIVE CENTRAL DATABASE DATA FETCHER & CORE FILTER
 * ============================================================================
 */
async function fetchSiteData(site, suppressToast = false) {
  if (!suppressToast) {
    showToast(`Connecting to Site ${site} Database...`, 'info');
  }
  setSyncStatus('Synchronizing with Central Server...');

  try {
    const response = await fetch(`${API_URL}?action=GET_ALL_DATA&site=${site}`);
    const json = await response.json();

    if (json.status === 'SUCCESS' && json.data) {
      masterStockData = json.data.parts || [];
      oldCoreRegisterData = json.data.oldCores || [];
      masterEquipmentList = json.data.equipment || [];

      populateMasterEquipmentDatalist();
      calculateSkhqPendingList();

      const now = new Date();
      const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth()+1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WITA`;

      if (masterStockData.length === 0 && oldCoreRegisterData.length === 0) {
        setSyncStatus(`Database Ready • No Transaction Data at Site ${site}`);
      } else {
        setSyncStatus(`Database Connected: ${timeStr}`);
      }
    } else {
      throw new Error(json.message || 'Failed to load database records.');
    }
  } catch (err) {
    console.warn('Backend connection error:', err);
    setSyncStatus('Offline Mode / Connection Lost');
  }

  currentPartIndex = -1;
  initPartCombobox();
  initSkhqCombobox();
  renderStockCard();
  renderOldCoreTable();
  updateOldCoreCounters();
}

async function refreshCurrentSiteData() {
  const icon = document.getElementById('refreshIcon');
  if (icon) icon.classList.add('fa-spin');
  await fetchSiteData(currentSite, true);
  if (icon) icon.classList.remove('fa-spin');
  showToast(`Site ${currentSite} data refreshed!`, 'success');
}

function setSyncStatus(txt) {
  const syncElem = document.getElementById('syncTimestamp');
  if (syncElem) syncElem.textContent = txt;
}

function populateMasterEquipmentDatalist() {
  const datalist = document.getElementById('masterEquipmentDatalist');
  if (!datalist) return;
  datalist.innerHTML = '';

  masterEquipmentList.forEach(eq => {
    const opt = document.createElement('option');
    opt.value = eq.unitId;
    opt.textContent = `${eq.unitId} - ${eq.model} (${eq.jenis})`;
    datalist.appendChild(opt);
  });
}

/**
 * Filter Cerdas Deteksi Barang Habis Pakai (Consumables / Non-Core Exclusion)
 * Mengabaikan baut, cairan, hose, filter, fitting, dan scrap aus dari Outstanding SKHQ Cores
 */
function isConsumableOrNonCore(partNumber, description, uom) {
  const desc = String(description || '').toUpperCase();
  const pn = String(partNumber || '').toUpperCase().trim();
  const uomUp = String(uom || '').toUpperCase().trim();

  // 1. Cek Part Number yang Diawali Kode Pelumas / Kimia / Gas / Cat
  if (/^(OIL-|LUB-|GREASE-|FLUID-|CHEM-|GAS-|PAINT-|BAT-)/.test(pn)) {
    return true;
  }

  // 2. Cek Satuan Curah / Cairan / Panjang / Tabung (Bulk, Fluid, Gas & Roll UOM)
  const fluidBulkUoms = ['LTR', 'LITER', 'MTR', 'METER', 'DRUM', 'PAIL', 'CAN', 'BTL', 'KG', 'ROLL', 'TUBE', 'CYL', 'TBNG', 'BKS', 'SAK'];
  if (fluidBulkUoms.includes(uomUp)) return true;

  // 3. Pengecekan Khusus Pelumas & Minyak (Oil & Lubricants Watertight Check)
  if (/\b(OIL|PELUMAS|LUBRICANT|LUBRICATION|FLUID|GREASE|DIESEL|SOLAR|COOLANT)\b/.test(desc) ||
      /\b(DTE|MOBIL|SHELL|MEDITRAN|TELLUS|ROTELLA|RIMULA|DELVAC|CALTEX|CASTROL|ATF)\b/.test(desc)) {
    
    // Pengecualian Komponen Fisik Mesin yang Mengandung Kata "OIL"
    const isPhysicalOilComponent = /\b(OIL PUMP|PUMP,? OIL|OIL COOLER|COOLER,? OIL|OIL PAN|OIL TANK|OIL LEVEL SENSOR|OIL PRESSURE SENSOR|OIL SWITCH)\b/.test(desc);
    
    if (!isPhysicalOilComponent) {
      return true;
    }
  }

  // 4. Pengecekan Khusus Valve Core (Tanpa Mengabaikan Control/Relief/Solenoid Valve)
  if (/\b(VALVE CORE|CORE VALVE|PENTIL)\b/.test(desc)) {
    return true;
  }

  // 5. Pola Lengkap Barang Habis Pakai, Material Bengkel, Cat, Gas, & Perlengkapan Aus
  const consumablePatterns = [
    // Fastener & Hardware
    /\bBOLT\b/, /\bNUT\b/, /\bWASHER\b/, /\bSCREW\b/, /\bSTUD\b/, /\bCOTTER\b/, /\bPIN LOCK\b/,
    /\bPAKU\b/, /\bNAIL\b/, /\bCABLE TIE(S)?\b/, /\bTIE WRAP\b/,
    
    // Plumbing, Selang, Fitting
    /\bHOSE\b/, /\bFITTING\b/, /\bADAPTOR\b/, /\bADAPTER\b/, /\bNIPPLE\b/, /\bCLAMP\b/, /\bFLANGE\b/, /\bELBOW\b/, /\bCOUPLING\b/,
    
    // GET (Ground Engaging Tools)
    /\bTOOTH\b/, /\bCUTTING EDGE\b/, /\bEND BIT\b/, /\bSIDE CUTTER\b/,
    
    // Filter & Elemen
    /\bFILTER\b/, /\bELEMENT\b/, /\bCARTRIDGE\b/, /\bSTRAINER\b/,
    
    // Elektrikal & Wiring Consumables
    /\bFUSE\b/, /\bRELAY\b/, /\bBULB\b/, /\bBOHLAM\b/, /\bLAMP\b/, /\bWIRING TAPE\b/,
    /\b(TAPE ELECTRIC|ELECTRICAL TAPE|ISOLASI|LAKBAN|DUCT TAPE|MASKING TAPE)\b/,
    /\b(SCUN CABLE|SKUN CABLE|SKUN|SCUN|CABLE LUG|TERMINAL LUG)\b/,
    /\b(TIMAH SOLDER|TIMAH|SOLDER WIRE)\b/,
    /\b(SELONGSONG|HEAT SHRINK|SHRINK TUBE|LOOM|CONDUIT)\b/,
    /\b(BATTERY|BATERAI|ACCU|AKI)\b/,
    
    // Seal, Karet, Belt & Wiper
    /\bO-RING\b/, /\bSEAL\b/, /\bGASKET\b/, /\bPACKING\b/,
    /\b(V-BELT|V BELT|FAN BELT|TIMING BELT|BELT)\b/, /\bWIPER BLADE\b/,
    
    // Ban & Roda
    /\b(TYRE|TIRE|BAN LUAR|BAN DALAM|FLAP TYRE)\b/,
    
    // Cat, Dempul, Thinner & Perlengkapan Pengecatan
    /\b(CAT|PAINT|SPRAY PAINT|PYLOX|DANAGLOSS|TOP COLOR|SUPER BLACK STEEL GLOSS)\b/,
    /\b(THINNER|TINER)\b/,
    /\b(DEMPUL|PUTTY|BODY FILLER)\b/,
    /\b(EPOXY|EPOKSI)\b/,
    /\b(KUAS|PAINT BRUSH|ROLLER CAT)\b/,
    
    // Lem, Perekat & Silicone Sealant
    /\b(ALTECO|LEM|GLUE|THREE BOND|THREEBOND|SILICONE|SILIKON|SEALANT|LOCTITE)\b/,
    
    // Abrasif, Gerinda & Sikat Pembersih
    /\b(AMPLAS|SANDPAPER|ABRASIVE)\b/,
    /\b(GRIND DISC|GRINDING DISC|CUTTING DISC|BATU GERINDA|MATA GERINDA)\b/,
    /\b(CUP BRUSH|WIRE BRUSH|SIKAT MANGKOK|SIKAT KAWAT)\b/,
    
    // Bahan Kimia, Cairan Pembersih & Aki
    /\b(AIR ZUUR|ZUUR|AIR AKI|ELECTROLYTE)\b/,
    /\b(SABUN|SOAP|DETERGENT|DISHWASH|SUNLIGHT|RINSO)\b/,
    /\b(BRAKE FLUID|DEGREASER|CLEANER|MAJUN|RAGS)\b/,
    
    // Pengelasan & Gas Industri
    /\b(WELDING|ELECTRODE|ELEKTRODA|KAWAT LAS)\b/,
    /\b(GAS ACETYLENE|ACETYLENE|ASETILEN|KARBIT|OXYGEN GAS|ARGON)\b/,
    
    // Material Logam Mentah & Pembungkus
    /\b(BESI|STEEL BAR|HOLLOW PIPE|PLAT BESI|BESI SIKU)\b/,
    /\b(PLASTIK|PLASTIC|KANTONG PLASTIK|STRETCH FILM)\b/
  ];

  for (const pattern of consumablePatterns) {
    if (pattern.test(desc)) {
      // Proteksi Komponen Utama / Rakitan Penting
      if (/\b(PUMP|MOTOR|CYLINDER|TURBO|INJECTOR|ALTERNATOR|STARTER|TRANSMISSION|DIFFERENTIAL|TORQUE CONVERTER)\b/.test(desc)) {
        if (/\b(GASKET|SEAL|O-RING|BOLT|WASHER|PACKING|CLAMP|HOSE|FITTING|CAT|PAINT|LEM)\b/.test(desc)) {
          return true;
        }
        return false;
      }
      return true;
    }
  }

  return false;
}

function calculateSkhqPendingList() {
  const receivedQtyMap = new Map();
  oldCoreRegisterData.forEach(c => {
    const k = `${c.sjSkhq}_${c.cleanPn}`.toUpperCase();
    receivedQtyMap.set(k, (receivedQtyMap.get(k) || 0) + (parseFloat(c.qty) || 1));
  });

  skhqPendingList = [];

  masterStockData.forEach(p => {
    (p.history || []).forEach(h => {
      if (h.inQty > 0 && (h.docNo.includes('SPB') || h.docNo.includes('SKHQ') || h.docNo.includes('SJ'))) {
        const key = `${h.docNo}_${p.cleanPn}`.toUpperCase();

        if (isConsumableOrNonCore(p.cleanPn, p.partDescription, p.uom)) {
          return;
        }

        const alreadyReceived = receivedQtyMap.get(key) || 0;
        const remainingQuota = Math.max(0, h.inQty - alreadyReceived);

        if (remainingQuota > 0) {
          skhqPendingList.push({
            sjSkhq: h.docNo,
            date: h.date,
            partNumber: p.cleanPn,
            partDescription: p.partDescription,
            unitAssigned: (h.unit && !h.unit.toUpperCase().startsWith('WAREHOUSE') && h.unit !== '-') ? h.unit : '',
            qtyIncoming: h.inQty,
            remainingQuota: remainingQuota
          });
        }
      }
    });
  });
}

/**
 * ============================================================================
 * 3. RENDER ACTIVE STOCK CARD (WITH DIRECTION BADGES & 15-ROW LIMIT)
 * ============================================================================
 */
function renderStockCard() {
  const pnElem = document.getElementById('cardPartNumber');
  const descElem = document.getElementById('cardPartDescription');
  const uomElem = document.getElementById('cardUom');
  const binElem = document.getElementById('cardBinLoc');
  const balElem = document.getElementById('cardStockBalance');
  const unitElem = document.getElementById('cardStockUnit');
  const begElem = document.getElementById('cardBeginningStock');
  const inElem = document.getElementById('cardTotalIncoming');
  const outElem = document.getElementById('cardTotalOutgoing');
  const balBox = document.getElementById('cardBalanceBox');
  const tbody = document.getElementById('cardLedgerBody');
  const inp = document.getElementById('partComboboxInput');
  const noticeElem = document.getElementById('cardMutasiLimitNotice');

  if (currentPartIndex === -1 || !masterStockData || masterStockData.length === 0) {
    if (pnElem) pnElem.textContent = '[SELECT PART NUMBER]';
    if (descElem) descElem.textContent = 'Type in search box or click dropdown above to open active stock card.';
    if (binElem) binElem.textContent = '--';
    if (balElem) balElem.textContent = '0';
    if (unitElem) unitElem.textContent = 'PC';
    if (begElem) begElem.textContent = '0';
    if (inElem) inElem.textContent = '0';
    if (outElem) outElem.textContent = '0';
    if (inp) inp.value = '';
    if (noticeElem) noticeElem.textContent = '*Please select an item above to display mutation history.';
    if (balBox) {
      balBox.className = "bg-slate-700 text-white border-2 border-slate-900 rounded-2xl px-4 sm:px-6 py-2 text-center sm:text-right shadow-md min-w-[130px]";
    }
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-12 text-slate-400 italic font-semibold text-sm">Please select a Part Number from the search field above.</td></tr>`;
    }
    return;
  }

  const item = masterStockData[currentPartIndex];
  if (!item) return;

  if (inp && (!inp.value || inp.value.trim() === '')) {
    inp.value = `${item.cleanPn || item.partNumber} - ${item.partDescription}`;
  }

  if (pnElem) pnElem.textContent = item.cleanPn || item.partNumber;
  if (descElem) descElem.textContent = item.partDescription;
  if (uomElem) uomElem.textContent = item.uom;
  if (binElem) binElem.textContent = item.binLoc || '--';
  if (balElem) balElem.textContent = item.stockBalance;
  if (unitElem) unitElem.textContent = item.uom;
  if (begElem) begElem.textContent = item.beginningStock;
  if (inElem) inElem.textContent = item.incoming;
  if (outElem) outElem.textContent = item.outgoing;

  const crossNameElem = document.getElementById('crossSiteName');
  const crossQtyElem = document.getElementById('crossSiteQty');
  const crossBinElem = document.getElementById('crossSiteBin');
  if (item.otherSiteStock) {
    if (crossNameElem) crossNameElem.textContent = `Site ${item.otherSiteStock.site}`;
    if (crossQtyElem) crossQtyElem.textContent = item.otherSiteStock.qty;
    if (crossBinElem) crossBinElem.textContent = item.otherSiteStock.bin;
  }

  if (balBox) {
    if (item.stockBalance > 5) {
      balBox.className = "bg-emerald-700 text-white border-2 border-emerald-900 rounded-2xl px-4 sm:px-6 py-2 text-center sm:text-right shadow-md min-w-[130px]";
    } else if (item.stockBalance > 0) {
      balBox.className = "bg-amber-600 text-white border-2 border-amber-800 rounded-2xl px-4 sm:px-6 py-2 text-center sm:text-right shadow-md min-w-[130px]";
    } else {
      balBox.className = "bg-rose-700 text-white border-2 border-rose-900 rounded-2xl px-4 sm:px-6 py-2 text-center sm:text-right shadow-md min-w-[130px]";
    }
  }

  if (tbody) {
    tbody.innerHTML = '';
    let history = (item.history || []).slice();

    if (history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400 italic">No mutation records found for this part in database.</td></tr>`;
      if (noticeElem) noticeElem.textContent = '*No transaction history recorded yet.';
      return;
    }

    history.sort((a, b) => new Date(b.date) - new Date(a.date));
    const displayHistory = history.slice(0, 15);

    if (noticeElem) {
      if (history.length > 15) {
        noticeElem.textContent = `*Displaying 15 latest mutation transactions (out of ${history.length} total entries in database).`;
      } else {
        noticeElem.textContent = `*Displaying all ${history.length} latest mutation transactions.`;
      }
    }

    displayHistory.forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.className = (idx % 2 === 0 ? 'bg-white/70' : 'bg-amber-50/50') + ' hover:bg-amber-100/60 border-b border-amber-200/80 transition-colors';
      const displayOut = Math.abs(row.outQty || 0);

      const inBadgeHtml = row.inQty > 0 
        ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100/90 text-emerald-950 font-mono font-black text-xs sm:text-sm border border-emerald-300 shadow-sm"><i class="fa-solid fa-arrow-down text-[11px] text-emerald-600"></i>+${row.inQty}</span>`
        : `<span class="text-slate-400 font-mono font-bold">-</span>`;

      const outBadgeHtml = displayOut > 0
        ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-100/90 text-rose-950 font-mono font-black text-xs sm:text-sm border border-rose-300 shadow-sm"><i class="fa-solid fa-arrow-up text-[11px] text-rose-600"></i>-${displayOut}</span>`
        : `<span class="text-slate-400 font-mono font-bold">-</span>`;

      // Bedakan visual Allocation: Gudang (IN) vs Unit Alat Berat (OUT)
      const isWarehouseLoc = String(row.unit || '').toUpperCase().startsWith('WAREHOUSE');
      const allocBadgeHtml = isWarehouseLoc
        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200 font-bold text-xs"><i class="fa-solid fa-warehouse text-[10px] text-blue-600"></i>${row.unit}</span>`
        : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-900 border border-slate-300 font-mono font-bold text-xs">${row.unit || '-'}</span>`;

      // Mechanic: Asal SKHQ/Vendor untuk IN, Nama Mekanik untuk OUT
      const isIncomingRow = (row.inQty || 0) > 0;
      const mechanicBadgeHtml = isIncomingRow
        ? `<span class="text-xs font-semibold text-slate-700 truncate block max-w-[160px] mx-auto" title="${row.mechanic || '-'}"><i class="fa-solid fa-truck text-[10px] text-amber-600 mr-1"></i>${row.mechanic || '-'}</span>`
        : `<span class="text-xs font-bold text-slate-800">${row.mechanic || '-'}</span>`;

      tr.innerHTML = `
        <td class="py-3 px-3 border-r border-amber-200 text-center font-mono font-bold text-slate-500">${idx + 1}</td>
        <td class="py-3 px-3 border-r border-amber-200 font-mono text-xs sm:text-sm font-semibold whitespace-nowrap">${formatDateIndo(row.date)}</td>
        <td class="py-3 px-3 border-r border-amber-200 font-mono text-xs sm:text-sm font-bold text-slate-900">${row.docNo}</td>
        <td class="py-3 px-3 border-r border-amber-200 text-xs sm:text-sm font-semibold">${allocBadgeHtml}</td>
        <td class="py-3 px-3 border-r border-amber-200 text-center">${inBadgeHtml}</td>
        <td class="py-3 px-3 border-r border-amber-200 text-center">${outBadgeHtml}</td>
        <td class="py-3 px-3 border-r border-amber-200 text-center font-mono font-black text-slate-950 bg-amber-100/50 text-sm sm:text-base">${row.balance}</td>
        <td class="py-3 px-3 text-center">${mechanicBadgeHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

function copyPartNumber() {
  if (currentPartIndex === -1 || !masterStockData[currentPartIndex]) {
    showToast('Please select a part number first!', 'warning');
    return;
  }
  const cur = masterStockData[currentPartIndex];
  const text = cur.cleanPn || cur.partNumber;
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Part Number [${text}] copied!`, 'success');
  });
}

/**
 * ============================================================================
 * 4. ACTIVE STOCK CARD COMBOBOX (KEYBOARD & TOUCH)
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
  if (drop.classList.contains('hidden')) openPartComboboxDropdown();
  else closePartComboboxDropdown();
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
    return (item.cleanPn || item.partNumber).toLowerCase().includes(q) ||
           item.partDescription.toLowerCase().includes(q) ||
           (item.binLoc || '').toLowerCase().includes(q);
  });

  drop.innerHTML = '';
  partComboboxIndex = -1;

  if (filteredPartList.length === 0) {
    drop.innerHTML = `<div class="p-4 text-xs sm:text-sm text-slate-500 italic text-center">No matching part found</div>`;
    return;
  }

  filteredPartList.forEach((item, idx) => {
    const origIdx = masterStockData.indexOf(item);
    const div = document.createElement('div');
    div.id = `part-combo-opt-${idx}`;
    div.className = "px-4 py-3 hover:bg-amber-100 cursor-pointer flex items-center justify-between text-left transition-colors border-b border-slate-100 last:border-none";
    div.onclick = () => selectPartFromCombobox(origIdx);
    div.innerHTML = `
      <div>
        <div class="font-mono font-bold text-slate-900 text-sm sm:text-base">${item.cleanPn || item.partNumber}</div>
        <div class="text-xs sm:text-sm font-semibold text-slate-700 leading-snug">${item.partDescription}</div>
        <div class="text-xs font-bold text-amber-800 mt-1"><i class="fa-solid fa-location-dot mr-1 text-amber-600"></i>Bin: ${item.binLoc}</div>
      </div>
      <div class="text-right pl-3 shrink-0">
        <span class="text-[10px] font-bold text-slate-400 block uppercase">SOH</span>
        <span class="font-mono text-base sm:text-lg font-black ${item.stockBalance > 0 ? 'text-emerald-700' : 'text-rose-600'}">${item.stockBalance} ${item.uom}</span>
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
    inp.value = `${cur.cleanPn || cur.partNumber} - ${cur.partDescription}`;
  }
  updateClearButtonVisibility();
  closePartComboboxDropdown();
  renderStockCard();
}

/**
 * ============================================================================
 * 5. REGISTER OLD CORE & OPERASIONAL TAB
 * ============================================================================
 */
function switchAppTab(tab) {
  // Pengaman: Cegah role VIEWER beralih ke Old Core
  const roleUpper = String(currentUser?.role || '').toUpperCase().trim();
  const isViewer = roleUpper === 'VIEWER' || roleUpper.includes('VIEWER');
  if (isViewer && tab === 'old-core') {
    showToast('Old Core access is restricted for Viewer role.', 'warning');
    return;
  }

  activeTab = tab;
  const vNew = document.getElementById('viewNewPart');
  const vCore = document.getElementById('viewOldCore');
  const bNew = document.getElementById('tabBtnNewPart');
  const bCore = document.getElementById('tabBtnOldCore');

  if (tab === 'new-part') {
    if (vNew) vNew.classList.remove('hidden');
    if (vCore) vCore.classList.add('hidden');
    if (bNew) bNew.className = "flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-2xl font-black text-xs sm:text-sm transition-all border-2 border-amber-300 bg-[#FFFDF2] text-slate-900 shadow";
    if (bCore) bCore.className = "flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-2xl font-black text-xs sm:text-sm transition-all border-2 border-transparent bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white";
    renderStockCard();
  } else {
    if (vNew) vNew.classList.add('hidden');
    if (vCore) vCore.classList.remove('hidden');
    if (bNew) bNew.className = "flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-2xl font-black text-xs sm:text-sm transition-all border-2 border-transparent bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white";
    if (bCore) bCore.className = "flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-2xl font-black text-xs sm:text-sm transition-all border-2 border-orange-400 bg-[#FFF8F0] text-orange-950 shadow";
    renderOldCoreTable();
  }
}

function renderOldCoreTable() {
  const tbody = document.getElementById('oldCoreTableBody');
  const mobileList = document.getElementById('oldCoreMobileCardList');
  const filterElem = document.getElementById('filterOldCoreStatus');
  const filter = filterElem ? filterElem.value : 'ALL';

  let list = oldCoreRegisterData;
  if (filter === 'PENDING') list = list.filter(x => x.status === 'PENDING');
  else if (filter === 'SENT') list = list.filter(x => x.status === 'SENT');

  // Mobile View
  if (mobileList) {
    mobileList.innerHTML = '';
    if (list.length === 0) {
      mobileList.innerHTML = `<div class="text-center py-8 text-slate-500 italic text-xs">No old core records found</div>`;
    } else {
      list.forEach(row => {
        const isPending = row.status === 'PENDING';
        const card = document.createElement('div');
        card.className = "bg-white p-4 rounded-3xl border-2 border-orange-200 shadow-sm space-y-3 text-slate-900";
        card.innerHTML = `
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-mono text-xs font-black">UNIT ${row.unitId}</span>
                <span class="font-mono text-xs font-bold text-orange-950 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300">Ex ${row.sjSkhq}</span>
              </div>
              <div class="font-mono font-black text-base text-slate-950 mt-1">${row.cleanPn || row.partNumber}</div>
              <div class="text-xs sm:text-sm font-bold text-slate-700 leading-snug">${row.partDescription}</div>
              <div class="text-xs text-slate-500 font-medium mt-1"><i class="fa-solid fa-wrench text-orange-500 mr-1"></i>${row.condition}</div>
            </div>
            ${row.photoUrl ? `
              <img src="${row.photoUrl}" onclick="previewItemPhoto('${row.id}')" class="w-16 h-16 object-cover rounded-2xl border-2 border-slate-300 shadow-sm shrink-0 cursor-pointer hover:scale-105 transition-transform" title="Tap to zoom">
            ` : `
              <div class="w-16 h-16 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-[10px] text-slate-400 font-bold shrink-0">
                <i class="fa-solid fa-camera text-base mb-0.5"></i>
                <span>No Photo</span>
              </div>
            `}
          </div>
          <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
            <span class="font-bold ${isPending ? 'text-amber-800' : 'text-blue-800'}">
              ${isPending ? 'On ' + currentSite + ' Pallet (Bin: ' + row.binLoc + ')' : 'Dispatched SKHQ (' + row.sjSiteNumber + ')'}
            </span>
            <div>
              ${isPending ? `
                <button onclick="openSendToSkhqModal('${row.id}')" class="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-black rounded-xl text-xs shadow-tactile-blue transition-all flex items-center gap-1.5">
                  <i class="fa-solid fa-truck-ramp-box"></i> Dispatch (SPB)
                </button>
              ` : `
                <button onclick="openPrintManifestModalForSj('${row.sjSiteNumber}')" class="px-3 py-1.5 bg-blue-50 text-blue-900 font-mono font-black rounded-xl border border-blue-300 text-xs">
                  <i class="fa-solid fa-print mr-1"></i> ${row.sjSiteNumber}
                </button>
              `}
            </div>
          </div>
        `;
        mobileList.appendChild(card);
      });
    }
  }

  // Desktop Table View
  if (tbody) {
    tbody.innerHTML = '';
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400 italic">No old core records found</td></tr>`;
      return;
    }

    list.forEach((row, idx) => {
      const isPending = row.status === 'PENDING';
      const tr = document.createElement('tr');
      tr.className = (idx % 2 === 0 ? 'bg-white' : 'bg-orange-50/40') + ' hover:bg-orange-100/60 transition-colors border-b border-orange-200';
      tr.innerHTML = `
        <td class="py-3 px-3 text-center font-mono font-bold text-slate-500 border-r border-orange-200">${idx + 1}</td>
        <td class="py-3 px-3 font-mono text-xs whitespace-nowrap border-r border-orange-200">${formatDateIndo(row.date)}</td>
        <td class="py-3 px-3 font-mono font-black text-slate-950 border-r border-orange-200">${row.cleanPn || row.partNumber}</td>
        <td class="py-3 px-3 font-semibold text-slate-800 border-r border-orange-200">
          <div>${row.partDescription}</div>
          <div class="text-[11px] text-slate-500 mt-0.5"><i class="fa-solid fa-wrench text-orange-500 mr-1"></i>${row.condition}</div>
        </td>
        <td class="py-3 px-3 text-center font-mono font-black border-r border-orange-200"><span class="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-900">${row.unitId}</span></td>
        <td class="py-3 px-3 font-mono text-xs text-orange-950 border-r border-orange-200">${row.sjSkhq}</td>
        <td class="py-3 px-3 text-xs border-r border-orange-200">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold ${isPending ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-blue-100 text-blue-900 border border-blue-300'}">
            <span class="w-2 h-2 rounded-full ${isPending ? 'bg-amber-500' : 'bg-blue-600'}"></span>
            <span>${isPending ? 'On Pallet ' + currentSite : 'Dispatched SKHQ'}</span>
          </span>
          <div class="text-[11px] font-mono font-bold text-slate-600 mt-1">Bin: ${row.binLoc}</div>
        </td>
        <td class="py-3 px-3 text-center">
          ${isPending ? `
            <button onclick="openSendToSkhqModal('${row.id}')" class="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl text-xs shadow-tactile-blue flex items-center justify-center gap-1 mx-auto">
              <i class="fa-solid fa-truck-ramp-box"></i> Dispatch (SPB)
            </button>
          ` : `
            <button onclick="openPrintManifestModalForSj('${row.sjSiteNumber}')" class="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 font-mono font-bold rounded-xl text-xs border border-blue-300">
              <i class="fa-solid fa-print mr-1"></i> ${row.sjSiteNumber}
            </button>
          `}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  updateOldCoreCounters();
}

function updateOldCoreCounters() {
  const pending = oldCoreRegisterData.filter(x => x.status === 'PENDING').length;
  const sent = oldCoreRegisterData.filter(x => x.status === 'SENT').length;
  const due = skhqPendingList.length;

  const b = document.getElementById('oldCoreCountBadge');
  if (b) b.textContent = `${pending}`;

  const pE = document.getElementById('summaryCorePending');
  if (pE) pE.textContent = `${pending} Unit`;

  const sE = document.getElementById('summaryCoreSent');
  if (sE) sE.textContent = `${sent} Unit`;

  const dE = document.getElementById('summaryCoreDue');
  if (dE) dE.textContent = `${due} Item`;
}

/**
 * ============================================================================
 * 5.1 EXPORT OLD CORE TO CSV (PERIODE BULAN & FILTER STATUS)
 * ============================================================================
 */
function openExportOldCoreModal() {
  const modal = document.getElementById('exportOldCoreModal');
  const monthInput = document.getElementById('exportCoreMonthInput');
  const allCheckbox = document.getElementById('exportAllPeriodsCheckbox');
  const statusSelect = document.getElementById('exportCoreStatusSelect');

  if (!modal) return;

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  if (monthInput) {
    monthInput.value = currentMonthStr;
    monthInput.disabled = false;
  }
  if (allCheckbox) allCheckbox.checked = false;
  if (statusSelect) statusSelect.value = 'ALL';

  modal.classList.remove('hidden');
}

function closeExportOldCoreModal() {
  const modal = document.getElementById('exportOldCoreModal');
  if (modal) modal.classList.add('hidden');
}

function toggleExportAllPeriods(isChecked) {
  const monthInput = document.getElementById('exportCoreMonthInput');
  if (monthInput) {
    monthInput.disabled = isChecked;
  }
}

function executeOldCoreCsvExport() {
  const allCheckbox = document.getElementById('exportAllPeriodsCheckbox');
  const monthInput = document.getElementById('exportCoreMonthInput');
  const statusSelect = document.getElementById('exportCoreStatusSelect');

  const isAllPeriod = allCheckbox ? allCheckbox.checked : false;
  const selectedPeriod = monthInput ? monthInput.value.trim() : '';
  const selectedStatus = statusSelect ? statusSelect.value : 'ALL';

  if (!isAllPeriod && !selectedPeriod) {
    showToast('Please select Month and Year period!', 'warning');
    return;
  }

  let filtered = oldCoreRegisterData.filter(item => {
    if (selectedStatus === 'PENDING' && item.status !== 'PENDING') return false;
    if (selectedStatus === 'SENT' && item.status !== 'SENT') return false;

    if (!isAllPeriod) {
      const itemDateStr = String(item.date || '').trim();
      if (!itemDateStr.startsWith(selectedPeriod)) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    showToast(`No Old Core records found for selected filter!`, 'warning');
    return;
  }

  const headers = [
    'Site',
    'ID Core',
    'Receipt Date',
    'Unit ID',
    'Part Number',
    'Part Description',
    'Origin SKHQ SPB',
    'Quantity',
    'Pallet / Bin Loc',
    'Condition / Remarks',
    'Status',
    'Site SPB Number',
    'Dispatch Date'
  ];

  const delimiter = ';';
  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
    return `"${s}"`;
  };

  const csvRows = [];
  csvRows.push('sep=;');
  csvRows.push(headers.map(h => escapeCsv(h)).join(delimiter));

  filtered.forEach(item => {
    const row = [
      currentSite,
      item.id || '',
      item.date || '',
      item.unitId || '',
      item.cleanPn || item.partNumber || '',
      item.partDescription || item.desc || '',
      item.sjSkhq || '',
      item.qty || 1,
      item.binLoc || '',
      item.condition || '',
      item.status || '',
      item.sjSiteNumber || '',
      item.dateSent || ''
    ];
    csvRows.push(row.map(cell => escapeCsv(cell)).join(delimiter));
  });

  const csvContent = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const periodTag = isAllPeriod ? 'ALL' : selectedPeriod;
  const filename = `OldCore_Report_${currentSite}_${periodTag}_${selectedStatus}.csv`;

  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.setAttribute('download', filename);
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(url);

  closeExportOldCoreModal();
  showToast(`CSV file "${filename}" (${filtered.length} rows) downloaded successfully!`, 'success');
}

/**
 * ============================================================================
 * 6. ORIGIN SKHQ SPB COMBOBOX & AUTO-NAVIGATION
 * ============================================================================
 */
function initSkhqCombobox() {
  filterSkhqCombobox('');
}

function clearSkhqComboboxInput() {
  const inp = document.getElementById('skhqComboboxInput');
  if (inp) {
    inp.value = '';
    inp.focus();
  }
  const btn = document.getElementById('clearSkhqComboboxBtn');
  if (btn) btn.classList.add('hidden');
  selectedSkhqValue = '';
  currentMaxCoreQuota = null;

  const pInp = document.getElementById('inputCorePart');
  const dInp = document.getElementById('inputCoreDesc');
  const uInp = document.getElementById('inputCoreUnit');
  const qInp = document.getElementById('inputCoreQty');
  const qHint = document.getElementById('coreQtyMaxHint');

  if (pInp) pInp.value = '';
  if (dInp) dInp.value = '';
  if (uInp) {
    uInp.value = '';
    updateClearUnitButtonVisibility();
  }
  if (qInp) {
    qInp.value = 1;
    qInp.removeAttribute('max');
  }
  if (qHint) qHint.textContent = '';

  filterSkhqCombobox('');
  openSkhqComboboxDropdown();
}

function updateClearSkhqButtonVisibility() {
  const inp = document.getElementById('skhqComboboxInput');
  const btn = document.getElementById('clearSkhqComboboxBtn');
  if (!inp || !btn) return;
  if (inp.value && inp.value.trim().length > 0) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

function toggleSkhqComboboxDropdown() {
  const drop = document.getElementById('skhqComboboxDropdown');
  if (!drop) return;
  if (drop.classList.contains('hidden')) openSkhqComboboxDropdown();
  else closeSkhqComboboxDropdown();
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
  if (arrow) arrow.style.transform = 'rotate(0deg)';
}

function handleSkhqComboboxInput(val) {
  updateClearSkhqButtonVisibility();
  openSkhqComboboxDropdown();
  filterSkhqCombobox(val);
  selectedSkhqValue = val;
}

function filterSkhqCombobox(query) {
  const q = (query || '').toLowerCase().trim();
  const drop = document.getElementById('skhqComboboxDropdown');
  if (!drop) return;

  filteredSkhqList = skhqPendingList.filter(item => {
    if (!q) return true;
    return item.sjSkhq.toLowerCase().includes(q) ||
           item.partDescription.toLowerCase().includes(q) ||
           item.partNumber.toLowerCase().includes(q);
  });

  drop.innerHTML = '';
  skhqComboboxIndex = -1;

  if (filteredSkhqList.length > 0) {
    filteredSkhqList.forEach((item, idx) => {
      const div = document.createElement('div');
      div.id = `skhq-combo-opt-${idx}`;
      div.className = "px-4 py-3 hover:bg-orange-100 cursor-pointer flex items-center justify-between text-left border-b border-orange-100 last:border-none";
      div.onclick = () => selectSkhqFromCombobox(item);
      div.innerHTML = `
        <div>
          <div class="flex items-center gap-2">
            <span class="font-mono font-black text-xs sm:text-sm text-orange-950 bg-orange-200 px-2 py-0.5 rounded">${item.sjSkhq}</span>
            <span class="text-xs font-bold text-slate-700">Unit: ${item.unitAssigned || '-'}</span>
          </div>
          <div class="text-xs sm:text-sm font-bold text-slate-900 mt-1">${item.partDescription}</div>
          <div class="text-xs font-mono text-slate-600">${item.partNumber}</div>
        </div>
        <span class="text-xs font-bold text-orange-700 bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-200">SELECT</span>
      `;
      drop.appendChild(div);
    });
  }

  const man = document.createElement('div');
  man.className = "px-4 py-2.5 bg-orange-50 hover:bg-orange-100 cursor-pointer text-xs sm:text-sm font-bold text-orange-900 border-t border-orange-200 flex items-center justify-between";
  man.onclick = () => selectManualSkhqEntry(q || 'SPB-MANUAL');
  man.innerHTML = `<span>Use Custom Input: <strong>"${(q || 'SPB-MANUAL').toUpperCase()}"</strong></span>`;
  drop.appendChild(man);
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
      selectManualSkhqEntry(val || 'SPB-MANUAL');
    }
  } else if (e.key === 'Escape') {
    closeSkhqComboboxDropdown();
  }
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

function selectSkhqFromCombobox(item) {
  selectedSkhqValue = item.sjSkhq;
  const inp = document.getElementById('skhqComboboxInput');
  if (inp) inp.value = `${item.sjSkhq} - ${item.partDescription}`;

  const pInp = document.getElementById('inputCorePart');
  const dInp = document.getElementById('inputCoreDesc');
  const uInp = document.getElementById('inputCoreUnit');
  const dtInp = document.getElementById('inputCoreDate');
  const qInp = document.getElementById('inputCoreQty');
  const qHint = document.getElementById('coreQtyMaxHint');

  if (pInp) pInp.value = item.partNumber;
  if (dInp) dInp.value = item.partDescription;
  if (uInp) {
    if (item.unitAssigned && !item.unitAssigned.toUpperCase().startsWith('WAREHOUSE')) {
      uInp.value = item.unitAssigned;
    } else {
      uInp.value = '';
    }
    updateClearUnitButtonVisibility();
  }

  currentMaxCoreQuota = item.remainingQuota !== undefined ? item.remainingQuota : (item.qtyIncoming || 1);

  if (qInp) {
    qInp.max = currentMaxCoreQuota;
    if (parseInt(qInp.value) > currentMaxCoreQuota || parseInt(qInp.value) < 1) {
      qInp.value = 1;
    }
  }

  if (qHint) {
    qHint.textContent = `(Max Allowed: ${currentMaxCoreQuota} PC from SPB)`;
    qHint.className = "text-[11px] font-bold text-emerald-600";
  }

  updateClearSkhqButtonVisibility();
  closeSkhqComboboxDropdown();

  if (dtInp) setTimeout(() => dtInp.focus(), 60);
}

function selectManualSkhqEntry(val) {
  selectedSkhqValue = (val || 'SPB-MANUAL').toUpperCase();
  currentMaxCoreQuota = null;

  const inp = document.getElementById('skhqComboboxInput');
  if (inp) inp.value = `[MANUAL] ${selectedSkhqValue}`;

  const qInp = document.getElementById('inputCoreQty');
  const qHint = document.getElementById('coreQtyMaxHint');
  if (qInp) qInp.removeAttribute('max');
  if (qHint) {
    qHint.textContent = '(Custom / Manual Mode)';
    qHint.className = "text-[11px] font-bold text-slate-500";
  }

  updateClearSkhqButtonVisibility();
  closeSkhqComboboxDropdown();

  const dtInp = document.getElementById('inputCoreDate');
  if (dtInp) setTimeout(() => dtInp.focus(), 60);
}

function setupEnterToNextFieldNavigation() {
  const dtInp = document.getElementById('inputCoreDate');
  const uInp = document.getElementById('inputCoreUnit');
  const qInp = document.getElementById('inputCoreQty');

  if (dtInp) {
    dtInp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (uInp) {
          uInp.focus();
          openUnitComboboxDropdown();
        }
      }
    });
  }

  if (qInp) {
    qInp.addEventListener('input', () => {
      const val = parseInt(qInp.value);
      if (currentMaxCoreQuota !== null && val > currentMaxCoreQuota) {
        qInp.value = currentMaxCoreQuota;
        showToast(`Quantity cannot exceed SKHQ supply limit (Max: ${currentMaxCoreQuota} PC)!`, 'warning');
      }
    });
  }
}

/**
 * ============================================================================
 * 6.1 REMOVED FROM UNIT ID COMBOBOX (MASTER EQUIPMENT & CUSTOM FALLBACK)
 * ============================================================================
 */
function initUnitCombobox() {
  const inp = document.getElementById('inputCoreUnit');
  if (inp) inp.value = '';
  updateClearUnitButtonVisibility();
  filterUnitCombobox('');
}

function clearUnitComboboxInput() {
  const inp = document.getElementById('inputCoreUnit');
  if (inp) {
    inp.value = '';
    inp.focus();
  }
  updateClearUnitButtonVisibility();
  filterUnitCombobox('');
  openUnitComboboxDropdown();
}

function updateClearUnitButtonVisibility() {
  const inp = document.getElementById('inputCoreUnit');
  const btn = document.getElementById('clearUnitComboboxBtn');
  if (!inp || !btn) return;
  if (inp.value && inp.value.trim().length > 0) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

function toggleUnitComboboxDropdown() {
  const drop = document.getElementById('unitComboboxDropdown');
  if (!drop) return;
  if (drop.classList.contains('hidden')) openUnitComboboxDropdown();
  else closeUnitComboboxDropdown();
}

function openUnitComboboxDropdown() {
  const drop = document.getElementById('unitComboboxDropdown');
  const arrow = document.getElementById('unitComboboxArrow');
  if (!drop) return;
  filterUnitCombobox(document.getElementById('inputCoreUnit').value);
  drop.classList.remove('hidden');
  if (arrow) arrow.style.transform = 'rotate(180deg)';
}

function closeUnitComboboxDropdown() {
  const drop = document.getElementById('unitComboboxDropdown');
  const arrow = document.getElementById('unitComboboxArrow');
  if (!drop) return;
  drop.classList.add('hidden');
  if (arrow) arrow.style.transform = 'rotate(0deg)';
}

function handleUnitComboboxInput(val) {
  updateClearUnitButtonVisibility();
  openUnitComboboxDropdown();
  filterUnitCombobox(val);
}

function filterUnitCombobox(query) {
  const q = (query || '').toLowerCase().trim();
  const drop = document.getElementById('unitComboboxDropdown');
  if (!drop) return;

  drop.innerHTML = '';
  unitComboboxIndex = -1;

  filteredUnitList = masterEquipmentList.filter(eq => {
    if (!q) return true;
    return eq.unitId.toLowerCase().includes(q) ||
           (eq.model || '').toLowerCase().includes(q) ||
           (eq.jenis || '').toLowerCase().includes(q);
  });

  // JIKA STOREMAN MENGETIK TEKS TERTENTU, TAMPILKAN OPSI CUSTOM DI PALING ATAS
  if (q.length > 0) {
    const customRow = document.createElement('div');
    customRow.id = `unit-combo-opt-custom`;
    customRow.className = "px-3.5 py-2.5 bg-orange-50 hover:bg-orange-100 cursor-pointer flex items-center justify-between border-b-2 border-orange-200 transition-colors";
    customRow.onclick = () => selectUnitFromCombobox(q.toUpperCase());
    customRow.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-6 h-6 rounded-lg bg-orange-600 text-white flex items-center justify-center text-xs font-black shadow-sm">+</span>
        <div>
          <span class="text-xs text-orange-950 font-bold block leading-tight">Use Custom / New Unit:</span>
          <span class="font-mono font-black text-sm text-orange-700">"${q.toUpperCase()}"</span>
        </div>
      </div>
      <span class="text-[10px] uppercase font-bold text-orange-800 bg-orange-200/80 px-2 py-0.5 rounded">CUSTOM</span>
    `;
    drop.appendChild(customRow);
  }

  if (filteredUnitList.length === 0 && q.length === 0) {
    drop.innerHTML = `<div class="p-4 text-xs text-slate-500 italic text-center">No units in master database</div>`;
    return;
  }

  filteredUnitList.forEach((eq, idx) => {
    const div = document.createElement('div');
    div.id = `unit-combo-opt-${idx}`;
    div.className = "px-3.5 py-2.5 hover:bg-orange-100 cursor-pointer flex items-center justify-between text-left transition-colors border-b border-orange-100 last:border-none";
    div.onclick = () => selectUnitFromCombobox(eq.unitId);
    div.innerHTML = `
      <div>
        <div class="font-mono font-black text-slate-900 text-sm sm:text-base">${eq.unitId}</div>
        <div class="text-xs text-slate-600 font-semibold leading-snug">${eq.model || '-'}</div>
      </div>
      <div class="text-right pl-2 shrink-0">
        <span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 uppercase">${eq.jenis || 'UNIT'}</span>
      </div>
    `;
    drop.appendChild(div);
  });
}

function handleUnitComboboxKeydown(e) {
  const drop = document.getElementById('unitComboboxDropdown');
  const isVisible = drop && !drop.classList.contains('hidden');
  const q = (document.getElementById('inputCoreUnit').value || '').trim();
  const hasCustom = q.length > 0;
  const totalOptions = filteredUnitList.length + (hasCustom ? 1 : 0);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!isVisible) {
      openUnitComboboxDropdown();
      return;
    }
    if (totalOptions > 0) {
      unitComboboxIndex = (unitComboboxIndex + 1) % totalOptions;
      highlightUnitComboboxOption(unitComboboxIndex, hasCustom);
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!isVisible) return;
    if (totalOptions > 0) {
      unitComboboxIndex = (unitComboboxIndex - 1 + totalOptions) % totalOptions;
      highlightUnitComboboxOption(unitComboboxIndex, hasCustom);
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (isVisible && unitComboboxIndex >= 0) {
      if (hasCustom && unitComboboxIndex === 0) {
        selectUnitFromCombobox(q.toUpperCase());
      } else {
        const itemIdx = hasCustom ? unitComboboxIndex - 1 : unitComboboxIndex;
        if (itemIdx >= 0 && itemIdx < filteredUnitList.length) {
          selectUnitFromCombobox(filteredUnitList[itemIdx].unitId);
        }
      }
    } else if (isVisible && totalOptions > 0) {
      if (hasCustom && filteredUnitList.length === 0) {
        selectUnitFromCombobox(q.toUpperCase());
      } else if (filteredUnitList.length > 0) {
        selectUnitFromCombobox(filteredUnitList[0].unitId);
      } else {
        selectUnitFromCombobox(q.toUpperCase());
      }
    } else {
      selectUnitFromCombobox(q.toUpperCase() || '-');
    }
  } else if (e.key === 'Escape') {
    closeUnitComboboxDropdown();
  }
}

function highlightUnitComboboxOption(activeIdx, hasCustom) {
  const customEl = document.getElementById('unit-combo-opt-custom');
  if (customEl) {
    if (activeIdx === 0) {
      customEl.classList.add('combobox-item-active-orange');
      customEl.scrollIntoView({ block: 'nearest' });
    } else {
      customEl.classList.remove('combobox-item-active-orange');
    }
  }

  filteredUnitList.forEach((_, idx) => {
    const el = document.getElementById(`unit-combo-opt-${idx}`);
    if (!el) return;
    const effectiveIdx = hasCustom ? idx + 1 : idx;
    if (effectiveIdx === activeIdx) {
      el.classList.add('combobox-item-active-orange');
      el.scrollIntoView({ block: 'nearest' });
    } else {
      el.classList.remove('combobox-item-active-orange');
    }
  });
}

function selectUnitFromCombobox(unitIdVal) {
  const inp = document.getElementById('inputCoreUnit');
  if (inp) inp.value = unitIdVal;

  updateClearUnitButtonVisibility();
  closeUnitComboboxDropdown();

  // Enter-to-Next: Kursor otomatis melompat ke Qty atau Storage Bin
  const qInp = document.getElementById('inputCoreQty');
  if (qInp) {
    setTimeout(() => {
      qInp.focus();
      qInp.select();
    }, 60);
  }
}

async function saveNewOldCore(e) {
  e.preventDefault();
  const sj = selectedSkhqValue || document.getElementById('skhqComboboxInput').value.trim() || 'SPB-MANUAL';
  const dt = document.getElementById('inputCoreDate').value;
  const unit = document.getElementById('inputCoreUnit').value.trim().toUpperCase();
  const pn = document.getElementById('inputCorePart').value.trim();
  const desc = document.getElementById('inputCoreDesc').value.trim();
  const qty = parseInt(document.getElementById('inputCoreQty').value) || 1;
  const bin = document.getElementById('inputCoreBin').value.trim() || 'PALET-CORE-01';
  const remark = document.getElementById('inputCoreRemark').value.trim() || 'Physical core received from mechanic';

  if (currentMaxCoreQuota !== null && qty > currentMaxCoreQuota) {
    showToast(`Rejected: Quantity (${qty} PC) exceeds SKHQ supply limit (Max: ${currentMaxCoreQuota} PC)!`, 'warning');
    const qInp = document.getElementById('inputCoreQty');
    if (qInp) {
      qInp.value = currentMaxCoreQuota;
      qInp.focus();
    }
    return;
  }

  const coreId = `${currentSite}-CORE-` + Date.now().toString().slice(-4);
  const cleanSj = sj.startsWith('[MANUAL]') ? sj.replace('[MANUAL] ', '') : sj;

  const record = {
    id: coreId,
    date: dt,
    partNumber: pn,
    cleanPn: pn,
    partDescription: desc,
    desc: desc,
    unitId: unit,
    sjSkhq: cleanSj,
    qty: qty,
    binLoc: bin,
    condition: remark,
    hasPhoto: !!currentPhotoBase64,
    photoBase64: currentPhotoBase64,
    status: 'PENDING',
    sjSiteNumber: '',
    dateSent: ''
  };

  showToast('Saving Old Core to Central Database...', 'info');

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'SAVE_OLD_CORE',
        site: currentSite,
        record: record
      })
    });
    const resJson = await res.json();
    if (resJson.status === 'SUCCESS' && resJson.data && resJson.data.photoUrl) {
      record.photoUrl = resJson.data.photoUrl;
    }
  } catch (err) {
    console.warn('Backend sync warning:', err);
  }

  oldCoreRegisterData.unshift(record);
  calculateSkhqPendingList();
  closeInputOldCoreModal();
  document.getElementById('formOldCore').reset();
  removeCapturedPhoto();
  document.getElementById('inputCoreDate').value = new Date().toISOString().split('T')[0];

  currentMaxCoreQuota = null;
  const qHint = document.getElementById('coreQtyMaxHint');
  if (qHint) qHint.textContent = '';

  renderOldCoreTable();
  showToast(`Old Core ${pn} successfully registered at Site ${currentSite}!`, 'success');
}

/**
 * ============================================================================
 * 7. DISPATCH OLD CORE TO SKHQ & PRINT SPB
 * ============================================================================
 */
function openSendToSkhqModal(targetCoreId = null) {
  const pendingItems = oldCoreRegisterData.filter(x => String(x.status || 'PENDING').trim().toUpperCase() === 'PENDING');
  if (pendingItems.length === 0) {
    showToast('No pending old cores ready for dispatch!', 'warning');
    return;
  }

  selectedDispatchCoreIds.clear();

  if (targetCoreId) {
    const targetItem = oldCoreRegisterData.find(x => x.id === targetCoreId);
    if (targetItem) {
      selectedDispatchCoreIds.add(targetItem.id);
    } else {
      selectedDispatchCoreIds.add(targetCoreId);
    }
  } else {
    pendingItems.forEach(item => selectedDispatchCoreIds.add(item.id));
  }

  renderDispatchItemsList(pendingItems);

  const sjInp = document.getElementById('inputSiteSjNumber');
  if (sjInp) sjInp.value = `SPB-${currentSite}-01`;

  const dtInp = document.getElementById('inputSkhqDate');
  if (dtInp) dtInp.value = new Date().toISOString().split('T')[0];

  const modal = document.getElementById('sendToSkhqModal');
  if (modal) {
    modal.classList.remove('hidden');
    setTimeout(() => {
      if (sjInp) sjInp.focus();
    }, 120);
  }
}

function renderDispatchItemsList(pendingItems) {
  const cont = document.getElementById('dispatchItemsSelectionList');
  const badge = document.getElementById('dispatchSelectedCountBadge');
  const chkAll = document.getElementById('selectAllDispatchCheckbox');

  if (!cont) return;
  cont.innerHTML = '';

  if (chkAll) chkAll.checked = selectedDispatchCoreIds.size === pendingItems.length && pendingItems.length > 0;
  if (badge) badge.textContent = `${selectedDispatchCoreIds.size} of ${pendingItems.length} Selected`;

  pendingItems.forEach(item => {
    const isChecked = selectedDispatchCoreIds.has(item.id);
    const div = document.createElement('label');
    div.className = `p-3 rounded-2xl border-2 flex items-center justify-between gap-3 cursor-pointer transition-all ${
      isChecked ? 'bg-white border-blue-400 shadow-sm' : 'bg-slate-100 border-slate-200 opacity-60'
    }`;
    div.innerHTML = `
      <div class="flex items-center gap-3">
        <input type="checkbox" value="${item.id}" ${isChecked ? 'checked' : ''} onchange="toggleDispatchItem('${item.id}', this.checked)" class="w-5 h-5 text-blue-600 rounded">
        <div>
          <div class="font-bold text-xs sm:text-sm text-slate-900">${item.partDescription} (Unit ${item.unitId})</div>
          <div class="text-[11px] font-mono text-slate-500">${item.cleanPn || item.partNumber} • Ex ${item.sjSkhq}</div>
        </div>
      </div>
      <span class="text-xs sm:text-sm font-mono font-black text-blue-900">${item.qty} PC</span>
    `;
    cont.appendChild(div);
  });
}

function toggleDispatchItem(id, isChecked) {
  if (isChecked) selectedDispatchCoreIds.add(id);
  else selectedDispatchCoreIds.delete(id);
  renderDispatchItemsList(oldCoreRegisterData.filter(x => x.status === 'PENDING'));
}

function toggleSelectAllDispatch(isChecked) {
  const pendingItems = oldCoreRegisterData.filter(x => x.status === 'PENDING');
  if (isChecked) pendingItems.forEach(i => selectedDispatchCoreIds.add(i.id));
  else selectedDispatchCoreIds.clear();
  renderDispatchItemsList(pendingItems);
}

function closeSendToSkhqModal() {
  const modal = document.getElementById('sendToSkhqModal');
  if (modal) modal.classList.add('hidden');
}

async function confirmDispatchToSkhq() {
  const sjNumber = document.getElementById('inputSiteSjNumber').value.trim().toUpperCase();
  const sendDate = document.getElementById('inputSkhqDate').value || new Date().toISOString().split('T')[0];

  if (!sjNumber) {
    showToast('Site SPB Document Number is required!', 'warning');
    return;
  }
  if (selectedDispatchCoreIds.size === 0) {
    showToast('Select at least 1 item to dispatch!', 'warning');
    return;
  }

  const ids = Array.from(selectedDispatchCoreIds);

  try {
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'DISPATCH_OLD_CORE',
        site: currentSite,
        coreIds: ids,
        sjSiteNumber: sjNumber,
        dateSent: sendDate
      })
    });
  } catch (e) {}

  oldCoreRegisterData.forEach(item => {
    if (selectedDispatchCoreIds.has(item.id)) {
      item.status = 'SENT';
      item.sjSiteNumber = sjNumber;
      item.dateSent = sendDate;
    }
  });

  selectedDispatchCoreIds.clear();
  closeSendToSkhqModal();
  renderOldCoreTable();
  showToast(`Site SPB ${sjNumber} issued successfully!`, 'success');

  setTimeout(() => {
    openPrintManifestModalForSj(sjNumber);
  }, 300);
}

function openPrintManifestModalForSj(sjNumber) {
  currentViewingManifestSj = sjNumber;
  const items = oldCoreRegisterData.filter(x => x.sjSiteNumber === sjNumber);
  if (items.length === 0) return;

  const docNo = document.getElementById('manifestDocNumber');
  const docDate = document.getElementById('manifestDocDate');
  const tbody = document.getElementById('manifestTableBody');

  if (docNo) docNo.textContent = sjNumber;
  if (docDate) docDate.textContent = `Date: ${formatDateIndo(items[0].dateSent || new Date().toISOString().split('T')[0])}`;

  if (tbody) {
    tbody.innerHTML = '';
    items.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-300 text-slate-900';
      tr.innerHTML = `
        <td class="py-2.5 px-2 border border-slate-300 text-center font-bold">${idx + 1}</td>
        <td class="py-2.5 px-2 border border-slate-300 text-center">
          ${item.photoUrl ? `<img src="${item.photoUrl}" class="w-16 h-14 object-cover rounded mx-auto border border-slate-300 print-core-photo">` : `<span class="text-[10px] text-slate-400 font-bold">[📷 No Photo]</span>`}
        </td>
        <td class="py-2.5 px-3 border border-slate-300">
          <div class="font-mono font-bold text-slate-950">${item.cleanPn || item.partNumber}</div>
          <div class="font-semibold text-slate-700">${item.partDescription}</div>
          <div class="text-[10px] text-slate-500 font-mono">ID Tag: ${item.id}</div>
        </td>
        <td class="py-2.5 px-2 border border-slate-300 text-center font-mono font-black">${item.unitId}</td>
        <td class="py-2.5 px-2 border border-slate-300 text-center font-mono font-bold text-orange-950 bg-orange-50/50">${item.sjSkhq}</td>
        <td class="py-2.5 px-2 border border-slate-300 text-center font-bold">${item.qty}</td>
        <td class="py-2.5 px-3 border border-slate-300 text-slate-600">${item.condition}</td>
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
  const element = document.getElementById('printableManifestDocument');
  if (!element) return;
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SPB Pengembalian Old Core</title>
      <script src="https://cdn.tailwindcss.com"><\/script>
      <style>@page { size: portrait; margin: 10mm; }</style>
    </head>
    <body class="p-6 bg-white text-slate-900">
      ${element.innerHTML}
      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); window.close(); }, 350);
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

async function downloadManifestPdf() {
  const element = document.getElementById('printableManifestDocument');
  if (!element) return;
  const sjName = currentViewingManifestSj || 'SPB-OLDCORE';
  showToast('Generating PDF file...', 'info');

  const imgElements = element.querySelectorAll('.print-core-photo');
  for (let i = 0; i < imgElements.length; i++) {
    const img = imgElements[i];
    if (img && img.src && !img.src.startsWith('data:image')) {
      const match = img.src.match(/id=([-\w]+)/) || img.src.match(/[-\w]{25,}/);
      if (match) {
        const fileId = match[1] || match[0];
        try {
          const res = await fetch(`${API_URL}?action=GET_IMAGE_BASE64&fileId=${fileId}`);
          const resJson = await res.json();
          if (resJson.status === 'SUCCESS' && resJson.dataUri) {
            img.src = resJson.dataUri;
          }
        } catch (err) {}
      }
    }
  }

  const opt = {
    margin: [6, 6, 6, 6],
    filename: `SPB_${sjName}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, allowTaint: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  if (window.html2pdf) {
    window.html2pdf().set(opt).from(element).save().then(() => {
      showToast(`PDF Document ${sjName} downloaded!`, 'success');
    }).catch(() => {
      printManifestDocument();
    });
  } else {
    printManifestDocument();
  }
}

/**
 * ============================================================================
 * 8. WEBRTC LIVE CAMERA & TAP-TO-ZOOM PREVIEW
 * ============================================================================
 */
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
      applyCapturedPhoto(e.target.result, file.name);
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
      throw new Error('WebRTC not supported');
    }
    stopCameraStream();
    cameraMediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: currentCameraFacingMode }, width: { ideal: 1280 } },
      audio: false
    });
    video.srcObject = cameraMediaStream;
    await video.play();
  } catch (e) {
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
    cameraMediaStream.getTracks().forEach(t => t.stop());
    cameraMediaStream = null;
  }
  const video = document.getElementById('cameraVideo');
  if (video) video.srcObject = null;
}

function toggleCameraFacing() {
  currentCameraFacingMode = currentCameraFacingMode === 'environment' ? 'user' : 'environment';
  openLiveCameraModal();
}

function captureLiveSnapshot() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  if (!video || !canvas) return;

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

  applyCapturedPhoto(dataUrl, 'Camera Snapshot');
  closeLiveCameraModal();
  showToast('Photo captured successfully!', 'success');
}

function applyCapturedPhoto(base64, metaText) {
  currentPhotoBase64 = base64;
  const emp = document.getElementById('photoEmptyState');
  const cap = document.getElementById('photoCapturedState');
  const img = document.getElementById('photoThumbImg');
  const meta = document.getElementById('photoMetaText');

  if (emp) emp.classList.add('hidden');
  if (cap) cap.classList.remove('hidden');
  if (img) img.src = base64;
  if (meta) meta.innerHTML = `Ready • <span class="text-emerald-700 font-bold underline">Tap to Zoom</span>`;
}

function removeCapturedPhoto() {
  currentPhotoBase64 = null;
  const emp = document.getElementById('photoEmptyState');
  const cap = document.getElementById('photoCapturedState');
  const img = document.getElementById('photoThumbImg');

  if (emp) emp.classList.remove('hidden');
  if (cap) cap.classList.add('hidden');
  if (img) img.src = '';
}

function previewCurrentCapturedPhoto() {
  if (!currentPhotoBase64) return;
  const unit = document.getElementById('inputCoreUnit').value.trim() || 'NEW';
  const pn = document.getElementById('inputCorePart').value.trim() || 'COMPONENT';
  const desc = document.getElementById('inputCoreDesc').value.trim() || 'Old Core Photo Verification';

  const previewWindow = window.open('', '_blank');
  if (previewWindow) {
    previewWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head><title>Verify Photo - ${pn}</title><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin:0; background:#020617; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family:sans-serif; padding:16px; box-sizing:border-box;">
        <div style="background:#0f172a; padding:20px; border-radius:24px; border:3px solid #10b981; max-width:600px; width:100%; text-align:center; box-shadow:0 20px 40px rgba(0,0,0,0.5);">
          <div style="color:#10b981; font-weight:bold; font-size:13px; text-transform:uppercase; margin-bottom:12px; letter-spacing:1px;">
            ✓ Pre-Upload Quality Check
          </div>
          <img src="${currentPhotoBase64}" alt="${desc}" style="max-height:65vh; max-width:100%; object-fit:contain; border-radius:16px; border:1px solid #334155;">
          <div style="margin-top:16px; text-align:left;">
            <span style="background:#f97316; color:white; font-size:12px; font-weight:bold; padding:4px 10px; border-radius:6px;">UNIT: ${unit}</span>
            <span style="background:#334155; color:#f8fafc; font-size:12px; font-family:monospace; padding:4px 10px; border-radius:6px; margin-left:6px;">${pn}</span>
            <h3 style="color:#ffffff; margin:10px 0 4px 0; font-size:16px;">${desc}</h3>
            <p style="color:#94a3b8; margin:0; font-size:13px;">Pastikan nomor part dan kondisi fisik terlihat tajam sebelum disimpan.</p>
          </div>
        </div>
      </body>
      </html>
    `);
  }
}

function previewItemPhoto(coreId) {
  const item = oldCoreRegisterData.find(x => x.id === coreId);
  if (!item) return;

  const photo = item.photoUrl || item.photoBase64;
  if (photo) {
    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head><title>Component Photo - ${item.cleanPn || item.partNumber}</title><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0; background:#0f172a; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family:sans-serif; padding:16px; box-sizing:border-box;">
          <div style="background:#1e293b; padding:20px; border-radius:24px; border:3px solid #f97316; max-width:550px; width:100%; text-align:center;">
            <img src="${photo}" alt="${item.partDescription}" style="max-height:65vh; max-width:100%; object-fit:contain; border-radius:16px;">
            <div style="margin-top:16px; text-align:left;">
              <span style="background:#f97316; color:white; font-size:12px; font-weight:bold; padding:4px 10px; border-radius:6px;">UNIT: ${item.unitId}</span>
              <span style="background:#334155; color:#f8fafc; font-size:12px; font-family:monospace; padding:4px 10px; border-radius:6px; margin-left:6px;">${item.cleanPn || item.partNumber}</span>
              <h3 style="color:#ffffff; margin:10px 0 4px 0; font-size:18px;">${item.partDescription}</h3>
              <p style="color:#94a3b8; margin:0; font-size:14px;">Condition: ${item.condition}</p>
            </div>
          </div>
        </body>
        </html>
      `);
    }
  } else {
    showToast('No physical photo attached to this item.', 'warning');
  }
}

/**
 * ============================================================================
 * 9. ODOO EXCEL IMPORT ENGINE
 * ============================================================================
 */
let stagedUploadFile = null;
let stagedRawRows = null;

function openUploadModal() {
  // Pengaman: Cegah role VIEWER membuka modal import
  const roleUpper = String(currentUser?.role || '').toUpperCase().trim();
  const isViewer = roleUpper === 'VIEWER' || roleUpper.includes('VIEWER');
  if (isViewer) {
    showToast('Import action is restricted for Viewer role.', 'warning');
    return;
  }

  resetUploadStaging();
  const m = document.getElementById('uploadModal');
  if (m) m.classList.remove('hidden');
}

function closeUploadModal() {
  const m = document.getElementById('uploadModal');
  if (m) m.classList.add('hidden');
  resetUploadStaging();
}

function resetUploadStaging() {
  stagedUploadFile = null;
  stagedRawRows = null;
  const dropSec = document.getElementById('uploadDropSection');
  const stageSec = document.getElementById('uploadStagingSection');
  const loadSec = document.getElementById('uploadLoadingSection');
  const fileInp = document.getElementById('odooFileInput');

  if (dropSec) dropSec.classList.remove('hidden');
  if (stageSec) stageSec.classList.add('hidden');
  if (loadSec) loadSec.classList.add('hidden');
  if (fileInp) fileInp.value = '';
}

function handleDragOver(e) { e.preventDefault(); }
function handleDragLeave(e) { e.preventDefault(); }
function handleDrop(e) {
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files[0]) stageSelectedFile(e.dataTransfer.files[0]);
}
function handleFileSelect(e) {
  if (e.target.files && e.target.files[0]) stageSelectedFile(e.target.files[0]);
}

function stageSelectedFile(file) {
  stagedUploadFile = file;
  showToast(`Reading "${file.name}"...`, 'info');

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (!rawRows || rawRows.length < 2) {
        showToast('File contains no valid data rows.', 'warning');
        resetUploadStaging();
        return;
      }

      stagedRawRows = rawRows;
      const fnUpper = file.name.toUpperCase();
      const isIncoming = fnUpper.includes('IN') || fnUpper.includes('MOVE') || fnUpper.includes('SPB');
      const typeSelect = document.getElementById('stagingTypeSelect');
      if (typeSelect) typeSelect.value = isIncoming ? 'IMPORT_ODOO_IN' : 'IMPORT_ODOO_OUT';

      const fName = document.getElementById('stagingFileName');
      const fSize = document.getElementById('stagingFileSize');
      const rCount = document.getElementById('stagingRowCount');
      const sBadge = document.getElementById('stagingSiteBadge');

      if (fName) fName.textContent = file.name;
      if (fSize) fSize.textContent = (file.size / 1024).toFixed(1) + ' KB';
      if (rCount) rCount.textContent = `${rawRows.length - 1} Data Rows`;
      if (sBadge) sBadge.textContent = `Site ${currentSite}`;

      const dropSec = document.getElementById('uploadDropSection');
      const stageSec = document.getElementById('uploadStagingSection');
      if (dropSec) dropSec.classList.add('hidden');
      if (stageSec) stageSec.classList.remove('hidden');

    } catch (err) {
      showToast('Failed to read Excel file: ' + err.message, 'warning');
      resetUploadStaging();
    }
  };
  reader.readAsArrayBuffer(file);
}

async function executeOdooUpload() {
  if (!stagedRawRows || stagedRawRows.length < 2) return;

  const stageSec = document.getElementById('uploadStagingSection');
  const loadSec = document.getElementById('uploadLoadingSection');
  const typeSelect = document.getElementById('stagingTypeSelect');
  const actionType = typeSelect ? typeSelect.value : 'IMPORT_ODOO_IN';

  if (stageSec) stageSec.classList.add('hidden');
  if (loadSec) loadSec.classList.remove('hidden');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: actionType, site: currentSite, data: stagedRawRows })
    });
    const resJson = await response.json();

    if (resJson.status === 'SUCCESS') {
      closeUploadModal();
      showToast(resJson.message || 'Odoo data synchronized successfully!', 'success');
      fetchSiteData(currentSite, true);
    } else {
      throw new Error(resJson.message || 'Failed to process data.');
    }
  } catch (err) {
    if (stageSec) stageSec.classList.remove('hidden');
    if (loadSec) loadSec.classList.add('hidden');
    showToast('Upload error: ' + err.message, 'warning');
  }
}

/**
 * ============================================================================
 * 10. MODALS & GLOBAL KEYBOARD SHORTCUTS
 * ============================================================================
 */
function toggleSkhqOutstandingModal() {
  const m = document.getElementById('skhqOutstandingModal');
  if (!m) return;
  if (m.classList.contains('hidden')) {
    renderSkhqOutstandingList();
    m.classList.remove('hidden');
  } else {
    m.classList.add('hidden');
  }
}

function renderSkhqOutstandingList() {
  const cont = document.getElementById('skhqOutstandingListContainer');
  if (!cont) return;
  cont.innerHTML = '';

  if (skhqPendingList.length === 0) {
    cont.innerHTML = `<div class="p-6 text-center text-slate-500 font-bold text-xs sm:text-sm"><i class="fa-solid fa-circle-check text-emerald-500 text-4xl mb-2"></i><p>All SKHQ SPB receipts have matched physical cores!</p></div>`;
    return;
  }

  skhqPendingList.forEach(item => {
    const div = document.createElement('div');
    div.className = "p-3.5 bg-rose-50 border-2 border-rose-200 rounded-2xl flex items-center justify-between gap-3";
    div.innerHTML = `
      <div>
        <div class="flex items-center gap-2">
          <span class="font-mono font-black text-xs sm:text-sm text-rose-950 bg-rose-200 px-2 py-0.5 rounded">${item.sjSkhq}</span>
          <span class="text-xs text-rose-700 font-bold">${formatDateIndo(item.date)}</span>
        </div>
        <div class="font-bold text-slate-900 text-xs sm:text-sm mt-1">${item.partDescription}</div>
        <div class="text-xs text-slate-600 font-semibold mt-0.5">Part: <strong class="font-mono text-slate-900">${item.partNumber}</strong> • Unit: <strong>${item.unitAssigned || '-'}</strong> • Awaiting: <span class="font-bold text-rose-700">${item.qtyIncoming} PC</span></div>
      </div>
      <button onclick="quickReceiveSkhq('${item.sjSkhq}')" class="px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-black text-xs sm:text-sm rounded-xl shadow shrink-0">
        + Receive Core
      </button>
    `;
    cont.appendChild(div);
  });
}

function quickReceiveSkhq(sjNo) {
  toggleSkhqOutstandingModal();
  openInputOldCoreModal();
  const match = skhqPendingList.find(x => x.sjSkhq === sjNo);
  if (match) selectSkhqFromCombobox(match);
}

function openInputOldCoreModal() {
  const m = document.getElementById('inputOldCoreModal');
  if (m) m.classList.remove('hidden');
  initSkhqCombobox();
  initUnitCombobox();
}

function closeInputOldCoreModal() {
  const m = document.getElementById('inputOldCoreModal');
  if (m) m.classList.add('hidden');
  closeSkhqComboboxDropdown();
  closeUnitComboboxDropdown();
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
    return (item.cleanPn || item.partNumber).toLowerCase().includes(q) ||
           item.partDescription.toLowerCase().includes(q) ||
           (item.binLoc || '').toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400">
        <i class="fa-solid fa-circle-question text-3xl mb-2 text-slate-300"></i>
        <p class="font-bold text-sm">No matching items found</p>
      </div>
    `;
    return;
  }

  filtered.forEach(item => {
    const originalIndex = masterStockData.indexOf(item);
    const div = document.createElement('div');
    div.className = 'p-3 hover:bg-amber-50 cursor-pointer rounded-2xl flex items-center justify-between transition-colors border-b border-slate-100 last:border-none';
    div.onclick = () => {
      switchAppTab('new-part');
      selectPartFromCombobox(originalIndex);
      toggleQuickSearchModal();
    };
    div.innerHTML = `
      <div>
        <div class="font-mono font-bold text-slate-900 text-sm sm:text-base">${item.cleanPn || item.partNumber}</div>
        <div class="text-xs sm:text-sm font-semibold text-slate-700">${item.partDescription}</div>
        <div class="text-xs text-amber-800 font-bold mt-0.5">
          <i class="fa-solid fa-location-dot mr-1 text-amber-600"></i>Bin: ${item.binLoc}
        </div>
      </div>
      <div class="text-right">
        <span class="text-xs font-bold text-slate-400 block uppercase">SOH</span>
        <span class="font-mono text-base sm:text-lg font-black ${item.stockBalance > 0 ? 'text-emerald-700' : 'text-rose-600'}">
          ${item.stockBalance} ${item.uom}
        </span>
      </div>
    `;
    container.appendChild(div);
  });
}

function setupOutsideClickListeners() {
  document.addEventListener('click', (e) => {
    const pDrop = document.getElementById('partComboboxDropdown');
    const pInp = document.getElementById('partComboboxInput');
    if (pDrop && !pDrop.contains(e.target) && e.target !== pInp) closePartComboboxDropdown();

    const sDrop = document.getElementById('skhqComboboxDropdown');
    const sInp = document.getElementById('skhqComboboxInput');
    if (sDrop && !sDrop.contains(e.target) && e.target !== sInp) closeSkhqComboboxDropdown();

    const uDrop = document.getElementById('unitComboboxDropdown');
    const uInp = document.getElementById('inputCoreUnit');
    if (uDrop && !uDrop.contains(e.target) && e.target !== uInp) closeUnitComboboxDropdown();
  });
}

function initFormDates() {
  const today = new Date().toISOString().split('T')[0];
  const dt = document.getElementById('inputCoreDate');
  if (dt) dt.value = today;
  const sdt = document.getElementById('inputSkhqDate');
  if (sdt) sdt.value = today;
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
      const inp = document.getElementById('partComboboxInput');
      if (inp) {
        inp.focus();
        inp.select();
      }
    }
    if (e.key === 'Escape') {
      closeLiveCameraModal();
      closePartComboboxDropdown();
      closeSkhqComboboxDropdown();
      closeUploadModal();
      closeInputOldCoreModal();
      closeSendToSkhqModal();
      closePrintManifestModal();
      closeExportOldCoreModal();
      const outModal = document.getElementById('skhqOutstandingModal');
      if (outModal) outModal.classList.add('hidden');
      const sModal = document.getElementById('searchModal');
      if (sModal) sModal.classList.add('hidden');
    }
  });
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
