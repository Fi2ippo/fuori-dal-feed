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
let readerState = { positions: {}, progress: {}, details: {} };
let saveTimer = null;

try {
  const stored = JSON.parse(localStorage.getItem('fdf-reader-v1'));
  if (stored && typeof stored === 'object') {
    readerState = {
      positions: stored.positions && typeof stored.positions === 'object' ? stored.positions : {},
      progress: stored.progress && typeof stored.progress === 'object' ? stored.progress : {},
      details: stored.details && typeof stored.details === 'object' ? stored.details : {}
    };
  }
} catch (_) { /* Storage is optional. */ }

function screenKey(index = current) {
  if (!edition || !slides[index]) return '';
  const slide = slides[index];
  const id = slide.kind === 'story' ? slide.story.id :
    slide.kind === 'category' ? slide.section.id : 'finish';
  return edition.date + '|' + slide.kind + '|' + id;
}
function saveReaderState() {
  if (saveTimer) clearTimeout(saveTimer);
  try { localStorage.setItem('fdf-reader-v1', JSON.stringify(readerState)); }
  catch (_) { /* Reading must work without local storage. */ }
}
function queueReaderSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; saveReaderState(); }, 200);
}
function rememberScroll(completed = false) {
  const element = app.querySelector('.slide.active');
  if (!element) return;
  const key = screenKey();
  const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
  const progress = completed ? 1 : (maximum < 4 ? (slides[current]?.kind === 'story' ? 1 : 0) :
    Math.min(1, Math.max(0, element.scrollTop / maximum)));
  readerState.positions[key] = element.scrollTop;
  readerState.progress[key] = Math.max(readerState.progress[key] || 0, progress);
  const segment = app.querySelector('.rail-segment.active');
  if (segment) {
    segment.style.setProperty('--fill', Math.round(progress * 100) + '%');
    if (readerState.progress[key] >= .985) segment.classList.add('completed');
  }
  queueReaderSave();
}


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
    localStorage.setItem('fdf-position', JSON.stringify({ date: edition.date, index: current, editionTag: edition.status || 'published' }));
  } catch (_) {
    // Browsing without local storage must still work.
  }
}

