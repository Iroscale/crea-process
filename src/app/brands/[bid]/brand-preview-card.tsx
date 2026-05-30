import Image from "next/image";

type Props = {
  name: string;
  description: string | null;
  mission: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  visual_principles: string | null;
  typography: string | null;
  primary_colors: string[];
  do_say: string[];
  dont_say: string[];
  landing_page_url: string | null;
  logoSignedUrl: string | null;
  logoIsSvg: boolean;
  logoLabel: string | null;
};

/**
 * Visual recap card of the brand — what the system "knows" about it.
 * Shown at the top of the brand edit page so the user can verify the DA
 * at a glance before scrolling to edit. Pure presentation (server component).
 */
export default function BrandPreviewCard(props: Props) {
  const {
    name,
    description,
    mission,
    target_audience,
    brand_voice,
    visual_principles,
    typography,
    primary_colors,
    do_say,
    dont_say,
    landing_page_url,
    logoSignedUrl,
    logoIsSvg,
    logoLabel,
  } = props;

  const isEmpty =
    !description &&
    !mission &&
    !target_audience &&
    !brand_voice &&
    !visual_principles &&
    !typography &&
    primary_colors.length === 0 &&
    do_say.length === 0 &&
    dont_say.length === 0 &&
    !logoSignedUrl;

  if (isEmpty) {
    return (
      <section className="mt-8 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
        Pas encore de DA — utilise le panel violet en haut pour scanner une
        landing page, ou remplis manuellement les champs ci-dessous.
      </section>
    );
  }

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]">
      {/* Top band — looks like a brand cover */}
      <div className="relative border-b border-[var(--color-border)] bg-gradient-to-br from-[var(--color-primary)]/10 via-[var(--color-card)] to-transparent p-6">
        <div className="flex flex-wrap items-start gap-5">
          {/* Logo block */}
          {logoSignedUrl && (
            <div className="shrink-0">
              <div className="flex h-20 w-32 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-border)] bg-white p-2">
                {logoIsSvg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoSignedUrl}
                    alt={logoLabel ?? "logo"}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <Image
                    src={logoSignedUrl}
                    alt={logoLabel ?? "logo"}
                    width={160}
                    height={80}
                    unoptimized
                    className="max-h-full max-w-full object-contain"
                  />
                )}
              </div>
              {logoLabel && (
                <div className="mt-1 text-center text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  {logoLabel}
                </div>
              )}
            </div>
          )}

          {/* Title + description */}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl font-semibold">{name}</h2>
              <span className="rounded-md bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-primary)]">
                Aperçu DA
              </span>
            </div>
            {description && (
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                {description}
              </p>
            )}
            {landing_page_url && (
              <a
                href={landing_page_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block break-all text-[10px] text-[var(--color-primary)] hover:underline"
              >
                Source : {landing_page_url}
              </a>
            )}
          </div>

          {/* Color palette */}
          {primary_colors.length > 0 && (
            <div className="shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Palette
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {primary_colors.map((c, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span
                      className="h-9 w-9 rounded-md border border-[var(--color-border)]"
                      style={{ background: c }}
                      title={c}
                    />
                    <span className="text-[9px] font-mono text-[var(--color-muted-foreground)]">
                      {c}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2-column body — DA fields + lists */}
      <div className="grid gap-5 p-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <PreviewBlock label="Mission" value={mission} />
          <PreviewBlock label="Audience cible" value={target_audience} />
          <PreviewBlock label="Tone of voice" value={brand_voice} />
        </div>
        <div className="flex flex-col gap-4">
          <PreviewBlock label="Principes visuels" value={visual_principles} />
          <PreviewBlock label="Typographie" value={typography} />
          <div className="grid grid-cols-2 gap-3">
            <ListBlock label="✓ À DIRE" items={do_say} variant="positive" />
            <ListBlock label="✗ À NE PAS DIRE" items={dont_say} variant="negative" />
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewBlock({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div
        className={`mt-1 text-sm leading-relaxed ${
          value
            ? "text-[var(--color-foreground)]"
            : "italic text-[var(--color-muted-foreground)]/60"
        }`}
      >
        {value || "Non défini"}
      </div>
    </div>
  );
}

function ListBlock({
  label,
  items,
  variant,
}: {
  label: string;
  items: string[];
  variant: "positive" | "negative";
}) {
  const tone =
    variant === "positive"
      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
      : "border-red-500/30 bg-red-500/5 text-red-200";
  return (
    <div className={`rounded-md border p-2 text-xs ${tone}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">
        {label}
      </div>
      {items.length === 0 ? (
        <div className="mt-1 italic opacity-60">Aucun</div>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {items.map((s, i) => (
            <li key={i} className="leading-snug">
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
