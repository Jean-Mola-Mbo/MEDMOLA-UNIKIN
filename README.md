# MEDMOLA UNIKIN

Plateforme d'étude en médecine : cours, quiz à deux niveaux, messagerie privée entre inscrits, salon général et espace d'administration.

Application **complète et fonctionnelle** : comptes (e-mail + téléphone), sessions, données persistées, messagerie réelle entre utilisateurs — pas une maquette.

---

## Lancer l'application

```bash
cd medmola-unikin
node server.js
```

Puis ouvrir **http://localhost:3000**

Aucune dépendance à installer : le serveur utilise uniquement Node.js (version 18 ou plus). La base est un fichier JSON créé automatiquement au premier démarrage (`data/db.json`).

### Compte administrateur

| | |
|---|---|
| Adresse | `admin@medmola.cd` |
| Téléphone | `+243000000000` |
| **Mot de passe** | **`molambojean2006@`** |

Ce compte est actif et **prêt à l'emploi** : la base livrée (`data/db.json`) le contient déjà, sans obligation de changement.

Pour le modifier à tout moment, sans interface :

```bash
node scripts/set-password.js admin@medmola.cd 'NouveauMotDePasse2026' admin
```

La commande fonctionne aussi pour n'importe quel étudiant (sans le dernier argument) : utile si quelqu'un perd l'accès et que l'e-mail n'est pas configuré. Les sessions ouvertes du compte sont fermées.

> Sur une installation **neuve** (base absente), le serveur crée `admin@medmola.cd` / `Medmola2026!` et impose son changement à la première connexion.

**Mot de passe perdu ?** Utilisez `node scripts/set-password.js <email> '<nouveau mot de passe>'` : aucune perte de données, aucune session à recréer pour les autres comptes. Ne supprimez `data/db.json` qu'en dernier recours — cela efface comptes étudiants, messages et progression.

---

## Ce que fait l'application

**Comptes et accès**
- Inscription obligatoire avec prénom, nom, **adresse e-mail** et **numéro de téléphone** (les deux sont vérifiés et uniques), faculté et promotion.
- Connexion par e-mail **ou** numéro de téléphone. Mot de passe haché avec `scrypt` + sel, sessions par cookie `HttpOnly`.
- Aucun cours, quiz, message ou chat n'est accessible sans compte (API protégée côté serveur).
- Limitation des tentatives de connexion, suspension de compte par l'admin.

**Cours**
- 14 cours, 700 fiches, lecteur avec sommaire par chapitre, navigation fiche par fiche, barre de progression, marquage automatique « lu », recherche de cours, raccourcis clavier `←` `→`.

**Quiz**
- Deux niveaux par cours : **élémentaire** (bases, définitions) et **approfondi** (mécanismes, raisonnement).
- Correction question par question avec explication, score sur 100, historique des tentatives conservé par étudiant.

**Messagerie privée**
- Annuaire des inscrits, recherche, conversation 1‑à‑1, messages en temps réel par interrogation périodique (3 s), compteur de non‑lus dans le menu.

**Chat général**
- Salon commun à tous les inscrits, affichage de l'auteur et du rôle, suppression de ses propres messages (l'admin peut supprimer n'importe lequel).

**Mot de passe oublié**
- Lien « Mot de passe oublié ? » sur l'écran de connexion → saisie de l'e-mail → envoi d'un lien valable **30 minutes, à usage unique**.
- Envoi réel par SMTP si configuré ; sinon le lien est écrit dans la console du serveur **et** l'administrateur peut le générer pour un étudiant depuis son espace (`/api/admin/users/:id/reset-link`).
- Réponse toujours identique, que le compte existe ou non : impossible de deviner qui est inscrit.

**Recherche et confort**
- Recherche plein texte dans les 700 fiches depuis la barre du haut, résultats groupés par cours avec extrait.
- Mode hors ligne (PWA) : l'application s'installe sur l'écran d'accueil et la coquille reste accessible sans réseau.
- Impression / export PDF de n'importe quelle fiche (`Imprimer`), mise en page dédiée.

**Administration**
- Statistiques (inscrits, actifs sur 24 h, fiches, messages, quiz passés).
- Publication et suppression d'**annonces** visibles sur le tableau de bord de tous.
- Liste complète des inscrits (e-mail, téléphone, promotion, fiches lues, dernière activité), suspension/réactivation.
- Modération du salon général.

---

## Contenu pédagogique — complet

Les **14 cours** du programme sont rédigés, soit **700 fiches** : 5 chapitres de 10 fiches par cours.

