'use strict';

const app = document.querySelector('#app');
const dateFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDateFormat = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' });
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let editions = [];
let edition = null;
let slides = [];
let current = 0;
let wheelLastAt = 0;
let gesture = null;
let termAnchor = null;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const dateObject = value => new Date(value + 'T12:00:00');
const longDate = value => dateFormat.format(dateObject(value));
const shortDate = value => shortDateFormat.format(dateObject(value)).toUpperCase().replace('.', '');
const pad = n => String(n).padStart(2, '0');

function buildSlides(selectedEdition) {
  const result = [];
  for (const section of selectedEdition.sections || []) {
    result.push({ kind: 'category', section });
    for (const story of section.stories || []) result.push({ kind: 'story', section, story });
  }
  result.push({ kind: 'end' });
  return result;
}

function currentUrl() {
  const params = new URLSearchParams();
  params.set('date', edition.date);
  const active = slides[current];
  if (active?.kind === 'story') params.set('story', active.story.id);
  if (active?.kind === 'category') params.set('section', active.section.id);
  if (active?.kind === 'end') params.set('end', '1');
  return '?' + params.toString();
}

function storyUrl(date, id) {
  const params = new URLSearchParams({ date, story: id });
  return '?' + params.toString();
}

function rememberPosition() {
  try {
    localStorage.setItem('fdf-position', JSON.stringify({ date: edition.date, index: current }));
  } catch (_) {
    // Browsing without local storage must still work.
  }
}

function restoreFromUrl(initial = false) {
  const params = new URLSearchParams(location.search);
  const date = params.get('date');
  edition = editions.find(item => item.date === date) || editions[0];
  slides = buildSlides(edition);
  const story = params.get('story');
  const section = params.get('section');
  let index = 0;

  if (story) index = slides.findIndex(item => item.kind === 'story' && item.story.id === story);
  else if (section) index = slides.findIndex(item => item.kind === 'category' && item.section.id === section);
  else if (params.get('end') === '1') index = slides.length - 1;
  else if (initial && !date) {
    try {
      const saved = JSON.parse(localStorage.getItem('fdf-position'));
      if (saved?.date === edition.date && Number.isInteger(saved.index)) index = saved.index;
    } catch (_) { /* Optional convenience. */ }
  }

  current = Math.max(0, Math.min(index, slides.length - 1));
}

function sceneLabel(slide) {
  if (slide.kind === 'end') return 'Fine dell’edizione';
  if (slide.kind === 'category') return slide.section.name;
  return slide.story.title;
}

function renderDates() {
  // Only real published editions appear here; oldest to newest.
  const ordered = [...editions].sort((a, b) => a.date.localeCompare(b.date));
  return '<nav class="date-nav" aria-label="Archivio delle edizioni">' +
    '<div class="date-list" id="date-list">' +
    ordered.map(item => {
      const active = item.date === edition.date;
      return '<button type="button" class="date-item' + (active ? ' active' : '') +
        '" data-date="' + escapeHtml(item.date) + '" ' +
        (active ? 'aria-current="date" ' : '') +
        'aria-label="Edizione del ' + escapeHtml(longDate(item.date)) + '">' +
        escapeHtml(shortDate(item.date)) + '</button>';
    }).join('') + '</div></nav>';
}

function renderTimeline() {
  const total = slides.length;
  const active = slides[current];
  const caption = active.kind === 'end' ? 'FINE' : active.section.name;
  const segments = slides.map((slide, index) => {
    const state = index < current ? ' completed' : (index === current ? ' active' : ' future');
    const label = (index + 1) + ' di ' + total + ' — ' +
      (slide.section ? slide.section.name + ': ' : '') + sceneLabel(slide);
    return '<button type="button" class="timeline-segment' + state +
      '" data-screen="' + index + '" aria-label="' + escapeHtml(label) +
      '" ' + (index === current ? 'aria-current="step" ' : '') +
      'title="' + escapeHtml(label) + '"><span class="timeline-line"></span></button>';
  }).join('');

  const percentage = Math.min(88, Math.max(0, (current + .5) / total * 100));
  return '<section class="desktop-timeline" aria-label="Avanzamento della lettura">' +
    '<div class="timeline-heading"><span>EDIZIONE DEL ' + escapeHtml(longDate(edition.date).toUpperCase()) +
    '</span><span class="timeline-count"><strong>' + pad(current + 1) +
    '</strong> di ' + pad(total) + '</span></div>' +
    '<nav class="timeline-segments" id="desktop-segments" aria-label="Vai a una schermata">' + segments +
    '</nav><div class="timeline-label" style="--label-position:' + percentage + '%">' +
    escapeHtml(caption) + '</div></section>';
}

