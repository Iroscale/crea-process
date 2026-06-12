# Guide de déploiement — vps.iroscale.com

Production via Vercel + DNS Hostinger + Supabase.

---

## ✅ État actuel

- **Repo GitHub Luxhorizon/crea-process** : à jour (commit `abf040d`)
- **Repo GitHub Iroscale/crea-process** : créé vide, push en attente
- **Compte Vercel** : `agence.iroscale@gmail.com`
- **Domaine cible** : `vps.iroscale.com` (sous-domaine de iroscale.com chez Hostinger)
- **Build prod local** : à vérifier (`npm run build`)

---

## 1. Pusher le code sur Iroscale (1 min)

Depuis **cmd.exe Windows** (pas bash) :

```cmd
cd C:\Users\Administrator\Crea_process
push-to-iroscale.cmd
```

Le script :
1. Vérifie le remote
2. Push vers `Iroscale/crea-process`
3. Te dit si la fenêtre auth doit s'ouvrir

Si la fenêtre browser s'ouvre → connecte-toi avec `agence.iroscale@gmail.com` (PAS Luxhorizon).

---

## 2. Importer le repo sur Vercel (5 min)

1. Aller sur **https://vercel.com/new** (loggué `agence.iroscale@gmail.com`)
2. Si `Iroscale/crea-process` n'apparaît pas → bouton **« Install GitHub »** → autorise Vercel à accéder à `Iroscale`
3. Clique **« Import »** sur `crea-process`
4. Page de config :
   - **Project Name** : `crea-process` (ou laisse défaut)
   - **Framework Preset** : Next.js (détecté auto)
   - **Root Directory** : `./` (défaut)
   - **Build Command / Output Directory / Install Command** : laisse vides
   - **Node.js Version** : 22.x (défaut Vercel)

---

## 3. Variables d'environnement Vercel (5 min)

Déplie **« Environment Variables »** sur la page de config.

### Astuce rapide : copier-coller en bloc

Sur Vercel, le champ « Paste .env » accepte du copier-coller en bloc. Récupère le contenu de ton `.env.local` côté serveur :

```bash
# Sur le serveur
cat C:\Users\Administrator\Crea_process\.env.local
```

Et colle dans le champ Vercel.

### Liste exacte des variables (au cas où)

| Variable | Obligatoire | Sert à |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Auth client |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Storage privé, admin |
| `ANTHROPIC_API_KEY` | ✅ | Claude (tous agents) |
| `OPENAI_API_KEY` | ⬜ | GPT-4o sur agents |
| `DEEPSEEK_API_KEY` | ⬜ | DeepSeek sur agents |
| `GEMINI_API_KEY` | ⬜ | Gemini (gen images) |
| `FAL_KEY` | ⬜ | fal.ai (gen images) |
| `DATABASE_URL` | ⬜ | Pas utilisé runtime |

---

## 4. Premier deploy (5 min d'attente)

Clique **`Deploy`** en bas. Vercel build le projet (3-5 min). À la fin tu auras :

```
https://crea-process-<random>.vercel.app
```

Vérifie déjà que la landing s'affiche.

---

## 5. Connecter vps.iroscale.com (5 min)

### Côté Vercel
1. Project → **Settings** → **Domains**
2. Champ **« Add »** → tape `vps.iroscale.com` → bouton Add
3. **Vercel te donne soit un CNAME, soit un A record** — note-le précisément

### Côté Hostinger
1. hPanel → ton domaine `iroscale.com` → **DNS / Nameservers**
2. **Supprime tout enregistrement `vps` existant** (qui pointait vers ton VPS si tu en avais un)
3. Bouton **« Add Record »** :
   - **Type** : `CNAME` (ou `A` selon ce que Vercel demande)
   - **Name** : `vps`
   - **Target / Value** : `cname.vercel-dns.com` (ou l'IP donnée par Vercel)
   - **TTL** : 3600 ou défaut
4. Save

**Propagation** : 5-30 min. Vérifie sur https://dnschecker.org → `vps.iroscale.com`.

Quand le DNS est propagé, Vercel provisionne automatiquement le **certificat SSL Let's Encrypt**. Tu verras « ✅ Valid Configuration ».

---

## 6. Supabase Auth pour autoriser l'URL prod (3 min)

**Indispensable** pour que le login fonctionne sur vps.iroscale.com.

1. https://supabase.com/dashboard → ton projet
2. **Authentication** → **URL Configuration**
3. **Site URL** : `https://vps.iroscale.com`
4. **Redirect URLs** : ajoute
   - `https://vps.iroscale.com/**`
   - Garde **`http://localhost:3000/**`** pour le dev local
5. **Save**

---

## 7. Tests end-to-end

Sur **https://vps.iroscale.com** :

- [ ] Landing s'affiche (« 🛰️ La base amirale »)
- [ ] Login fonctionne
- [ ] Cockpit chargé (clients, projets visibles)
- [ ] `/agency/new` : wizard ouvre + sauvegarde
- [ ] Lancer un agent (étape 01 par exemple) : appel Anthropic OK

---

## Dépannage

| Symptôme | Cause probable | Fix |
|---|---|---|
| Build Vercel échoue | Erreur TS / ESLint | Onglet Deployments → Build Logs → copier l'erreur, fix |
| 404 sur vps.iroscale.com | DNS pas propagé | Attendre 30 min, vérifier dnschecker.org |
| Erreur auth Supabase | URL pas autorisée | Étape 6 — Site URL + Redirect URLs |
| Agent plante en prod | API_KEY non set | Vercel → Settings → Environment Variables, redeploy |
| Vercel ne voit pas le repo | App GitHub pas installée sur Iroscale | « Adjust GitHub App Permissions » → autoriser |

---

## Auto-deploy

À chaque `git push origin main` ou `git push iroscale main` → Vercel re-déploie automatiquement la branche `main`. Tu n'as plus rien à faire après ce setup initial.
