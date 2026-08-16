# Bancs Publics

Carte collaborative pour géolocaliser des bancs publics, en ajouter de nouveaux
(avec vérification photo par IA) et les noter (vue, poubelle à côté, ombre, confort, propreté).

## Lancer le site

```
cd BancsPublics
npm install      # déjà fait
npm start
```

Puis ouvre http://localhost:3000

## Comment ça marche

- Carte : Leaflet + tuiles OpenStreetMap (gratuit, pas de clé API — contrairement à Google Maps qui est payant au-delà d'un quota).
- Bancs existants : importés automatiquement depuis OpenStreetMap (Overpass API) à chaque déplacement de la carte. C'est la base de données mondiale de bancs déjà répertoriés — équivalent gratuit à Google Maps/Earth pour ce cas d'usage.
- Ajout par les utilisateurs : clic sur la carte + photo obligatoire. La photo passe dans un modèle de détection d'objets (TensorFlow.js + COCO-SSD, tourne dans le navigateur, gratuit) qui vérifie qu'il s'agit bien d'un banc avant l'envoi. Marqué "vérifié" ou "non vérifié" selon le résultat.
- Notation : vue, poubelle à proximité, ombre, confort, propreté, commentaire libre. Moyennes affichées sur chaque banc.
- Bannière publicitaire : en haut de page, prête à connecter à Google AdSense (remplacer le bloc `.ad-slot` dans `public/index.html` par le script AdSense une fois le compte créé — c'est le seul point à faire manuellement, AdSense nécessite une inscription).

## Stack

- Backend : Node/Express + SQLite (better-sqlite3) — aucune install de serveur DB requise, fichier unique `data/bancs.db`.
- Photos utilisateurs stockées dans `uploads/`.
- Frontend : HTML/CSS/JS vanilla + Leaflet + TensorFlow.js. Pas de build, pas de framework front.

## Limites connues / à faire évoluer si besoin

- Overpass API (service public gratuit d'OSM) peut parfois timeout sous charge — le site réessaie à chaque déplacement de carte, pas de perte de données.
- Détection IA "banc" = modèle générique COCO-SSD (classe "bench"), pas entraîné spécifiquement sur du mobilier urbain français — bon niveau de confiance mais pas parfait. Les bancs "non vérifiés" restent visibles sur la carte avec un badge distinct, à toi de modérer si besoin.
- Pas de compte utilisateur : les ajouts/notes sont anonymes pour l'instant (plus simple pour démarrer). Ajoutable plus tard si tu veux limiter le spam.
