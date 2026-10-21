# Bikefit

Site de bike fitting : on choisit un vélo (URL constructeur ou saisie manuelle), on saisit sa
morphologie, et l'app recommande une taille de cadre et des réglages (selle, potence, cintre,
manivelle, cales). Un atelier unique en 4 phases (vélo, morphologie, taille, réglages) affiche un
plan blueprint où le réglage cible (« fantôme » orange) se compare au vélo réel ; la selle et le
cockpit se règlent geste par geste en 3 temps. Le mode caméra du téléphone est retiré de la
navigation (code conservé dans `client/src/camera/`, voir `docs/camera.md`).

## Prérequis et installation
- Node.js 22.12+ (ou 24+) et npm (workspaces : `shared`, `client`, `server`).
```
npm install
npx playwright install chromium   # pages protégées
```

## Lancement
```
npm run dev
```
- Client : https://localhost:5173 (Vite, certificat auto-signé à accepter ; si le port est pris, Vite prend le suivant).
- API : http://127.0.0.1:3001 (loopback uniquement ; `HOST` / `PORT` pour changer).
- Réseau local : `npm run dev:lan` expose le site en HTTPS ; l'API reste sur 127.0.0.1, atteinte
  via le proxy `/api` de Vite. Accepter le certificat auto-signé sur l'appareil.
- `ALLOWED_HOSTS=domaine1,domaine2` ajoute des marchands autorisés (voir `docs/scraping.md`).

## Tests
```
npm test          # vitest (moteur, modèles des guides, composants jsdom, caméra, serveur)
npm run typecheck # tsc sur tous les workspaces
npm run build
```
Les tests de composants sont les `*.dom.test.tsx` (en-tête `// @vitest-environment jsdom`) ; le
reste tourne en environnement node.

Avec `npm run dev` lancé, deux scripts Playwright (`SHOT_URL` change l'adresse) :
```
node scripts/shot.mjs   # captures dans scripts/shots/ (SHOT_ETATS=selle,cockpit pour filtrer)
node scripts/a11y.mjs   # axe-core : violations sérieuses/critiques, états clés à 390 et 1280 px
```

## Documentation
- [Architecture](docs/architecture.md) : monorepo, flux, contrats, sécurité, conventions.
- [Moteur de fitting](docs/fitting.md) : formules, taille, plages, valeurs calées.
- [Récupération des vélos](docs/scraping.md) : sécurité, cascade, cache, base locale.
- [Interface](docs/ui.md) : atelier, scène, guides, éclatés, thème, animations, accessibilité.
- [Mode caméra](docs/camera.md) : ArUco, précision, décisions ouvertes (hors navigation).

## Limites connues
- Les formules donnent un point de départ, pas un fitting professionnel ; plusieurs
  coefficients sont calés à la main (`docs/fitting.md`).
- Géométrie du Van Rysel GRVL AF non vérifiée : Décathlon bloque le scraping (403
  Cloudflare), la base locale vient d'un revendeur et d'estimations ; avertissements affichés.
- Caméra (retirée de la navigation) : précision réelle 7–15 mm, contre ±3 mm visé ; c'est une aide, pas une mesure.
