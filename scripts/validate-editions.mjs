// Editorial schema checks. This does NOT fact-check article claims or fetch live news.
import { readFileSync } from 'node:fs';

const editions = JSON.parse(readFileSync(new URL('../data/editions.json', import.meta.url), 'utf8'));
const errors = [];
const warnings = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T12:00:00Z'));
const allRefs = new Set(editions.flatMap(ed => (ed.sections || []).flatMap(sec => (sec.stories || []).map(st => ed.date + '|' + st.id))));
assert(Array.isArray(editions) && editions.length > 0, 'No editions found');
const current = editions[0];
if (current) {
  assert(validDate(current.date), 'Latest edition date is invalid');
  assert(typeof current.lastEditorialCheck === 'string' && !Number.isNaN(Date.parse(current.lastEditorialCheck)), 'Latest edition needs a real editorial check timestamp');
  assert(Array.isArray(current.sections) && current.sections.length > 0, 'Latest edition needs sections');
  const seen = new Set();
  const validFreshness = new Set(['NOTIZIA DI OGGI', 'SVILUPPO IN CORSO', 'CONTESTO E APPROFONDIMENTO', 'SCOPERTA, RICERCA O LETTURA', 'RIFLESSIONE EDITORIALE']);
  const validStatuses = new Set(['fonti-consultate', 'da-verificare', 'editoriale']);
  for (const sec of current.sections || []) {
    assert(typeof sec.id === 'string' && !!sec.id, 'A section has no id');
    for (const st of sec.stories || []) {
      const prefix = sec.id + '/' + st.id;
      assert(st.id && !seen.has(st.id), prefix + ' has a duplicate or absent id');
      seen.add(st.id);
      assert(typeof st.title === 'string' && st.title.length > 15, prefix + ' title too short');
      assert(Array.isArray(st.paragraphs) && st.paragraphs.length >= 2, prefix + ' has fewer than two paragraphs');
      assert(Number(st.minutes) > 0, prefix + ' reading time invalid');
      assert(validFreshness.has(st.freshness), prefix + ' freshness category invalid');
      assert(validStatuses.has(st.verificationStatus), prefix + ' verification status invalid');
      if (st.verificationStatus === 'editoriale') {
        assert(st.type === 'EDITORIALE', prefix + ' editorial must have EDITORIALE type');
      } else {
        assert(validDate(st.sourceDate) && st.sourceDate <= current.date, prefix + ' missing/invalid source date');
        assert(Array.isArray(st.sources) && st.sources.length > 0, prefix + ' has no source links');
        const direct = (st.sources || []).filter(s => {
          try {
            const u = new URL(s.url);
            return u.protocol === 'https:' && u.pathname.length >= 24 && !u.pathname.endsWith('/index.shtml') && !/^\/(world|news|topnews|economia|politica|latest)\/?$/.test(u.pathname);
          } catch { return false; }
        });
        assert(direct.length > 0, prefix + ' has no direct HTTPS article/document link');
        if (st.verificationStatus === 'da-verificare') warnings.push(prefix + ' still needs human fact checking');
      }
      if (st.updatedAt) assert(!Number.isNaN(Date.parse(st.updatedAt)), prefix + ' updatedAt malformed');
      for (const link of st.related || []) assert(allRefs.has(link.date + '|' + link.storyId), prefix + ' broken related article reference');
    }
  }
  console.log('Edition: ' + current.date + ' — ' + seen.size + ' article IDs, ' + errors.length + ' errors, ' + warnings.length + ' warnings');
}
for (const m of warnings) console.warn('WARNING: ' + m);
for (const m of errors) console.error('ERROR: ' + m);
if (errors.length) process.exitCode = 1;
