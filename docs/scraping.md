# Récupération des vélos

Code : `server/src/lookup.ts`, `security.ts`, `parse.ts`, `chromium.ts`, `db.ts`. Route :
`POST /api/bike/lookup` avec l'URL du produit.

## Sécurité (`security.ts`)
- `assertAllowedUrl` s'exécute avant tout accès réseau ou cache : http(s) seulement, hôte dans
  la **liste blanche** (marchands : decathlon.*, vanrysel.com, canyon, trek, specialized…) ou
  l'un de ses sous-domaines. Autres domaines : erreur 400.
- `ALLOWED_HOSTS` (variable, domaines séparés par des virgules) complète la liste.
- Rejet des hôtes privés ou locaux : `localhost`, `*.local`, IPv4 privées/loopback/link-local,
  toute IPv6 littérale.
- Redirections (`server/src/safefetch.ts`) : suivies à la main, 3 au maximum, chaque `Location` est
  revalidée ; corps tronqué à 3 Mo, timeout global 15 s. Côté Chromium, `guardNavigation` bloque
  les navigations du document principal vers un hôte refusé (vérifié par typecheck seulement).

## Détection du style (`detectStyle`, `server/src/parse.ts`)
Texte normalisé (minuscules, sans accents), mots entiers uniquement. Sources par priorité :
**catégorie JSON-LD, fil d'Ariane, URL** d'abord ; le **nom du produit** ne tranche que si elles
sont muettes (il peut seulement préciser route → gravel). Les mots ambigus (« course », « trail »,
« aero », « xc ») ne comptent qu'en expression (« vélo de course », « trail bike », « aero road »).
Les modèles (Grizl, Topstone, Revolt… gravel ; Aeroad, Domane, Madone… route) sont en liste
explicite. Gravel l'emporte sur route ; indices contradictoires ou absents → « non détecté »
(le client demande le style). Ajouter un cas dans `parse.test.ts` à chaque nouveau faux positif.

## Cascade
1. **Cache disque** (`server/cache`), clé = sha256 de l'URL normalisée (sans ancre).
2. **fetch serveur** (user-agent navigateur), puis lecture de la page : **JSON-LD**
   (propriétés de taille) et **`__NEXT_DATA__`** (objets taille avec
   reach/stack…). On garde la source qui donne le plus de tailles.
3. **Chromium** (Playwright) si le fetch échoue ou ne donne rien : rendu complet, lecture des
   tableaux. Headless d'abord, fenêtre visible à profil persistant si bloqué.
4. **Base locale** `server/data/bikes.json`, retrouvée par identifiants produit dans l'URL ;
   les données web, si présentes, complètent la base.
5. **Saisie manuelle** côté client si rien ne marche (erreur 404 explicite).

Les réponses des étapes 2 et 3 sont mises en cache avec un champ `cacheVersion`
(`CACHE_VERSION` dans `server/src/lookup.ts`). Une entrée sans version ou d'une autre version
est ignorée et recalculée : incrémenter la constante dès que le contenu d'une réponse change.

Le **repli base dégradé** (étape 4, page
inaccessible) n'est **jamais mis en cache** : un retour du site est repris au prochain essai.

Sans base locale, une géométrie web n'est acceptée que si chaque taille a reach, stack,
angles et base arrière ; potence, cintre et manivelle sont alors remplis par défaut
(90 / 420 / 170 mm, 700c 28 mm) avec avertissements.

## Limites
- **Décathlon** : Cloudflare renvoie 403 aux requêtes automatiques (fetch et Chromium). Les
  vélos Décathlon passent donc par la base locale.
- **Van Rysel GRVL AF** : valeurs non vérifiées sur decathlon.fr (reach, stack, angles d'un
  revendeur ; empattements et tubes intermédiaires interpolés ; potence, entretoises, cintre
  estimés). Le champ `unverified` les remonte en `warnings` : à confirmer.

## Ajouter un vélo dans `server/data/bikes.json`
Tableau d'objets `Bike` (voir [architecture](architecture.md)) avec en plus :
- `id` et `productIds` (autres identifiants présents dans les URL) ;
- `sourceUrl`, `brand`, `model`, `wheel` (`bsd`, `tyreWidth`) ;
- `sizes[]` : `label`, plage de taille cycliste, `stack`, `reach`, angles, base arrière,
  empattement, chute de boîtier, fourche, composants d'origine ;
- `unverified` (facultatif) : phrases décrivant ce qui n'est pas confirmé.

Copier une entrée, remplacer les valeurs (mm, degrés), lister les identifiants de l'URL,
signaler les doutes dans `unverified`, relancer le serveur et tester. Supprimer le fichier de
`server/cache` correspondant si une ancienne réponse y est stockée.
