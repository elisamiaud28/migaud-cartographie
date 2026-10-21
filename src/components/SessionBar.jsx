import { Link } from 'react-router-dom';
import { LogOut, Settings2, UserRound } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export const PROFILE_LABELS = {
  direction: 'Direction',
  agence: "Responsable d'agence",
  commercial: 'Commercial',
};

export function accessLabel(access) {
  if (!access) return 'Aucun accès';
  const base = PROFILE_LABELS[access.profile_type] || 'Consultation';
  return access.scope ? `${base} · ${access.scope}` : base;
}

export default function SessionBar({ user, access }) {
  if (!user) return null;
  const isDirection = access && access.profile_type === 'direction';

  return (
    <div className="mb-3 flex items-center justify-between gap-2 text-[11px]">
      <span className="flex min-w-0 items-center gap-1.5 text-[color:var(--muted)]">
        <UserRound className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{user.full_name || user.email}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {isDirection && (
          <Link
            to="/administration"
            title="Administration des accès"
            className="flex items-center gap-1 text-[color:var(--muted)] transition-colors hover:text-[color:var(--text)]"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span>Accès</span>
          </Link>
        )}
        <button
          type="button"
          title="Se déconnecter"
          onClick={() => base44.auth.logout()}
          className="flex items-center gap-1 text-[color:var(--muted)] transition-colors hover:text-[color:var(--text)]"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}