# ALCA Prod

Application de planification de production pour Mécano Alca.

## Stack

- React + TypeScript + Vite
- Tailwind CSS v4
- Supabase (base de données + auth)
- Netlify (hébergement)

## Démarrage local

```bash
npm install
npm run dev
```

## Variables d'environnement

Créer un fichier `.env` à la racine :

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Déploiement

1. Créer le fichier `.env` avec les clés Supabase
2. `npm install`
3. `npm run dev` pour le développement
4. Connecter le repo à Netlify pour la production
