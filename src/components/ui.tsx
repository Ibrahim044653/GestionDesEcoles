import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Briques d'interface partagees.
 *
 * Composants serveur par defaut (aucun "use client") : ils ne contiennent
 * aucun etat. Les composants interactifs vivent dans src/components/client/.
 */

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Mise en page
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: { label: string; href?: string }[];
}) {
  return (
    <header className="mb-6">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Fil d'ariane" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {breadcrumb.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                {index > 0 && <span aria-hidden>/</span>}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-brand-700 hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-slate-700">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({
  children,
  className,
  title,
  description,
  actions,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className={cn("card", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="label-caps text-slate-500">{title}</h2>}
            {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 no-print">{actions}</div>}
        </div>
      )}
      <div className={cn(padded && "card-pad")}>{children}</div>
    </section>
  );
}

/**
 * Banniere sombre d'en-tete de page ("pulse" de la maquette) :
 * quelques chiffres cles et les actions principales.
 */
export function PulseBanner({
  eyebrow,
  chips,
  actions,
  updatedLabel,
}: {
  eyebrow: string;
  chips: { label: string; tone?: "default" | "alert" }[];
  actions?: ReactNode;
  updatedLabel?: string;
}) {
  return (
    <div className="mb-6 rounded-2xl bg-night-800 px-5 py-5 text-white sm:px-6">
      <p className="label-caps text-brand-200">{eyebrow}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <ul className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <li
              key={chip.label}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm",
                chip.tone === "alert"
                  ? "bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/40"
                  : "bg-white/10 text-slate-100",
              )}
            >
              {chip.label}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2.5 no-print">
          {updatedLabel && (
            <span className="label-caps text-slate-400">{updatedLabel}</span>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
}

const STAT_TONES = {
  mint: { card: "bg-mint-50 border-mint-200", label: "text-mint-700" },
  rose: { card: "bg-rose-50 border-rose-200", label: "text-rose-700" },
  sky: { card: "bg-sky-50 border-sky-200", label: "text-sky-700" },
  iris: { card: "bg-iris-50 border-iris-200", label: "text-iris-700" },
  slate: { card: "bg-white border-slate-200", label: "text-slate-500" },
} as const;

export type StatTone = keyof typeof STAT_TONES;

/** Carte d'indicateur : icone, libelle majuscule colore, valeur, precision. */
export function StatCard({
  label,
  value,
  hint,
  tone = "slate",
  icon,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
  icon?: ReactNode;
  href?: string;
}) {
  const palette = STAT_TONES[tone];

  const content = (
    <div className={cn("h-full rounded-2xl border p-5 transition-shadow", palette.card, href && "hover:shadow-md")}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-white/80 text-slate-600 shadow-sm">
          {icon ?? <DotIcon />}
        </span>
        <span className={cn("label-caps text-right", palette.label)}>{label}</span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 tabular">{value}</p>
      {hint && <p className="mt-2 text-sm leading-snug text-slate-600">{hint}</p>}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

/** Carte "objectif" : avancement sur une cible, barre de progression. */
export function GoalCard({
  title,
  status,
  statusTone = "neutral",
  caption,
  targetLabel,
  valueLabel,
  percent,
  barTone = "brand",
}: {
  title: string;
  status: string;
  statusTone?: "neutral" | "success" | "warning" | "danger";
  caption?: string;
  targetLabel: string;
  valueLabel: string;
  percent: number;
  barTone?: "brand" | "amber" | "rose";
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const barColor =
    barTone === "rose" ? "bg-rose-500" : barTone === "amber" ? "bg-amber-500" : "bg-brand-500";
  const badgeClass =
    statusTone === "success"
      ? "badge-success"
      : statusTone === "warning"
        ? "badge-warning"
        : statusTone === "danger"
          ? "badge-danger"
          : "badge-neutral";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className={cn(badgeClass, "shrink-0")}>{status}</span>
      </div>
      {caption && <p className="mt-1 text-xs text-slate-600">{caption}</p>}
      <div className="mt-4 flex items-center justify-between">
        <span className="label-caps text-slate-500">{targetLabel}</span>
        <span className="text-xs font-semibold text-slate-700 tabular">{valueLabel}</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${title} : ${valueLabel}`}
      >
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Etats
// ---------------------------------------------------------------------------

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-slate-400">{icon}</div>}
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1.5 max-w-md text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-mint-200 bg-mint-50 text-mint-700",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-rose-200 bg-rose-50 text-rose-900",
  }[tone];

  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm", styles)} role={tone === "danger" ? "alert" : "status"}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  children: ReactNode;
}) {
  const className = {
    neutral: "badge-neutral",
    success: "badge-success",
    warning: "badge-warning",
    danger: "badge-danger",
    info: "badge-info",
  }[tone];

  return <span className={className}>{children}</span>;
}

/** Couple libelle / valeur, pour les fiches de detail. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-slate-900">{children || "—"}</dd>
    </div>
  );
}

export function FieldGrid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const gridClass = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4", gridClass)}>{children}</dl>;
}

// ---------------------------------------------------------------------------
// Tableaux et pagination
// ---------------------------------------------------------------------------

export function DataTable({
  columns,
  children,
  caption,
}: {
  columns: { key: string; label: string; align?: "left" | "right" | "center"; className?: string }[];
  children: ReactNode;
  caption?: string;
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  column.align === "right" && "text-right",
                  column.align === "center" && "text-center",
                  column.className,
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  buildHref,
}: {
  page: number;
  pageCount: number;
  total: number;
  buildHref: (page: number) => string;
}) {
  if (pageCount <= 1) {
    return (
      <p className="px-1 pt-3 text-xs text-slate-500">
        {total} resultat{total > 1 ? "s" : ""}
      </p>
    );
  }

  const pages = buildPageList(page, pageCount);

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 pt-4" aria-label="Pagination">
      <p className="text-xs text-slate-500">
        Page {page} sur {pageCount} — {total} resultat{total > 1 ? "s" : ""}
      </p>
      <ul className="flex items-center gap-1">
        <li>
          {page > 1 ? (
            <Link href={buildHref(page - 1)} className="btn-secondary btn-sm" rel="prev">
              Precedent
            </Link>
          ) : (
            <span className="btn-secondary btn-sm opacity-50">Precedent</span>
          )}
        </li>
        {pages.map((entry, index) =>
          entry === "..." ? (
            <li key={`gap-${index}`} className="px-1.5 text-xs text-slate-400">
              …
            </li>
          ) : (
            <li key={entry}>
              <Link
                href={buildHref(entry)}
                aria-current={entry === page ? "page" : undefined}
                className={cn(
                  "btn-sm inline-flex min-w-8 justify-center rounded-lg border",
                  entry === page
                    ? "border-brand-600 bg-brand-600 font-semibold text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                {entry}
              </Link>
            </li>
          ),
        )}
        <li>
          {page < pageCount ? (
            <Link href={buildHref(page + 1)} className="btn-secondary btn-sm" rel="next">
              Suivant
            </Link>
          ) : (
            <span className="btn-secondary btn-sm opacity-50">Suivant</span>
          )}
        </li>
      </ul>
    </nav>
  );
}

function buildPageList(page: number, pageCount: number): (number | "...")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const pages: (number | "...")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);

  if (start > 2) pages.push("...");
  for (let index = start; index <= end; index += 1) pages.push(index);
  if (end < pageCount - 1) pages.push("...");
  pages.push(pageCount);

  return pages;
}

// ---------------------------------------------------------------------------
// Icones (SVG inline : aucune dependance, taille maitrisee)
// ---------------------------------------------------------------------------

type IconProps = { className?: string };

function icon(path: ReactNode) {
  return function Icon({ className = "size-[18px]" }: IconProps) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };
}

export const DotIcon = icon(<circle cx="12" cy="12" r="4" />);
export const HomeIcon = icon(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>);
export const UsersIcon = icon(<><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6" /><path d="M18 20a6 6 0 0 0-3-5.2" /></>);
export const SchoolIcon = icon(<><path d="M12 3 2 8l10 5 10-5-10-5Z" /><path d="M6 10.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-6.5" /></>);
export const WalletIcon = icon(<><rect x="2.5" y="6" width="19" height="13" rx="2.5" /><path d="M2.5 10h19" /><circle cx="17" cy="14.5" r="1.2" /></>);
export const ReceiptIcon = icon(<><path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21Z" /><path d="M9 8h6M9 12h6" /></>);
export const ChartIcon = icon(<><path d="M3 20h18" /><path d="M6 20V11M11 20V5M16 20v-6M21 20v-9" /></>);
export const BookIcon = icon(<><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5Z" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" /></>);
export const ClipboardIcon = icon(<><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="M9.5 10h5M9.5 14h5" /></>);
export const CalendarIcon = icon(<><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
export const SettingsIcon = icon(<><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" /></>);
export const BellIcon = icon(<><path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" /><path d="M10.5 19a2 2 0 0 0 3 0" /></>);
export const SearchIcon = icon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>);
export const PlusIcon = icon(<><path d="M12 5v14M5 12h14" /></>);
export const DownloadIcon = icon(<><path d="M12 3v12" /><path d="m7.5 11 4.5 4.5L16.5 11" /><path d="M4 20h16" /></>);
export const CheckIcon = icon(<path d="m5 13 4.5 4.5L19 7" />);
export const XIcon = icon(<><path d="M6 6l12 12M18 6 6 18" /></>);
export const AlertIcon = icon(<><path d="M12 3.5 2.5 20h19L12 3.5Z" /><path d="M12 10v4M12 17h.01" /></>);
export const ShieldIcon = icon(<><path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6L12 3Z" /><path d="m9 12 2 2 4-4" /></>);
export const BuildingIcon = icon(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>);
export const FileIcon = icon(<><path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M13 3v6h6" /></>);
export const LogoutIcon = icon(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 16 5-4-5-4" /><path d="M21 12H9" /></>);
export const TruckIcon = icon(<><path d="M2.5 6.5h11v10h-11z" /><path d="M13.5 10h4l3 3v3.5h-7Z" /><circle cx="6.5" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>);
