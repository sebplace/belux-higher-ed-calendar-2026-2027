# Microsoft Belux — Event Calendar Higher Education 2026-2027

Calendrier public des événements Microsoft et partenaires destinés à l'enseignement
supérieur et à la recherche en Belgique et au Luxembourg.

**En ligne :** <https://sebplace.github.io/belux-higher-ed-calendar-2026-2027/>

Contacts : Jochem Claes (joclaes@microsoft.com) · Sébastien Place (splace@microsoft.com)

## Comment modifier le calendrier

**`events.json` est la source unique.** Ne modifiez jamais les cartes directement dans
`index.html` : elles sont régénérées et vos changements seraient écrasés.

```bash
# 1. modifier events.json
# 2. régénérer le site
node tools/build.mjs
# 3. vérifier le résultat dans un navigateur, puis publier
git add -A && git commit -m "..." && git push
```

La commande `build` régénère :

- le bloc de cartes et l'îlot de données dans `index.html` (entre les marqueurs
  `<!-- CARDS:START -->` et `<!-- DATA:START -->`) ;
- une page par événement dans `e/<id>.html`, avec ses propres balises Open Graph
  et des données structurées `schema.org/Event` ;
- un fichier `e/<id>.ics` par événement daté, en instants UTC calculés depuis
  `Europe/Brussels` (donc corrects de part et d'autre du changement d'heure) ;
- `sitemap.xml` et `robots.txt`.

## Champs d'un événement

| Champ | Rôle |
|---|---|
| `id` | Identifiant stable. Sert d'ancre (`#id`), de nom de page et d'UID iCalendar. **Ne jamais le renommer** : les liens partagés et les agendas s'appuient dessus. |
| `title` / `titleOfficial` | Titre court affiché sur la carte / titre exact de l'organisateur, utilisé dans l'invitation et le fichier `.ics`. |
| `track` | `General` ou `Research` (public visé). |
| `theme` | Clé du dictionnaire `themes` — pilote le filtre thématique. |
| `format` | `onsite` ou `online`. |
| `start` / `end` | Dates ISO. Pour un événement d'un seul jour, mettre la même valeur. |
| `timeStart` / `timeEnd` | Heures locales `HH:MM`, ou `null` si inconnues (l'événement devient alors « journée entière » dans le `.ics`). |
| `datePrecision` | `day`, `range` ou `month`. En `month`, aucun `.ics` n'est produit : on ne fabrique pas une date qui n'existe pas. |
| `provisional` | `true` marque la carte « Date provisoire » et le `.ics` en `STATUS:TENTATIVE`. |
| `registration` | `open`, `closed` ou `contact`. Pilote le libellé du bouton. |
| `url` | Page d'inscription, ou `mailto:` pour les événements sur contact. |
| `language` | `"en"` ou `null`. `null` affiche « À préciser ». |
| `verified` | Date du dernier contrôle sur la page officielle. |
| `venue` / `audience` / `benefit` | Textes `fr` / `nl` / `en`. `benefit` peut valoir `null`. |

**Règle éditoriale :** ce qui n'est pas vérifié reste `null` et s'affiche « À préciser ».
On ne complète pas un champ par déduction.

## Tests de non-régression

```bash
npm install      # une seule fois, installe playwright-core (pilote Microsoft Edge déjà présent)
node tools/check.mjs
```

Les contrôles couvrent la recherche sans accent et multi-mots, les filtres, l'état
dans l'URL, l'archivage automatique des événements passés, l'absence de débordement
horizontal de 320 à 1440 px, la conformité de l'impression à la sélection écran, la
validité des données structurées et l'absence d'erreur JavaScript.

## Vérification de fraîcheur

Les pages d'inscription changent sans préavis : un événement peut être déplacé, ou
ses inscriptions fermées. Le contrôle du 9 septembre 2026 avait révélé quatre écarts
sur treize événements.

Ces pages exigeant JavaScript, la vérification ne peut pas tourner dans une GitHub
Action : elle s'exécute depuis un poste, via une automatisation Scout qui compare
`events.json` aux pages officielles et signale les écarts. **Elle ne modifie jamais
le site** — toute correction passe par `events.json` puis `build`.

## Structure

```
index.html        page principale (coquille éditée à la main + blocs générés)
events.json       source unique des événements
assets/           images et favicon
e/                une page + un .ics par événement (généré)
tools/build.mjs   générateur
tools/check.mjs   tests de non-régression
```