function renderMobileTimeline() {
  const total = slides.length;
  return '<aside class="mobile-rail" aria-label="Avanzamento della lettura">' +
    '<div class="mobile-rail-top">' + pad(current + 1) + '<span>/' + pad(total) + '</span></div>' +
    '<nav class="mobile-segments" id="mobile-segments" aria-label="Schermate dell’edizione">' +
    slides.map((slide, index) => {
      const state = index < current ? ' completed' : index === current ? ' active' : ' future';
      const label = (index + 1) + ' di ' + total + ' — ' + sceneLabel(slide);
      return '<button type="button" class="mobile-segment' + state +
        '" data-screen="' + index + '" aria-label="' + escapeHtml(label) + '" ' +
        (index === current ? 'aria-current="step" ' : '') +
        'title="' + escapeHtml(label) + '"><span></span></button>';
    }).join('') + '</nav></aside>';
}

function richText(value, terms) {
  const available = (terms || []).filter(term => term.term && term.definition);
  if (!available.length) return escapeHtml(value);
  const escapedTerms = available.map(term => term.term.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&'));
  const regex = new RegExp('(?<![\\p{L}\\p{N}])(' + escapedTerms.join('|') + ')(?![\\p{L}\\p{N}])', 'giu');
  let start = 0;
  let html = '';
  for (const match of String(value).matchAll(regex)) {
    html += escapeHtml(value.slice(start, match.index));
    const termIndex = available.findIndex(term => term.term.toLocaleLowerCase('it') === match[0].toLocaleLowerCase('it'));
    html += '<button type="button" class="term" data-term="' + termIndex +
      '" aria-label="Spiega: ' + escapeHtml(match[0]) + '">' + escapeHtml(match[0]) + '</button>';
    start = match.index + match[0].length;
  }
  return html + escapeHtml(value.slice(start));
}

function renderArticle(slide) {
  const story = slide.story;
  const head = '<div class="article-meta"><span>' + escapeHtml(slide.section.name) +
    ' <span aria-hidden="true">·</span> ' + escapeHtml(longDate(edition.date)) +
    '</span><span>' + (Number(story.minutes) || 0) + ' MIN DI LETTURA' +
    (edition.demo ? ' <span class="demo-flag">· EDIZIONE DIMOSTRATIVA</span>' : '') +
    '</span></div>';

  const paragraphs = (story.paragraphs || [])
    .map(paragraph => '<p>' + richText(paragraph, story.terms) + '</p>').join('');

  const deepDive = story.deepDive ?
    '<details class="article-details"><summary><span>PER CAPIRE DAVVERO</span><span class="details-icon" aria-hidden="true"></span></summary>' +
    '<div class="details-body"><p>' + escapeHtml(story.deepDive) + '</p></div></details>' : '';

  const related = (story.related || []).filter(item =>
    editions.some(e => e.date === item.date && (e.sections || []).some(s =>
      (s.stories || []).some(a => a.id === item.storyId)
    ))
  );
  const relatedHtml = related.length ?
    '<details class="article-details"><summary><span>LA STORIA FIN QUI</span><span class="details-icon" aria-hidden="true"></span></summary>' +
    '<div class="details-body related-list">' +
    related.map(item => '<a href="' + escapeHtml(storyUrl(item.date, item.storyId)) +
      '">' + escapeHtml(longDate(item.date)) + ' <span aria-hidden="true">→</span><strong>' +
      escapeHtml(item.label || item.storyId) + '</strong></a>').join('') +
    '</div></details>' : '';

  const sources = (story.sources || []).filter(source => {
    try { return ['http:', 'https:'].includes(new URL(source.url).protocol); }
    catch (_) { return false; }
  });
  const sourceHtml = sources.length ?
    '<details class="article-details"><summary><span>FONTI E DOCUMENTI</span><span class="details-icon" aria-hidden="true"></span></summary>' +
    '<div class="details-body sources-list">' +
    sources.map(source => '<a target="_blank" rel="noopener noreferrer" href="' + escapeHtml(source.url) +
      '">' + escapeHtml(source.title || source.url) + ' <span aria-hidden="true">↗</span></a>').join('') +
    '</div></details>' : '';

  return '<article class="article" id="' + escapeHtml(story.id) +
    '">' + head + '<h1>' + escapeHtml(story.title) +
    '</h1><p class="article-dek">' + escapeHtml(story.dek || '') +
    '</p><div class="article-body">' + paragraphs + '</div>' +
    '<div class="article-extras">' + deepDive + relatedHtml + sourceHtml +
    '</div><div class="article-ending" aria-hidden="true"></div></article>';
}

function renderSlide(slide, index) {
  let content;
  if (slide.kind === 'category') {
    const ordinal = edition.sections.indexOf(slide.section) + 1;
    content = '<div class="category"><div class="eyebrow">' +
      pad(ordinal) + ' / ' + pad(edition.sections.length) +
      '</div><h1>' + escapeHtml(slide.section.name) +
      '</h1><div class="category-rule" aria-hidden="true"></div>' +
      '<p class="category-hint">Continua <span aria-hidden="true">→</span></p></div>';
  } else if (slide.kind === 'end') {
    content = '<div class="ending"><div class="eyebrow">FINE DELL’EDIZIONE</div>' +
      '<h1>Per oggi, ci siamo.</h1><p>A domani.</p></div>';
  } else {
    content = renderArticle(slide);
  }
  return '<section class="slide' + (index === current ? ' active' : '') +
    '" data-index="' + index + '"' + (index === current ? '' : ' inert') +
    ' aria-label="' + escapeHtml(sceneLabel(slide)) + '">' + content + '</section>';
}

function render() {
  if (!edition) return;
  app.innerHTML =
    '<header class="site-header"><a class="brand" href="./" aria-label="FUORI DAL FEED, torna all’edizione recente">' +
    'FUORI DAL <span>FEED.</span></a>' + renderDates() + '</header>' +
    renderTimeline() +
    '<div class="reading-layout">' + renderMobileTimeline() +
    '<main class="reading-main" id="reading-main">' +
    slides.map(renderSlide).join('') +
    '<div class="reading-controls" aria-label="Navigazione schermate">' +
    '<button type="button" data-prev aria-label="Schermata precedente" ' + (current === 0 ? 'disabled ' : '') + '>←</button>' +
    '<button type="button" data-next aria-label="Schermata successiva" ' +
    (current === slides.length - 1 ? 'disabled ' : '') + '>→</button></div></main></div>';

  const selectedDate = app.querySelector('.date-item.active');
  const dateList = app.querySelector('.date-list');
  if (selectedDate && dateList) {
    dateList.scrollLeft = Math.max(0, selectedDate.offsetLeft - dateList.offsetLeft -
      (dateList.clientWidth - selectedDate.offsetWidth) / 2);
  }
  for (const selector of ['#desktop-segments', '#mobile-segments']) {
    const nav = app.querySelector(selector);
    const active = nav?.querySelector('[aria-current]');
    if (active && nav) {
      if (selector === '#desktop-segments') {
        nav.scrollLeft = Math.max(0, active.offsetLeft - nav.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2);
      } else {
        nav.scrollTop = Math.max(0, active.offsetTop - nav.offsetTop - (nav.clientHeight - active.offsetHeight) / 2);
      }
    }
  }
}

function closeTerm() {
  document.querySelector('.term-popover')?.remove();
  termAnchor = null;
}

function showTerm(button) {
  const selected = slides[current];
  if (!selected?.story) return;
  const item = (selected.story.terms || [])[Number(button.dataset.term)];
  if (!item) return;
  if (termAnchor === button) { closeTerm(); return; }
  closeTerm();
  termAnchor = button;

  const popover = document.createElement('div');
  popover.className = 'term-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', 'Spiegazione: ' + item.term);
  popover.innerHTML = '<button type="button" class="term-close" aria-label="Chiudi spiegazione">×</button>' +
    '<div class="term-heading">' + escapeHtml(item.term) + '</div>' +
    '<p>' + escapeHtml(item.definition) + '</p>';
  document.body.append(popover);
  const target = button.getBoundingClientRect();
  const width = Math.min(340, window.innerWidth - 32);
  popover.style.width = width + 'px';
  popover.style.left = Math.max(16, Math.min(target.left, window.innerWidth - width - 16)) + 'px';
  const availableBelow = window.innerHeight - target.bottom - 16;
  let top = availableBelow >= popover.offsetHeight ?
    target.bottom + 10 : target.top - popover.offsetHeight - 10;
  popover.style.top = Math.max(10, Math.min(top, window.innerHeight - popover.offsetHeight - 10)) + 'px';
  popover.querySelector('.term-close').addEventListener('click', closeTerm);
  popover.querySelector('.term-close').focus({ preventScroll: true });
}