function restoreFromUrl(initial = false) {
  const params = new URLSearchParams(location.search);
  const date = params.get('date');
  let restoredDate=null;
  if(initial&&!date){
    try {
      const saved=JSON.parse(localStorage.getItem('fdf-position'));
      if(saved&&editions.some(e=>e.date===saved.date&&
        (e.status||'published')===saved.editionTag))restoredDate=saved.date;
    }catch(_){}
  }
  edition=editions.find(item=>item.date===(date||restoredDate))||editions[0];
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
      if (saved?.date === edition.date && saved.editionTag === (edition.status || 'published') &&
          Number.isInteger(saved.index)) index = saved.index;
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

function renderSideTimeline() {
  const total = slides.length;
  return '<aside class="reading-rail" aria-label="Progresso della lettura">' +
    '<nav class="rail-segments" id="rail-segments" aria-label="Vai a una schermata dell’edizione">' +
    slides.map((slide, index) => {
      const fraction = Math.max(0, Math.min(1, readerState.progress[screenKey(index)] || 0));
      const status = (fraction >= .985 ? ' completed' : ' future') +
        (index === current ? ' active' : '');
      const label = (index + 1) + ' di ' + total + ' — ' +
        (slide.section ? slide.section.name + ' — ' : '') + sceneLabel(slide);
      return '<button type="button" class="rail-segment' + status +
        '" data-screen="' + index + '" style="--fill:' + Math.round(fraction * 100) +
        '%" aria-label="' + escapeHtml(label) + '"' +
        (index === current ? ' aria-current="step"' : '') +
        ' title="' + escapeHtml(label) + '"><span class="rail-line" aria-hidden="true"></span></button>';
    }).join('') +
    '</nav><div class="rail-count" aria-label="Schermata ' + (current + 1) + ' di ' + total + '">' +
    pad(current + 1) + '<span>/' + pad(total) + '</span></div></aside>';
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

function returnToReadingLink(storyId) {
  const params = new URLSearchParams(location.search);
  if (params.get('date') !== edition.date || params.get('story') !== storyId) return '';
  try {
    const link = JSON.parse(sessionStorage.getItem('fdf-reading-return'));
    if (!link || link.destination !== location.search || link.origin === link.destination) return '';
    return '<a class="return-to-reading" href="' + escapeHtml(link.origin) +
      '"><span aria-hidden="true">←</span> Torna alla lettura</a>';
  } catch (_) { return ''; }
}

function renderArticle(slide) {
  const story = slide.story;
  const validKinds = ['NOTIZIA', 'ANALISI', 'CONTESTO', 'RICERCA', 'CULTURA'];
  const kind = validKinds.includes(story.type) ? story.type : 'NOTIZIA';
  const head = '<div class="article-meta"><span><strong class="article-kind">' +
    escapeHtml(kind) + '</strong><span class="meta-separator"> / </span>' +
    escapeHtml(slide.section.name) +
    ' <span aria-hidden="true">·</span> ' + escapeHtml(longDate(edition.date)) +
    '</span><span>' + (Number(story.minutes) || 0) + ' MIN DI LETTURA' +
    (edition.demo ? ' <span class="demo-flag">· EDIZIONE DIMOSTRATIVA</span>' :
      edition.status === 'edizione-pilota' ? ' <span class="demo-flag">· EDIZIONE PILOTA</span>' : '') +
    '</span></div>';

  const paragraphs = (story.paragraphs || [])
    .map(paragraph => '<p>' + richText(paragraph, story.terms) + '</p>').join('');

  const deepDive = story.deepDive ?
    '<details class="article-details" data-detail="deepDive"><summary><span>PER CAPIRE DAVVERO</span><span class="details-icon" aria-hidden="true"></span></summary>' +
    '<div class="details-body"><p>' + escapeHtml(story.deepDive) + '</p></div></details>' : '';

  const related = (story.related || []).filter(item =>
    editions.some(e => e.date === item.date && (e.sections || []).some(s =>
      (s.stories || []).some(a => a.id === item.storyId)
    ))
  );
  const relatedHeading = related.some(item => item.date < edition.date) ?
    'LA STORIA FIN QUI' : 'PER COLLEGARE I FATTI';
  const relatedHtml = related.length ?
    '<details class="article-details" data-detail="related"><summary><span>' + relatedHeading + '</span><span class="details-icon" aria-hidden="true"></span></summary>' +
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
    '<details class="article-details" data-detail="sources"><summary><span>FONTI E DOCUMENTI</span><span class="details-icon" aria-hidden="true"></span></summary>' +
    '<div class="details-body sources-list">' +
    sources.map(source => '<a target="_blank" rel="noopener noreferrer" href="' + escapeHtml(source.url) +
      '">' + escapeHtml(source.title || source.url) + ' <span aria-hidden="true">↗</span></a>').join('') +
    '</div></details>' : '';

  return '<article class="article" id="' + escapeHtml(story.id) +
    '">' + returnToReadingLink(story.id) + head + '<h1>' + escapeHtml(story.title) +
    '</h1><p class="article-dek">' + escapeHtml(story.dek || '') +
    '</p><div class="article-reading"><div class="article-body">' + paragraphs +
    '</div><aside class="margin-note" aria-live="polite" hidden></aside></div>' +
    '<div class="article-extras">' + deepDive + relatedHtml + sourceHtml +
    '</div><div class="article-ending" aria-hidden="true"></div></article>';
}


/* The edition is a single vertical stream. Sections are semantic landmarks;
   gates add gentle editorial breathing space without hiding any article. */
let scrollEl=null,scrollTick=0,initializing=false,jumpInProgress=false;
let boundaryBrake=null,passedGate=-1,skipPreviousCompletion=false;
const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
function flowKey(){return edition.date+'|flow';}
function renderSlide(slide,index){
  let content;
  if(slide.kind==='category'){
    const no=edition.sections.indexOf(slide.section)+1;
    content='<div class="category"><div class="eyebrow">'+pad(no)+' / '+pad(edition.sections.length)+
      '</div><h1>'+escapeHtml(slide.section.name)+'</h1><div class="category-rule"></div>'+
      '<p class="category-hint">Scorri per continuare ↓</p></div>';
  }else if(slide.kind==='end'){
    content='<div class="ending"><div class="eyebrow">FINE DELL’EDIZIONE</div>'+
      '<h1>Per oggi, sei aggiornato.</h1><div class="category-rule"></div>'+
      '<p class="ending-subtitle">La lettura di oggi finisce qui.</p>'+
      '<p class="ending-date">'+escapeHtml(longDate(edition.date))+'</p></div>';
  }else content=renderArticle(slide);
  const kind=slide.kind==='category'?'chapter-section':slide.kind==='end'?'ending-section':'article-section';
  const section='<section class="reading-section '+kind+'" id="screen-'+index+
    '" data-index="'+index+'" aria-label="'+escapeHtml(sceneLabel(slide))+'">'+content+'</section>';
  if(index===slides.length-1)return section;
  const chapter=slide.kind==='category'||slides[index+1].kind==='category';
  return section+'<div class="editorial-gate '+(chapter?'chapter-gate':'story-gate')+
    '" data-after="'+index+'" aria-hidden="true"><span class="gate-rule"></span></div>';
}
function closeTerm(){
  document.querySelectorAll('.inline-note').forEach(n=>n.remove());
  app.querySelectorAll('.margin-note').forEach(n=>{n.innerHTML='';n.hidden=true;});
  termAnchor=null;
}
function showTerm(button){
  const section=button.closest('.reading-section');
  const story=slides[Number(section?.dataset.index)]?.story;
  const item=(story?.terms||[])[Number(button.dataset.term)];
  if(!item)return;
  if(termAnchor===button){closeTerm();return;}
  closeTerm();termAnchor=button;
  const html='<button type="button" class="annotation-close" aria-label="Chiudi spiegazione">×</button>'+
    '<div class="annotation-heading">'+escapeHtml(item.term)+'</div>'+
    '<p>'+escapeHtml(item.definition)+'</p>'+
    (item.example?'<p class="annotation-example">'+escapeHtml(item.example)+'</p>':'');
  let note;
  if(window.innerWidth>=1190){
    note=section.querySelector('.margin-note');
    if(!note)return;
    note.hidden=false;note.innerHTML=html;
  }else{
    note=document.createElement('aside');
    note.className='inline-note';
    note.innerHTML=html;
    button.closest('p')?.insertAdjacentElement('afterend',note);
  }
  note.setAttribute('role','note');
  note.setAttribute('aria-label','Spiegazione: '+item.term);
  note.querySelector('.annotation-close')?.addEventListener('click',()=>{
    closeTerm();button.focus({preventScroll:true});
  });
  scheduleScroll();
}
function elements(){return scrollEl?[...scrollEl.querySelectorAll('.reading-section')]:[];}
function viewIndex(blocks,top,viewport){
  const probe=top+Math.min(110,viewport*.18);
  let result=0;
  for(let i=0;i<blocks.length;i++){
    if(blocks[i].offsetTop<=probe+1)result=i;
    else break;
  }
  return result;
}
function measure(block,top,viewport){
  const height=Math.max(1,block.offsetHeight);
  const untilDone=height<=viewport*1.15?height:Math.max(1,height-viewport*.6);
  return clamp((top-block.offsetTop)/untilDone);
}
function setRailIndex(index){
  const rail=app.querySelector('#rail-segments');
  rail?.querySelectorAll('.rail-segment').forEach((node,i)=>{
    node.classList.toggle('active',i===index);
    if(i===index)node.setAttribute('aria-current','step');
    else node.removeAttribute('aria-current');
  });
  const count=app.querySelector('.rail-count');
  if(count)count.innerHTML=pad(index+1)+'<span>/'+pad(slides.length)+'</span>';
  const active=rail?.querySelector('.rail-segment.active');
  if(active&&rail){
    const centered=active.offsetTop-rail.offsetTop-(rail.clientHeight-active.offsetHeight)/2;
    if(Math.abs(rail.scrollTop-centered)>active.offsetHeight*2)
      rail.scrollTo({top:centered,behavior:reducedMotion.matches?'instant':'smooth'});
  }
}
function updateScroll(){
  if(initializing||!scrollEl||!edition)return;
  const blocks=elements();if(!blocks.length)return;
  const top=scrollEl.scrollTop,viewport=scrollEl.clientHeight;
  const index=viewIndex(blocks,top,viewport);
  if(index!==current){
    current=index;
    setRailIndex(index);
    if(!jumpInProgress){
      history.replaceState({},'',currentUrl());
      rememberPosition();
    }
    if(window.innerWidth<1190)closeTerm();
  }
  const fraction=measure(blocks[index],top,viewport),key=screenKey(index);
  if(!jumpInProgress){
    readerState.progress[key]=Math.max(Number(readerState.progress[key])||0,fraction);
    // A skipped article is never automatically marked read by a direct jump.
    if(index>0&&!skipPreviousCompletion){
      const previous=blocks[index-1];
      if(top-previous.offsetTop<viewport*2.2&&
         top+1>=previous.offsetTop+previous.offsetHeight){
        readerState.progress[screenKey(index-1)]=1;
      }
    }
  }
  skipPreviousCompletion=false;
  app.querySelectorAll('.rail-segment').forEach((node,i)=>{
    const maxRead=clamp(Number(readerState.progress[screenKey(i)])||0);
    node.classList.toggle('visited',maxRead>.01);
    node.classList.toggle('completed',maxRead>=.985);
    node.style.setProperty('--fill',Math.round((i===index?fraction:maxRead)*100)+'%');
  });
  if(!jumpInProgress){
    readerState.positions[flowKey()]=top;
    readerState.positions[key]=Math.max(0,top-blocks[index].offsetTop);
    queueReaderSave();
  }
}
function scheduleScroll(){
  if(scrollTick||initializing)return;
  scrollTick=requestAnimationFrame(()=>{scrollTick=0;updateScroll();});
}
function saveCurrent(){
  if(!scrollEl||!edition)return;
  const block=elements()[current];
  readerState.positions[flowKey()]=scrollEl.scrollTop;
  if(block)readerState.positions[screenKey()]=Math.max(0,scrollEl.scrollTop-block.offsetTop);
  saveReaderState();rememberPosition();
}
function restoreDetails(){
  app.querySelectorAll('.reading-section').forEach(section=>{
    const index=Number(section.dataset.index);
    section.querySelectorAll('details[data-detail]').forEach(detail=>{
      detail.open=Boolean(readerState.details[screenKey(index)+':'+detail.dataset.detail]);
    });
  });
}
function render(landing={index:current,mode:'start'}){
  if(!edition)return;
  cancelAnimationFrame(scrollTick);scrollTick=0;initializing=true;
  closeTerm();
  app.innerHTML='<header class="site-header"><a class="brand" href="./" aria-label="FUORI DAL FEED, ultima edizione">'+
    'FUORI DAL <span>FEED.</span></a>'+renderDates()+'</header>'+
    '<div class="reading-layout">'+renderSideTimeline()+
    '<main class="reading-main"><div class="reading-scroll" id="reading-scroll" tabindex="0" aria-label="Edizione del '+
    escapeHtml(longDate(edition.date))+'">'+slides.map(renderSlide).join('')+
    '</div></main></div>';
  scrollEl=app.querySelector('#reading-scroll');
  restoreDetails();
  scrollEl.addEventListener('scroll',scheduleScroll,{passive:true});
  scrollEl.addEventListener('wheel',handleWheel,{passive:false});
  const dateList=app.querySelector('.date-list');
  const dateActive=dateList?.querySelector('.date-item.active');
  if(dateList&&dateActive){
    dateList.scrollLeft=Math.max(0,dateActive.offsetLeft-dateList.offsetLeft-
      (dateList.clientWidth-dateActive.offsetWidth)/2);
  }
  boundaryBrake=null;passedGate=-1;jumpInProgress=false;skipPreviousCompletion=true;
  const createdScroll=scrollEl;
  createdScroll.classList.add('bypass-snap');
  requestAnimationFrame(()=>{
    if(scrollEl!==createdScroll)return;
    const wanted=createdScroll.querySelector('#screen-'+landing.index);
    if(!wanted)return;
    const stored=Number(readerState.positions[screenKey(landing.index)])||0;
    const resume=landing.mode==='resume'||landing.mode==='return';
    const flow=Number(readerState.positions[flowKey()]);
    const useFlow=landing.mode==='resume'&&Number.isFinite(flow);
    createdScroll.scrollTop=useFlow?flow:wanted.offsetTop+(resume?Math.max(0,stored):0);
    current=landing.index;setRailIndex(current);
    requestAnimationFrame(()=>{
      if(scrollEl!==createdScroll)return;
      initializing=false;
      updateScroll();
      requestAnimationFrame(()=>createdScroll.classList.remove('bypass-snap'));
    });
  });
}
function navigateTo(index,smooth=true){
  const target=scrollEl?.querySelector('#screen-'+index);
  if(!target)return;
  saveCurrent();
  closeTerm();boundaryBrake=null;passedGate=-1;jumpInProgress=true;skipPreviousCompletion=true;
  scrollEl.classList.add('bypass-snap');
  const isSmooth=smooth&&!reducedMotion.matches;
  scrollEl.scrollTo({top:target.offsetTop,behavior:isSmooth?'smooth':'instant'});
  if(isSmooth){
    let settled=false;
    const done=()=>{
      if(settled)return;settled=true;
      scrollEl.removeEventListener('scrollend',done);
      jumpInProgress=false;
      history.replaceState({},'',currentUrl());rememberPosition();
      scrollEl.classList.remove('bypass-snap');scheduleScroll();
    };
    scrollEl.addEventListener('scrollend',done,{once:true});
    setTimeout(done,1050);
  }else{
    current=index;
    history.replaceState({},'',currentUrl());rememberPosition();
    jumpInProgress=false;scrollEl.classList.remove('bypass-snap');scheduleScroll();
  }
}
function changeEdition(date){
  const next=editions.find(item=>item.date===date);
  if(!next||next.date===edition.date)return;
  saveCurrent();edition=next;slides=buildSlides(next);current=0;
  history.pushState({},'',currentUrl());
  rememberPosition();
  render({index:0,mode:'start'});
}
/* Only near boundaries, only for mouse / trackpad wheel: gentle 340ms maximum
   catch. Touch and keyboard retain browser-native scrolling. */
function handleWheel(e){
  if(reducedMotion.matches||!scrollEl||e.defaultPrevented||e.ctrlKey||e.metaKey)return;
  if(e.target.closest('a,button,summary,.inline-note,.margin-note'))return;
  if(Math.abs(e.deltaY)<3||Math.abs(e.deltaY)<Math.abs(e.deltaX)*1.4)return;
  const delta=e.deltaY*(e.deltaMode===1?18:e.deltaMode===2?scrollEl.clientHeight:1);
  const direction=Math.sign(delta),now=performance.now(),top=scrollEl.scrollTop;
  if(boundaryBrake){
    if(direction===boundaryBrake.direction&&
      (now-boundaryBrake.last>170||now-boundaryBrake.start>340)){
      passedGate=boundaryBrake.index;boundaryBrake=null;
    }else if(direction===boundaryBrake.direction){
      e.preventDefault();boundaryBrake.last=now;return;
    }else boundaryBrake=null;
  }
  if(Math.abs(delta)<12)return;
  const gates=scrollEl.querySelectorAll('.editorial-gate');
  for(let i=0;i<gates.length;i++){
    const gate=gates[i];
    const stop=clamp(gate.offsetTop-scrollEl.clientHeight*.18,
      0,Math.max(0,scrollEl.scrollHeight-scrollEl.clientHeight));
    if(passedGate===i){
      if(Math.abs(top-stop)>85)passedGate=-1;
      else continue;
    }
    const crosses=direction>0?
      top<stop+8&&top+delta>=stop-14:
      top>stop-8&&top+delta<=stop+14;
    if(!crosses)continue;
    e.preventDefault();
    scrollEl.scrollTop=stop;
    boundaryBrake={index:i,direction,start:now,last:now};
    gate.classList.add('gate-engaged');
    setTimeout(()=>gate.classList.remove('gate-engaged'),420);
    scheduleScroll();return;
  }
}
app.addEventListener('click',event=>{
  const date=event.target.closest('button[data-date]');
  if(date)return changeEdition(date.dataset.date);
  const jump=event.target.closest('button[data-screen]');
  if(jump)return navigateTo(Number(jump.dataset.screen));
  const term=event.target.closest('button[data-term]');
  if(term)return showTerm(term);
  const related=event.target.closest('.related-list a');
  if(related){
    saveCurrent();
    try{sessionStorage.setItem('fdf-reading-return',JSON.stringify({
      origin:currentUrl(),destination:related.getAttribute('href')
    }));}catch(_){}
  }
});
document.addEventListener('pointerdown',event=>{
  if(!event.target.closest('.inline-note,.margin-note,.term'))closeTerm();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){closeTerm();return;}
  if((event.key==='ArrowDown'||event.key==='ArrowUp'||event.key==='PageDown'||event.key==='PageUp')&&
    event.target===document.body&&scrollEl&&!event.altKey&&!event.ctrlKey&&!event.metaKey){
    event.preventDefault();
    const shift=event.key.startsWith('Page')?scrollEl.clientHeight*.78:65;
    scrollEl.scrollBy({top:shift*(event.key.endsWith('Down')?1:-1),behavior:'instant'});
    return;
  }
  if(event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  if(event.ctrlKey&&event.key==='Home'){event.preventDefault();navigateTo(0,false);}
  if(event.ctrlKey&&event.key==='End'){event.preventDefault();navigateTo(slides.length-1,false);}
});
app.addEventListener('toggle',event=>{
  const detail=event.target;
  if(!detail.matches?.('.reading-section details[data-detail]'))return;
  const index=Number(detail.closest('.reading-section').dataset.index);
  readerState.details[screenKey(index)+':'+detail.dataset.detail]=detail.open;
  queueReaderSave();requestAnimationFrame(scheduleScroll);
},true);
window.addEventListener('resize',()=>{closeTerm();boundaryBrake=null;passedGate=-1;scheduleScroll();});
window.addEventListener('pagehide',saveCurrent);
window.addEventListener('popstate',()=>{
  if(!editions.length)return;
  saveCurrent();
  restoreFromUrl();
  const from=(()=>{try{return JSON.parse(sessionStorage.getItem('fdf-reading-return'))}catch(_){return null}})();
  render({index:current,mode:from?.origin===location.search?'return':'start'});
});
fetch('./data/editions.json',{cache:'no-store'})
  .then(r=>{if(!r.ok)throw Error('Edizioni non disponibili');return r.json();})
  .then(data=>{
    if(!Array.isArray(data)||!data.length)throw Error('Archivio vuoto');
    editions=data.filter(x=>x.date&&Array.isArray(x.sections))
      .sort((a,b)=>b.date.localeCompare(a.date));
    if(!editions.length)throw Error('Nessuna edizione valida');
    const params=new URLSearchParams(location.search);
    const landingMode=!params.get('date')&&!params.get('story')&&!params.get('section')&&!params.get('end')
      ?'resume':'start';
    restoreFromUrl(true);
    const savedReturn=(()=>{try{return JSON.parse(sessionStorage.getItem('fdf-reading-return'))}catch(_){return null}})();
    render({index:current,mode:savedReturn?.origin===location.search?'return':landingMode});
  })
  .catch(e=>{
    app.innerHTML='<div class="load-error"><h1>Non riusciamo a caricare l’edizione.</h1><p>'+
      escapeHtml(e.message)+'</p><button type="button" onclick="location.reload()">Riprova</button></div>';
  });
