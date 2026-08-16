# cool-gpt

Harness de chat type GPT, local et moderne, avec **boucle agentique** : le modèle connecté via une clé API peut appeler des outils (recherche web, météo, Wikipédia, moteur Python avec graphiques animés, calcul, devise, heure, lecture de fichiers) avant de produire sa réponse finale, rendue en **Markdown complet** (maths KaTeX, code colorisé, tableaux).

![Démo cool-gpt](docs/demo.gif)

## Présentation du produit

cool-gpt est une interface de chat autonome (serveur Node + interface React) pensée pour :
- **se connecter à n'importe quel LLM** (OpenAI, Groq, Mistral, OpenRouter, Ollama local, Anthropic, endpoint compatible OpenAI) avec une simple clé API ;
- **orchestrer des outils** à travers une boucle agentique minimale : le modèle choisit les outils, leurs résultats lui sont renvoyés, et il répond en connaissance de cause ;
- **afficher des réponses riches** : Markdown, formules mathématiques LaTeX, blocs de code avec copie, et **graphiques interactifs animés** générés par le moteur Python ;
- **montrer le travail en transparence** : raisonnement streamé, cadre d'exécution des outils animé et repliable, citations, pièces jointes.

Aucun compte, aucune base de données : tout est local, la clé reste dans le navigateur.

## Fonctionnalités

### Modèles et configuration
- **8 fournisseurs** : OpenAI, Groq, Mistral, OpenRouter, Ollama (local), Anthropic, Personnalisé (compatible OpenAI), et **Mock** pour tout tester sans clé.
- **Changement de modèle directement dans le composeur** : liste du fournisseur courant, **actualisée automatiquement** (aucun rafraîchissement manuel).
- Réglages : clé API (stockée uniquement dans le navigateur), URL de base, température, prompt système, budget d'étapes.

### Boucle agentique adaptative
- Le modèle peut appeler les outils autant que nécessaire : le budget d'étapes **s'étend automatiquement** à chaque appel d'outils (+2, plafond de sécurité 50) — **aucune limite d'interruption** en pratique.
- Cadre « Exécution des outils » : regroupement unique, noms français explicites, animation d'exécution (icônes pulsantes, barre de progression, apparition en cascade), **repli automatique** dès la fin du travail, **factorisation dès 5 outils** (résumé condensé + liste défilante).

### Mode de raisonnement
- Réglage **arrêt / faible / moyen / élevé** dans le composeur, appliqué aux modèles de réflexion (o1/o3/o4/gpt-5, DeepSeek-R1, QwQ, GLM, Claude…).
- Le raisonnement est **streamé en direct dans le chat** avant la réponse, dans un panneau qui **se replie automatiquement** une fois la réflexion terminée (relisible au clic).

### Outils intégrés (aucune clé requise)
| Outil | Rôle |
|---|---|
| `web_search` | Recherche DuckDuckGo (réponse instantanée + résultats organiques) |
| `web_fetch` | Lecture du texte d'une page web |
| `get_weather` | Météo temps réel via Open-Meteo (géocodage + prévisions, libellés français) |
| `wikipedia_search` / `wikipedia_article` | Wikipédia en français |
| `run_python` | **Moteur Python** (répertoire temporaire, timeout 30 s) avec **moteur de visualisation** : un `plt.savefig('chart.png')` affiche le graphique, et un `chart.json` le rend interactif et animé |
| `calculate` | Évaluation mathématique (mathjs) |
| `convert_currency` | Taux de change (frankfurter.app) |
| `get_current_time` | Date et heure dans n'importe quel fuseau |

Toute tâche de calcul scientifique, de compréhension numérique, de production de graphique, d'analyse de données ou de modélisation est **routée automatiquement vers le moteur Python**.

### Graphiques animés dans le chat
- Rendu **Recharts** façon tableau de bord : tracés animés (900 ms), dégradés, tooltips, légende — types `line`, `bar`, `area`, `pie`, `scatter`.
- Contrat Python → chat : en plus de `plt.savefig('chart.png')`, le script peut écrire un fichier `chart.json` :

```json
{ "type": "line", "title": "Évolution comparée", "x": ["2021", "2022", "2023"],
  "series": [ { "name": "OpenAI Codex", "data": [1, 2, 3] },
              { "name": "Claude Code", "data": [0, 1, 4] } ] }
```

- Comparaisons **multi-séries sur le même graphique** prises en charge nativement.
- Repli : n'importe quel PNG produit par le script est capturé et affiché.