function updateScreen(index, addHistory = false) {
  const next = Math.max(0, Math.min(index, slides.length - 1));
  if (next === current) return;
  closeTerm();
  current = next;
  const method = addHistory ? 'pushState' : 'replaceState';
  history[method]({}, '', currentUrl());
  rememberPosition();
  render();
}

function move(delta) { updateScreen(current + delta); }

function changeEdition(date) {
  const next = editions.find(item => item.date === date);
  if (!next || next.date === edition.date) return;
  closeTerm();
  edition = next;
  slides = buildSlides(edition);
  current = 0;
  history.pushState({}, '', currentUrl());
  rememberPosition();
  render();
}

app.addEventListener('click', event => {
  const dateButton = event.target.closest('button[data-date]');
  if (dateButton) return changeEdition(dateButton.dataset.date);

  const screenButton = event.target.closest('button[data-screen]');
  if (screenButton) return updateScreen(Number(screenButton.dataset.screen));

  if (event.target.closest('[data-prev]')) return move(-1);
  if (event.target.closest('[data-next]')) return move(1);

  const term = event.target.closest('button[data-term]');
  if (term) return showTerm(term);

  if (event.target.closest('.category-hint')) move(1);
});

document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.term-popover, .term')) closeTerm();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') return closeTerm();
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.target.closest('button, a, input, textarea, select, summary, [contenteditable="true"]')) return;
  if (event.key === 'ArrowRight') move(1);
  if (event.key === 'ArrowLeft') move(-1);
});