| Cours | Code | Fiches |
|---|---|---|
| Biologie animale | BIO 110 | 50 |
| Biologie végétale | BOT 110 | 50 |
| Anatomie générale | ANA 120 | 50 |
| Histologie générale et spéciale | HIS 130 | 50 |
| Cytologie | CYT 105 | 50 |
| Vaccinologie | VAC 320 | 50 |
| Santé publique | SPU 210 | 50 |
| Soins infirmiers | INF 210 | 50 |
| Maladies tropicales en RDC | MTR 340 | 50 |
| Anatomie tête et cou | ANA 230 | 50 |
| Appareil digestif | ANA 240 | 50 |
| Appareil urogénital | ANA 250 | 50 |
| Biochimie | BCH 120 | 50 |
| Biologie moléculaire | BCM 240 | 50 |

Chaque fiche comporte : **objectifs**, **corps de fiche** (2 paragraphes rédigés), **3 points clés**, **1 question de révision**. Chaque cours dispose d'un **quiz à deux niveaux** (8 questions élémentaires + 6 approfondies) avec correction expliquée.

Ces contenus sont des supports de révision pédagogiques. Ils ne remplacent ni les cours magistraux ni les protocoles nationaux (PNLP, PNLT, PCIME), à vérifier avant toute application clinique.

---

## Ajouter un cours

Créez un fichier `data/courses/15-mon-cours.json` :

```json
{
  "id": "mon-cours",
  "titre": "Mon cours",
  "code": "MED 300",
  "niveau": "L3",
  "credits": 4,
  "ordre": 15,
  "statut": "complet",
  "resume": "Une phrase de présentation.",
  "chapitres": [
    {
      "titre": "Chapitre 1 — Introduction",
      "fiches": [
        {
          "n": 1,
          "titre": "Titre de la fiche",
          "objectifs": ["Ce que l'étudiant doit savoir faire après la fiche."],
          "contenu": "<p>Premier paragraphe.</p><p>Deuxième paragraphe.</p>",
          "points": ["Point clé 1", "Point clé 2", "Point clé 3"],
          "question": "Question de révision ?"
        }
      ]
    }
  ]
}
```

Règles : `n` numérote les fiches de 1 à N sans trou ; `contenu` accepte du HTML simple (`<p>`, `<ul>`, `<strong>`, `<h3>`) ; `statut` vaut `"complet"` ou `"programme"` (dans ce cas, les chapitres n'ont qu'un champ `plan`). Redémarrez le serveur après ajout.

## Ajouter un quiz

Dans `data/quizzes.json`, sous la clé du cours :

```json
"mon-cours": {
  "elementaire": [
    { "q": "Question ?", "options": ["A", "B", "C", "D"], "reponse": 0,
      "explication": "Pourquoi cette réponse est correcte." }
  ],
  "approfondi": [ ]
}
```

`reponse` est l'index (0 à 3) de la bonne option. Les bonnes réponses ne sont jamais envoyées au navigateur avant validation : la correction est faite côté serveur.

---

## Structure du projet

```
medmola-unikin/
├── server.js              serveur HTTP + API + base JSON (aucune dépendance)
├── package.json
├── data/
│   ├── courses/           14 fichiers de cours
│   ├── quizzes.json       questions et corrections
│   └── db.json            base de données (créée au 1er lancement)
└── public/
    ├── index.html         coquille de l'application
    ├── styles.css         design complet
    └── app.js             routeur, vues, quiz, chat, admin
```

## API (résumé)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/register` · `/api/login` · `/api/logout` | Comptes et sessions |
| GET | `/api/me` · PATCH `/api/me` | Profil |
| GET | `/api/courses` · `/api/courses/:id` | Cours |
| POST | `/api/progress` | Marquer une fiche comme lue |
| GET | `/api/quiz` · `/api/quiz/:id?niveau=` | Quiz (sans les réponses) |
| POST | `/api/quiz/submit` | Correction et enregistrement du score |
| GET/POST | `/api/chat` · DELETE `/api/chat/:id` | Salon général |
| GET/POST | `/api/conversations` | Conversations privées |
| GET/POST | `/api/conversations/:id/messages` | Messages d'une conversation |
| GET | `/api/announcements` | Annonces |
| GET/POST | `/api/admin/*` | Statistiques, inscrits, annonces, suspension |

## Activer l'envoi d'e-mails

