const fs = require('fs');
const html = fs.readFileSync('C:/Users/ASUS/Downloads/sklad.html', 'utf8');
function extract(id) {
  const re = new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)</script>');
  const m = html.match(re); return m ? m[1] : null;
}
const dataRaw = extract('__seedData');
const photosRaw = extract('__seedPhotos');
console.log('seedData present:', !!dataRaw, 'len', dataRaw ? dataRaw.length : 0);
console.log('seedPhotos present:', !!photosRaw, 'len', photosRaw ? photosRaw.length : 0);
const db = JSON.parse(dataRaw);
console.log('TOP KEYS:', Object.keys(db));
for (const k of Object.keys(db)) {
  const v = db[k];
  if (Array.isArray(v)) {
    console.log(`\n== ${k}: ${v.length} записей`);
    if (v[0]) console.log('  поля:', Object.keys(v[0]).join(', '));
    if (v[0]) console.log('  пример:', JSON.stringify(v[0]).slice(0, 320));
  } else {
    console.log(`\n== ${k} (объект):`, JSON.stringify(v).slice(0, 320));
  }
}
if (photosRaw) {
  const pics = JSON.parse(photosRaw);
  const ids = Object.keys(pics);
  console.log('\nФОТО: всего', ids.length);
  if (ids[0]) console.log('  ключ:', ids[0], '| значение:', String(pics[ids[0]]).slice(0, 40));
}
