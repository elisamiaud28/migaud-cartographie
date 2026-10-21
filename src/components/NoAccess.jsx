import { LogOut, ShieldAlert } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function NoAccess({ user, reason }) {
  return (
    <div className="territory-shell items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-[color:var(--line)] bg-[color:var(--panel)] p-7">
        <ShieldAlert className="h-7 w-7 text-[color:var(--accent-soft)]" />
        <h1 className="mt-4 font-heading text-2xl font-bold uppercase tracking-wide text-[color:var(--text)]">
          Accès non attribué
        </h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          {reason ||
            "Votre compte est bien reconnu, mais aucun périmètre ne vous a encore été attribué. La direction doit vous ouvrir un accès (agence ou secteur commercial)."}
        </p>
        {user && (
          <p className="mt-4 font-mono text-xs text-[color:var(--muted)]">{user.email}</p>
        )}
        <button
          type="button"
          onClick={() => base44.auth.logout()}
          className="mt-6 flex items-center gap-2 rounded-md border border-[color:var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--text)] transition-colors hover:border-[color:var(--accent)]"
        >
          <LogOut className="h-3.5 w-3.5" />
          Se déconnecter
        </button>
      </div>
    </div>
  );
}