document.addEventListener('wheel', event => {
  if (!event.target.closest('.reading-main') ||
      event.target.closest('.term-popover') ||
      Math.abs(event.deltaX) < 28 ||
      Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.5) return;
  const now = performance.now();
  if (now - wheelLastAt < 650) return;
  wheelLastAt = now;
  move(event.deltaX > 0 ? 1 : -1);
}, { passive: true });

app.addEventListener('touchstart', event => {
  if (!event.target.closest('.reading-main') ||
      event.target.closest('a, button, summary, details')) return;
  const touch = event.changedTouches[0];
  if (touch.clientX < 26 || touch.clientX > window.innerWidth - 26) return;
  gesture = { x: touch.clientX, y: touch.clientY };
}, { passive: true });

app.addEventListener('touchend', event => {
  if (!gesture) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - gesture.x;
  const dy = touch.clientY - gesture.y;
  gesture = null;
  if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.6 &&
      !window.getSelection()?.toString()) move(dx < 0 ? 1 : -1);
}, { passive: true });

app.addEventListener('touchcancel', () => { gesture = null; }, { passive: true });

app.addEventListener('scroll', event => {
  if (event.target.classList?.contains('slide')) closeTerm();
}, true);

window.addEventListener('resize', closeTerm);
window.addEventListener('popstate', () => {
  closeTerm();
  restoreFromUrl();
  render();
});

fetch('./data/editions.json')
  .then(response => {
    if (!response.ok) throw new Error('Edizioni non disponibili');
    return response.json();
  })
  .then(data => {
    if (!Array.isArray(data) || !data.length) throw new Error('Archivio vuoto');
    editions = data.filter(item => item.date && Array.isArray(item.sections))
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!editions.length) throw new Error('Nessuna edizione valida');
    restoreFromUrl(true);
    render();
  })
  .catch(error => {
    app.innerHTML = '<div class="load-error"><h1>Non riusciamo a caricare l’edizione.</h1>' +
      '<p>' + escapeHtml(error.message) + '</p><button type="button" onclick="location.reload()">Riprova</button></div>';
  });
