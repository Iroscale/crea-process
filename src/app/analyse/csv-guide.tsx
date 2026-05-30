/**
 * Mémo détaillé "comment exporter un CSV de campagne". Visible directement
 * sur /analyse pour que n'importe quel membre de l'équipe sache quoi faire
 * sans formation préalable.
 */
export default function CsvGuide() {
  return (
    <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">
          📋 Mémo — Comment exporter un CSV efficace
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
          À lire avant le 1<sup>er</sup> upload
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
        Plus le CSV est précis, plus l&apos;analyse Claude est riche. Suis ces
        5 étapes — au pire, ça te prend 10 min ; au mieux, ton équipe gagne
        des heures à chaque sprint.
      </p>

      {/* 5 steps overview */}
      <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Step n={1} title="Choisir la plateforme">
          Meta / TikTok / Google — chacune a son chemin d&apos;export, voir le
          détail en bas.
        </Step>
        <Step n={2} title="Sélectionner les colonnes">
          Personnalise les colonnes pour inclure copy, créa, KPIs et
          diagnostic. Save un preset pour réutiliser.
        </Step>
        <Step n={3} title="Filtrer la période">
          <b>30-90 jours</b> idéalement. Minimum 14 jours pour avoir un signal
          statistiquement utile. Niveau <b>Annonce</b>, pas Campaign.
        </Step>
        <Step n={4} title="Exporter en CSV UTF-8">
          Pas en Excel (.xlsx). Sans breakdown démographique fin (ça explose
          le fichier).
        </Step>
        <Step n={5} title="Uploader ici">
          Drag &amp; drop ou bouton dans le formulaire ci-dessus. Le système
          parse automatiquement et t&apos;envoie sur la page d&apos;analyse.
        </Step>
      </ol>

      {/* Required vs recommended columns */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ColumnCard
          tone="strict"
          title="Strict minimum"
          subtitle="Sans ça, le système ne peut rien faire"
          items={[
            "Nom de la publicité",
            "Nom de la campagne",
            "Nom de l'ensemble de pubs",
            "Impressions",
            "Clics sur le lien",
            "CTR (lien)",
            "Montant dépensé",
            "Devise",
            "Résultats (leads / conversions)",
            "Coût par résultat (CPL / CPA)",
          ]}
        />
        <ColumnCard
          tone="recommended"
          title="Fortement recommandé"
          subtitle="Là où ça devient une vraie analyse"
          items={[
            "Permalink de la publicité (vision créa)",
            "Texte principal / Body",
            "Titre / Headline",
            "Description",
            "Texte du bouton (CTA)",
            "URL de destination",
            "Classement qualité",
            "Classement engagement",
            "Classement taux de conversion",
            "Couverture · Fréquence",
            "Vues de page de destination",
          ]}
        />
        <ColumnCard
          tone="bonus"
          title="Bonus utile"
          subtitle="Si tu fais du vidéo + contexte"
          items={[
            "Vues de vidéo de 3 s (hook rate)",
            "ThruPlay / Vues complètes",
            "Taux de lecture moyen",
            "Taux d'achèvement du formulaire",
            "Format (single / carousel / video)",
            "Placement (feed / story / reels)",
            "Objectif de campagne",
            "Optimisation de la diffusion",
            "Date de début / fin du reporting",
          ]}
        />
      </div>

      {/* Per-platform deep dive */}
      <div className="mt-6 flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          Détail pas-à-pas par plateforme
        </h3>

        <PlatformGuide
          color="bg-blue-500/15 text-blue-300 border-blue-500/30"
          name="Meta Ads (Facebook + Instagram)"
          steps={[
            "Va sur Ads Manager → onglet Annonces (pas Campaigns ni Ad sets)",
            "Sélectionne tes campagnes leadgen actives sur 30-90 jours",
            "Click Colonnes → Personnaliser les colonnes",
            "Active toutes les colonnes des 3 colonnes de droite ci-dessus + le Permalink",
            "Save preset comme \"Crea Process — Leadgen\" pour réutiliser",
            "Click Exporter (icône en haut à droite) → Format CSV → Données affichées (pas tableau pivoté)",
          ]}
        />

        <PlatformGuide
          color="bg-pink-500/15 text-pink-300 border-pink-500/30"
          name="TikTok Ads"
          steps={[
            "Va sur TikTok Ads Manager → Reporting → Custom report",
            "Niveau de dimension : Ad",
            "Période : 30-90 jours",
            "Métriques : Impressions, Clicks (destination), CTR, Cost, CPC, Conversions, Cost per conversion, Video views, 6s focused video views, Average video play time",
            "Inclure les colonnes Ad name, Campaign name, Ad group name",
            "Exporter en CSV",
          ]}
        />

        <PlatformGuide
          color="bg-amber-500/15 text-amber-300 border-amber-500/30"
          name="Google Ads"
          steps={[
            "Va sur Google Ads → Annonces & extensions → niveau Annonce",
            "Personnalise les colonnes : Headline 1/2/3, Description 1/2, Final URL, Ad strength, Impressions, Clicks, CTR, Avg. CPC, Cost, Conversions, Cost / conv., Conv. rate",
            "Période : 30-90 jours",
            "Téléchargement → Format CSV (pas Excel)",
          ]}
        />
      </div>

      {/* Tips & gotchas */}
      <div className="mt-6 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs">
        <h3 className="text-sm font-semibold text-emerald-200">
          💡 Pro tips
        </h3>
        <ul className="mt-2 ml-4 list-disc space-y-1 text-[var(--color-foreground)]/90">
          <li>
            <b>Période</b> : 30-90 jours. Moins de 14 jours, le signal est
            trop faible. Plus de 90 jours, les versions de créa changent et tu
            mélanges des choses différentes.
          </li>
          <li>
            <b>Niveau d&apos;export</b> : toujours <b>Annonce</b>. Pas
            Campagne, pas Ensemble — sinon on perd la granularité par créa.
          </li>
          <li>
            <b>Permalink obligatoire</b> pour avoir la vision Claude qui
            analyse le visuel. Sans, on ne peut analyser que le copy.
          </li>
          <li>
            <b>Pas de breakdown démographique fin</b> (Age × Gender × Day) :
            le CSV explose, l&apos;ad_name est dupliqué N fois, le système
            agrège mais c&apos;est moins précis. Reste au max sur breakdown
            par placement.
          </li>
          <li>
            <b>Format CSV UTF-8</b>, jamais Excel (.xlsx). Si Excel ouvre ton
            CSV et le casse, force l&apos;encodage UTF-8 à la ré-export.
          </li>
          <li>
            <b>Plusieurs imports</b> : tu peux uploader plusieurs CSV
            (différentes plateformes, différentes périodes, différents
            comptes) — chacun reste un import séparé qu&apos;on peut analyser
            indépendamment.
          </li>
        </ul>
      </div>

      {/* Anti-patterns */}
      <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/5 p-4 text-xs">
        <h3 className="text-sm font-semibold text-red-200">❌ À éviter</h3>
        <ul className="mt-2 ml-4 list-disc space-y-1 text-[var(--color-foreground)]/90">
          <li>
            CSV de 1-2 jours seulement → pas de signal exploitable
          </li>
          <li>
            Niveau Campaign / Ad set au lieu d&apos;Ad → on ne peut pas
            comparer les créas individuellement
          </li>
          <li>
            Format Excel xlsx ou TSV → upload accepte mais parser plus fragile
          </li>
          <li>
            Breakdown par jour × heure × placement × age × gender → fichier
            géant et ad_name dupliqué N fois
          </li>
          <li>
            Pas de Permalink → analyse limitée au copy uniquement
          </li>
        </ul>
      </div>
    </section>
  );
}

// =============================================================================
// Subcomponents
// =============================================================================

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] font-bold text-[var(--color-primary-foreground)]">
          {n}
        </span>
        <span className="text-sm font-semibold text-[var(--color-foreground)]">
          {title}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
        {children}
      </p>
    </li>
  );
}

