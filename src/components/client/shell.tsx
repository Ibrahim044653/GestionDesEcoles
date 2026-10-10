"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  SearchIcon,
  BellIcon,
  PlusIcon,
  LogoutIcon,
  cn,
} from "@/components/ui";

/**
 * Enveloppe interactive de l'application : barre superieure, navigation
 * laterale filtrable, selecteur d'etablissement.
 *
 * La navigation n'affiche que les entrees autorisees, mais ce filtrage est
 * purement ergonomique : chaque page refait le controle de permission cote
 * serveur (voir src/lib/auth/guard.ts).
 */

export type NavEntry = {
  href: string;
  label: string;
  icon: string;
  section: string;
  badge?: number;
};

export type ShellUser = {
  fullName: string;
  initials: string;
  roleName: string;
  email: string;
};

export type ShellSchool = {
  id: string;
  name: string;
  code: string;
};

export function AppShell({
  user,
  school,
  availableSchools,
  navigation,
  unreadNotifications,
  children,
  switchSchoolAction,
  logoutAction,
}: {
  user: ShellUser;
  school: ShellSchool | null;
  availableSchools: ShellSchool[];
  navigation: NavEntry[];
  unreadNotifications: number;
  children: React.ReactNode;
  switchSchoolAction: (formData: FormData) => void;
  logoutAction: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const pathname = usePathname();

  const sections = useMemo(() => {
    const normalized = filter
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

    const visible = normalized
      ? navigation.filter((entry) =>
          entry.label
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .includes(normalized),
        )
      : navigation;

    const grouped = new Map<string, NavEntry[]>();
    for (const entry of visible) {
      const list = grouped.get(entry.section) ?? [];
      list.push(entry);
      grouped.set(entry.section, list);
    }
    return Array.from(grouped.entries());
  }, [navigation, filter]);

  return (
    <div className="min-h-screen bg-[#f6f8f9]">
      <a href="#contenu" className="sr-only-focusable btn-primary absolute left-4 top-4 z-50">
        Aller au contenu principal
      </a>

      {/* ----------------------------- Barre superieure ----------------------------- */}
      <header className="sticky top-0 z-40 bg-brand-800 text-white no-print">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded-lg p-2 text-brand-100 hover:bg-white/10 lg:hidden"
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menuOpen}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>

          <Link href="/tableau-de-bord" className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-sm font-bold text-brand-700">
              GE
            </span>
            <span className="truncate text-sm font-semibold sm:text-base">
              {school?.name ?? "Gestion Ecole"}
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
            <GlobalSearch />

            <Link
              href="/notifications"
              className="relative rounded-lg p-2 text-brand-100 hover:bg-white/10"
              aria-label={`Notifications${unreadNotifications > 0 ? ` (${unreadNotifications} non lues)` : ""}`}
            >
              <BellIcon className="size-5" />
              {unreadNotifications > 0 && (
                <span className="absolute right-1 top-1 flex size-2 rounded-full bg-amber-400" />
              )}
            </Link>

            {availableSchools.length > 1 && (
              <SchoolSwitcher
                current={school}
                schools={availableSchools}
                action={switchSchoolAction}
              />
            )}

            <UserMenu user={user} logoutAction={logoutAction} />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* ------------------------- Navigation laterale ------------------------- */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 top-14 z-30 w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-3 pb-8 pt-3 no-print",
            "transition-transform lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0",
            menuOpen ? "translate-x-0" : "-translate-x-full",
          )}
          aria-label="Navigation principale"
        >
          <div className="relative mb-2">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filtrer le menu"
              aria-label="Filtrer le menu"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-sm
                         placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none"
            />
          </div>

          <nav>
            {sections.map(([section, entries]) => (
              <div key={section}>
                <p className="nav-section">{section}</p>
                <ul className="space-y-0.5">
                  {entries.map((entry) => {
                    const active =
                      pathname === entry.href ||
                      (entry.href !== "/tableau-de-bord" && pathname.startsWith(`${entry.href}/`));

                    return (
                      <li key={entry.href}>
                        <Link
                          href={entry.href}
                          onClick={() => setMenuOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn("nav-item", active && "nav-item-active")}
                        >
                          <NavIcon name={entry.icon} />
                          <span className="truncate">{entry.label}</span>
                          {entry.badge !== undefined && entry.badge > 0 && (
                            <span className="ml-auto rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                              {entry.badge > 99 ? "99+" : entry.badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {sections.length === 0 && (
              <p className="px-3 py-6 text-sm text-slate-500">Aucune entree ne correspond.</p>
            )}
          </nav>
        </aside>

        {menuOpen && (
          <button
            type="button"
            className="fixed inset-0 top-14 z-20 bg-slate-900/40 lg:hidden"
            onClick={() => setMenuOpen(false)}
            aria-label="Fermer le menu"
          />
        )}

        {/* ------------------------------ Contenu ------------------------------ */}
        <main id="contenu" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) router.push(`/eleves?q=${encodeURIComponent(value.trim())}`);
      }}
      className="hidden sm:block"
    >
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-200" />
        <input
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Rechercher un eleve, un matricule…"
          aria-label="Rechercher un eleve"
          className="w-56 rounded-full border border-white/15 bg-white/10 py-1.5 pl-9 pr-3 text-sm text-white
                     placeholder:text-brand-200 focus:w-72 focus:border-white/30 focus:bg-white/15
                     focus:outline-none md:w-72 md:focus:w-96"
        />
      </div>
    </form>
  );
}

function SchoolSwitcher({
  current,
  schools,
  action,
}: {
  current: ShellSchool | null;
  schools: ShellSchool[];
  action: (formData: FormData) => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => startTransition(() => action(formData))}
      className="hidden md:block"
    >
      <label htmlFor="school-switcher" className="sr-only">
        Changer d'etablissement
      </label>
      <select
        id="school-switcher"
        name="schoolId"
        defaultValue={current?.id ?? ""}
        disabled={pending}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="max-w-48 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-sm text-white
                   focus:border-white/30 focus:outline-none disabled:opacity-60"
      >
        {schools.map((school) => (
          <option key={school.id} value={school.id} className="text-slate-900">
            {school.name}
          </option>
        ))}
      </select>
    </form>
  );
}

function UserMenu({ user, logoutAction }: { user: ShellUser; logoutAction: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-white/10"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
          {user.initials}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium lg:block">{user.fullName}</span>
        <svg viewBox="0 0 24 24" className="size-4 text-brand-200" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-hidden
            tabIndex={-1}
          />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-1.5 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-slate-700 shadow-lg"
          >
            <div className="border-b border-slate-100 px-3.5 py-2.5">
              <p className="truncate text-sm font-semibold text-slate-900">{user.fullName}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
              <p className="mt-1 inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                {user.roleName}
              </p>
            </div>
            <Link
              href="/mon-compte"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2 text-sm hover:bg-slate-50"
            >
              Mon compte et securite
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
              >
                <LogoutIcon className="size-4" />
                Se deconnecter
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

/** Resolution du nom d'icone transmis par le serveur. */
function NavIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
    users: <><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6" /><path d="M18 20a6 6 0 0 0-3-5.2" /></>,
    school: <><path d="M12 3 2 8l10 5 10-5-10-5Z" /><path d="M6 10.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-6.5" /></>,
    wallet: <><rect x="2.5" y="6" width="19" height="13" rx="2.5" /><path d="M2.5 10h19" /><circle cx="17" cy="14.5" r="1.2" /></>,
    receipt: <><path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21Z" /><path d="M9 8h6M9 12h6" /></>,
    chart: <><path d="M3 20h18" /><path d="M6 20V11M11 20V5M16 20v-6M21 20v-9" /></>,
    book: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5Z" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" /></>,
    clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="M9.5 10h5M9.5 14h5" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    settings: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" /></>,
    shield: <><path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6L12 3Z" /><path d="m9 12 2 2 4-4" /></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>,
    file: <><path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M13 3v6h6" /></>,
    bell: <><path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" /><path d="M10.5 19a2 2 0 0 0 3 0" /></>,
    truck: <><path d="M2.5 6.5h11v10h-11z" /><path d="M13.5 10h4l3 3v3.5h-7Z" /><circle cx="6.5" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>,
  };

  return (
    <svg
      className="size-[18px] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? <circle cx="12" cy="12" r="4" />}
    </svg>
  );
}
