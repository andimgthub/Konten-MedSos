/*
 * app.js — Logika aplikasi Konten SosMed
 * versi: 1.0
 * Lisensi: MIT
 * Repositori: https://github.com/andimgthub/Konten-MedSos/
 */

(function () {
  'use strict';

  const state = {
    manifest: null,
    currentPeriodId: null,
    currentFileIndex: -1,
    view: 'landing',
    rawCache: new Map(),
    theme: 'light'
  };

  // ===== DOM refs =====
  const $ = (id) => document.getElementById(id);
  const periodSelect = $('period-select');
  const fileSelect = $('file-select');
  const fileWrap = $('file-select-wrap');
  const btnCopy = $('btn-copy');
  const btnShow = $('btn-show');
  const btnHome = $('btn-home');
  const btnBack = $('btn-back');
  const btnNext = $('btn-next');
  const btnCopyReader = $('btn-copy-reader');
  const themeLanding = $('theme-toggle-landing');
  const themeReader = $('theme-toggle-reader');
  const readerTitle = $('reader-title');
  const readerContent = $('reader-content');
  const toast = $('toast');

  // ===== Init =====
  async function init() {
    applyTheme(localStorage.getItem('theme') || 'light');
    bindEvents();
    try {
      state.manifest = await loadManifest();
      renderPeriodOptions();
    } catch (err) {
      console.error(err);
      showToast('Gagal memuat manifest', 'error');
    }
  }

  // ===== Manifest =====
  async function loadManifest() {
    const res = await fetch('web/manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Manifest tidak ditemukan');
    return res.json();
  }

  function renderPeriodOptions() {
    periodSelect.innerHTML = '<option value="">— Pilih periode —</option>';
    for (const p of state.manifest.periods) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      periodSelect.appendChild(opt);
    }
  }

  function renderFileOptions(periodId) {
    fileSelect.innerHTML = '<option value="">— Pilih file —</option>';
    const period = state.manifest.periods.find((p) => p.id === periodId);
    if (!period) {
      fileWrap.classList.remove('active');
      return;
    }
    for (const f of period.files) {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.title;
      fileSelect.appendChild(opt);
    }
    fileWrap.classList.add('active');
  }

  // ===== Events =====
  function bindEvents() {
    periodSelect.addEventListener('change', onPeriodChange);
    fileSelect.addEventListener('change', onFileChange);
    btnCopy.addEventListener('click', onCopy);
    btnShow.addEventListener('click', onShow);
    btnHome.addEventListener('click', goHome);
    btnBack.addEventListener('click', goBack);
    btnNext.addEventListener('click', goNext);
    btnCopyReader.addEventListener('click', onCopy);
    themeLanding.addEventListener('click', toggleTheme);
    themeReader.addEventListener('click', toggleTheme);
  }

  function onPeriodChange() {
    const periodId = periodSelect.value;
    state.currentPeriodId = periodId || null;
    state.currentFileIndex = -1;
    fileSelect.value = '';
    updateActionButtons();
    if (!periodId) {
      fileWrap.classList.remove('active');
      fileSelect.innerHTML = '<option value="">— Pilih file —</option>';
      return;
    }
    renderFileOptions(periodId);
  }

  function onFileChange() {
    const fileId = fileSelect.value;
    if (!fileId) {
      state.currentFileIndex = -1;
    } else {
      const period = getCurrentPeriod();
      state.currentFileIndex = period.files.findIndex((f) => f.id === fileId);
    }
    updateActionButtons();
  }

  function updateActionButtons() {
    const ready = !!periodSelect.value && !!fileSelect.value;
    btnCopy.disabled = !ready;
    btnShow.disabled = !ready;
  }

  // ===== Actions =====
  async function onCopy() {
    const file = getCurrentFile();
    if (!file) {
      showToast('Pilih file terlebih dahulu', 'info');
      return;
    }
    try {
      const raw = await fetchMarkdown(file.path);
      await copyToClipboard(raw);
      showToast('Isi file disalin ke clipboard', 'success');
    } catch (err) {
      console.error(err);
      showToast('Gagal menyalin file', 'error');
    }
  }

  function onShow() {
    const period = getCurrentPeriod();
    if (!period) return;
    if (state.currentFileIndex < 0) {
      showToast('Pilih file terlebih dahulu', 'info');
      return;
    }
    showReader(period.id, state.currentFileIndex);
  }

  async function showReader(periodId, index) {
    const period = state.manifest.periods.find((p) => p.id === periodId);
    if (!period) return;
    const file = period.files[index];
    if (!file) return;

    state.currentPeriodId = periodId;
    state.currentFileIndex = index;
    state.view = 'reader';
    document.body.classList.remove('view-landing');
    document.body.classList.add('view-reader');
    $('landing').hidden = true;
    $('reader').hidden = false;

    readerTitle.textContent = file.title;
    readerTitle.setAttribute('title', file.title);
    readerContent.innerHTML = '<p style="color:var(--text-muted)">Memuat…</p>';

    // restore dropdown selection
    periodSelect.value = periodId;
    fileSelect.value = file.id;

    updateNavButtons();
    window.scrollTo(0, 0);

    try {
      const raw = await fetchMarkdown(file.path);
      const html = renderMarkdown(raw);
      readerContent.innerHTML = html;
    } catch (err) {
      console.error(err);
      readerContent.innerHTML = '<p>Gagal memuat file.</p>';
      showToast('Gagal memuat file', 'error');
    }
  }

  function goHome() {
    state.view = 'landing';
    document.body.classList.remove('view-reader');
    document.body.classList.add('view-landing');
    $('reader').hidden = true;
    $('landing').hidden = false;
    window.scrollTo(0, 0);
  }

  function goBack() {
    if (state.currentFileIndex > 0) {
      showReader(state.currentPeriodId, state.currentFileIndex - 1);
    }
  }

  function goNext() {
    const period = getCurrentPeriod();
    if (!period) return;
    if (state.currentFileIndex < period.files.length - 1) {
      showReader(state.currentPeriodId, state.currentFileIndex + 1);
    }
  }

  function updateNavButtons() {
    const period = getCurrentPeriod();
    if (!period) return;
    btnBack.disabled = state.currentFileIndex <= 0;
    btnNext.disabled = state.currentFileIndex >= period.files.length - 1;
  }

  // ===== Markdown =====
  async function fetchMarkdown(path) {
    if (state.rawCache.has(path)) return state.rawCache.get(path);
    const res = await fetch(encodeURI(path));
    if (!res.ok) throw new Error('Gagal fetch ' + path);
    const text = await res.text();
    state.rawCache.set(path, text);
    return text;
  }

  function renderMarkdown(raw) {
    const html = window.marked.parse(raw, { gfm: true, breaks: false });
    return window.DOMPurify.sanitize(html);
  }

  // ===== Clipboard =====
  async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  // ===== Theme =====
  function applyTheme(theme) {
    state.theme = theme;
    document.body.classList.toggle('dark', theme === 'dark');
    const icon = theme === 'dark' ? '☀️' : '🌙';
    themeLanding.textContent = icon;
    themeReader.textContent = icon;
    localStorage.setItem('theme', theme);
  }

  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  // ===== Toast =====
  let toastTimer = null;
  function showToast(msg, type = 'info') {
    toast.textContent = msg;
    toast.className = 'show ' + type;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.className = type;
      toast.hidden = true;
    }, 2000);
  }

  // ===== Helpers =====
  function getCurrentPeriod() {
    if (!state.manifest) return null;
    return state.manifest.periods.find((p) => p.id === state.currentPeriodId) || null;
  }

  function getCurrentFile() {
    const period = getCurrentPeriod();
    if (!period || state.currentFileIndex < 0) return null;
    return period.files[state.currentFileIndex] || null;
  }

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', init);
})();