function ColumnCard({
  tone,
  title,
  subtitle,
  items,
}: {
  tone: "strict" | "recommended" | "bonus";
  title: string;
  subtitle: string;
  items: string[];
}) {
  const cls =
    tone === "strict"
      ? "border-red-500/30 bg-red-500/5"
      : tone === "recommended"
      ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5"
      : "border-emerald-500/30 bg-emerald-500/5";
  const dot =
    tone === "strict"
      ? "bg-red-400"
      : tone === "recommended"
      ? "bg-[var(--color-primary)]"
      : "bg-emerald-400";
  return (
    <div className={`rounded-lg border p-4 ${cls}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">
        {subtitle}
      </p>
      <ul className="mt-3 space-y-1 text-xs">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex items-start gap-1.5 text-[var(--color-foreground)]/90"
          >
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--color-muted-foreground)]" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlatformGuide({
  color,
  name,
  steps,
}: {
  color: string;
  name: string;
  steps: string[];
}) {
  return (
    <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 open:bg-[var(--color-background)]">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${color}`}
          >
            {name}
          </span>
          <span className="text-[10px] text-[var(--color-muted-foreground)]">
            Cliquer pour voir le pas-à-pas
          </span>
        </div>
      </summary>
      <ol className="mt-3 ml-5 list-decimal space-y-1.5 text-xs text-[var(--color-foreground)]/90">
        {steps.map((s, i) => (
          <li key={i} className="leading-relaxed">
            {s}
          </li>
        ))}
      </ol>
    </details>
  );
}