### Pièces jointes
- **PDF, Excel, CSV, TXT et tout format** (max 2 Mo/fichier, 4 fichiers/message) : le texte est extrait côté serveur (pdfjs pour les PDF, SheetJS pour les tableurs) et injecté dans la conversation.
- **Images** pour les modèles vision (contenu multimodal OpenAI / blocs Anthropic) ; si le modèle ne comprend pas les images, un **message d'erreur explicite invite à changer de modèle**.

### Rendu Markdown complet
Titres, listes, tableaux, citations, liens, code avec coloration syntaxique et bouton copier, **mathématiques LaTeX** (`$…$` en ligne, `$$…$$` en bloc, distinguées proprement du texte — un `500$/utilisateur` n'est pas interprété comme une formule), et réparation automatique de l'artefact « une lettre par ligne » produit par certains modèles.

### Interface
- Design inspiré du template Wix « Conseil en stratégie » : fond blanc, titres navy `#16163F` en Work Sans, accents violet `#9E3FFD`, corps en Avenir, variante sombre navy.
- **Thème clair par défaut**, bascule clair/sombre persistée.
- Conversations persistées dans le navigateur (localStorage), historique latéral, toasts, bannière d'erreur.
- Icônes SVG uniquement (aucune émoticône).

## Fonctionnement

### Architecture

```
cool-gpt/
├── server/   # API Express + boucle agentique + outils (TypeScript, port 8789)
└── web/      # Interface React 19 + Vite 7 + Tailwind v4 (port 5173, proxy /api → 8789)
```

### Boucle agentique

1. Le serveur enrichit les pièces jointes (extraction PDF/tableurs, contrôle vision) et transmet l'historique + les schémas d'outils au modèle.
2. Le modèle répond du texte → flux SSE `delta` jusqu'à `done` (avec éventuel `reasoning_*` préalable).
3. Le modèle demande des outils → exécution parallèle, résultats tronqués réinjectés, budget d'étapes étendu, nouvelle itération — chaque étape est visible dans l'interface.

### Événements SSE de `POST /api/chat`

`meta`, `step`, `reasoning_start` / `reasoning_delta` / `reasoning_end`, `tool_start`, `tool_end` (`summary`, `preview`, `chart` PNG, `chartData` interactif), `delta`, `done`, `error` — plus un battement de cœur toutes les 15 s.

### API

| Endpoint | Rôle |
|---|---|
| `GET /api/health` | État du serveur et détection de Python |
| `GET /api/tools` | Liste des outils (nom, description, icône, paramètres) |
| `POST /api/models` | Liste des modèles d'un fournisseur |
| `POST /api/chat` | Flux SSE de la conversation (config : `provider`, `apiKey`, `baseUrl`, `model`, `temperature`, `systemPrompt`, `maxSteps`, `reasoning`) |

### Détection automatique des capacités

- **Vision** : heuristique sur le couple fournisseur/modèle (gpt-4o, gpt-4.1, Claude, Gemini, Pixtral, LLaVA…) — les images ne sont envoyées qu'aux modèles compatibles.
- **Réflexion** : `reasoning_effort` (OpenAI) ou `thinking` + budget de tokens (Anthropic, avec préservation des signatures dans l'historique) uniquement pour les modèles de raisonnement.

## Démarrage rapide

Prérequis : Node.js ≥ 20, npm ≥ 10 (Python ≥ 3.10 optionnel, pour `run_python` ; matplotlib recommandé pour les graphiques statiques).

```bash
npm run install:all   # installe racine + server + web
npm run dev           # serveur sur :8789, interface sur :5173 (Vite prend le port suivant s'il est occupé)
```

Ouvrez l'URL affichée par Vite, puis dans **Paramètres** choisissez un fournisseur, collez votre clé API et votre modèle (liste auto-actualisée). Sans clé, le fournisseur **Mock** démontre toute la chaîne : raisonnement, outils, graphique animé, réponse Markdown.

## Sécurité

- La clé API est stockée **uniquement dans le navigateur** (localStorage) et transmise au serveur local à chaque requête ; jamais écrite sur disque côté serveur.
- `run_python` exécute le code demandé par le modèle : ne l'utilisez qu'avec des modèles de confiance, dans un environnement maîtrisé.
- Le serveur est prévu pour un usage **local** ; ne l'exposez pas directement sur Internet.

## Licence et crédits

Projet de démonstration personnel. Polices Avenir (auto-hébergées), Work Sans (OFL), JetBrains Mono (OFL) ; KaTeX, Recharts, Lucide, react-markdown ; données météo Open-Meteo, change frankfurter.app, encyclopédie Wikipédia.