La réinitialisation fonctionne sans configuration (lien affiché dans la console et généré par l'admin), mais l'envoi automatique demande un compte SMTP :

```bash
export SMTP_HOST="smtp.gmail.com"
export SMTP_PORT="587"              # 465 pour TLS direct
export SMTP_USER="moncompte@gmail.com"
export SMTP_PASS="mot-de-passe-application"
export SMTP_FROM="MEDMOLA UNIKIN <moncompte@gmail.com>"
export APP_URL="https://medmola.cd"  # sert à construire le lien du message
node server.js
```

Avec Gmail, créez un **mot de passe d'application** (comptes Google → sécurité → validation en deux étapes), pas votre mot de passe habituel. Vérifiez l'envoi avec un compte de test, puis contrôlez que le message n'arrive pas en spam.

Sans ces variables, le serveur écrit `[LIEN DE RÉINITIALISATION] ...` dans la console : pratique en local, à ne pas laisser en production.

## Mettre en ligne

**Avec Docker** (recommandé : la base est persistée sur un volume) :

```bash
docker build -t medmola .
docker run -d -p 3000:3000 -v medmola-data:/app/data --name medmola medmola
```

**Sur un VPS ou un hébergeur Node** (Render, Railway, Fly.io, o2switch…) : commande `node server.js`,
port fourni par la variable `PORT`, et **un disque persistant monté sur `data/`** — sans ce volume,
la base est perdue à chaque déploiement.

Puis, dans tous les cas : nom de domaine, **HTTPS obligatoire** (Caddy ou Nginx + Let's Encrypt),
et une sauvegarde quotidienne de `data/db.json`.

## Sécurité et limites

- Mots de passe hachés (`scrypt`, sel unique), comparaison à temps constant, cookies `HttpOnly` + `SameSite=Lax`.
- Toutes les routes de contenu vérifient la session ; la modération vérifie le rôle.
- Les messages sont échappés côté client : pas d'injection HTML dans le chat.
- **Pour une mise en production** : placez l'application derrière HTTPS (reverse proxy Nginx/Caddy), changez le mot de passe admin, sauvegardez `data/db.json` régulièrement, et pour un usage à plus de quelques centaines d'utilisateurs, migrez la base vers PostgreSQL ou SQLite.
- Le temps réel utilise une interrogation toutes les 3 secondes : suffisant pour une promotion, à remplacer par WebSocket/SSE à plus grande échelle.

## Feuille de route

**Fait** : application complète · 14 cours · 700 fiches · 14 quiz · messagerie privée · chat général ·
espace admin · mot de passe provisoire bloquant · réinitialisation par e-mail · recherche globale ·
mode hors ligne · impression PDF · Docker · 110 tests automatisés.

**Reste à faire, dans l'ordre :**

1. **Ouvrir l'application et la tester à la main** (5 min) — le seul point que je n'ai pas pu vérifier, faute de navigateur ici.
2. **Configurer SMTP** (10 min) — sans cela, la réinitialisation passe par l'administrateur.
3. **Mettre en ligne** avec HTTPS et un volume persistant sur `data/`.
4. **Sauvegarde quotidienne** de `data/db.json`.
5. **Charte d'usage** publiée en annonce avant l'ouverture du chat.

Évolutions suivantes : vérification de l'adresse e-mail à l'inscription, notifications de messages,
export PDF de cours entiers, migration PostgreSQL au-delà de quelques centaines d'utilisateurs.

## Tests effectués

110 tests fonctionnels exécutés sur le serveur réel (`python3` + HTTP), tous réussis :

- inscription, doublons e-mail et téléphone, validation du numéro et du mot de passe ;
- connexion par e-mail et par téléphone, refus si mot de passe erroné ou compte suspendu ;
- accès aux cours refusé sans session ; 14 cours servis ; 700 fiches au total ; numérotation continue 1→50 par cours ; fiches réellement complètes (contenu, points clés, question) ;
- progression enregistrée et relue ;
- quiz : nombre de questions par niveau, réponses non divulguées, score 0 puis score maximal, explications ;
- chat : envoi, lecture, suppression par l'admin ;
- messagerie : création de conversation, message, compteur de non‑lus, remise à zéro à la lecture, cloisonnement entre comptes ;
- administration : statistiques, annonce visible par les étudiants, suspension et réactivation, refus d'accès aux non-admins ;
- première connexion admin : mot de passe provisoire signalé, **accès bloqué (428) avant changement**, mot de passe trop court refusé, changement effectif puis reconnexion ;
- réinitialisation : réponse générique anti-énumération, jeton invalide refusé, mot de passe trop court refusé, lien à usage unique (rejeu bloqué), ancien mot de passe invalidé, reconnexion réussie ;
- recherche globale (résultats + extraits), manifest PWA et service worker servis.

Non vérifié : rendu visuel réel (aucun navigateur disponible dans cet environnement d'exécution). Ouvrez la page une première fois pour contrôler l'affichage sur votre écran et sur mobile.
