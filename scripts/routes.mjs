// Après `vite build` : crée dist/1/index.html … dist/100/index.html.
// Chaque page est la même application ; elle lit son numéro dans l'URL.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { SEEDS } from '../src/game/stories/seeds.js';

const html = readFileSync('dist/index.html', 'utf8');
// Les ressources sont un dossier plus haut.
const sub = html.replaceAll('="./assets/', '="../assets/').replaceAll("='./assets/", "='../assets/");

SEEDS.forEach((seed, i) => {
  const n = i + 1;
  mkdirSync(`dist/${n}`, { recursive: true });
  const page = sub
    .replace(/<title>[^<]*<\/title>/, `<title>${seed[0]} · Mondes Vivants</title>`)
    .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${seed[10].replaceAll('"', '&quot;')}"`);
  writeFileSync(`dist/${n}/index.html`, page);
});
// Niveau caché 101.
mkdirSync('dist/101', { recursive: true });
writeFileSync('dist/101/index.html', sub.replace(/<title>[^<]*<\/title>/, "<title>Le Trône de l'Archive · Mondes Vivants</title>"));
// Page 404 de GitHub Pages : renvoie vers la liste.
writeFileSync('dist/404.html', html.replace('<head>', '<head><base href="/" />').replace(/<script type="module"[^>]*><\/script>/, '<script>location.replace(location.pathname.split("/").slice(0, 2).join("/") + "/");</script>'));
writeFileSync('dist/.nojekyll', '');
console.log(`routes : ${SEEDS.length} histoires`);
