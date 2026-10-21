import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import useAccess from '@/lib/useAccess';
import NoAccess from '@/components/NoAccess';
import AccessForm from '@/components/access/AccessForm';
import AccessTable from '@/components/access/AccessTable';
import { useToast } from '@/components/ui/use-toast';

const LEGEND = [
  { title: 'Direction', text: 'Tout le territoire, données de facturation et administration des accès.' },
  { title: "Responsable d'agence", text: "Uniquement les communes rattachées à son agence." },
  { title: 'Commercial', text: 'Uniquement les communes de son secteur.' },
];

export default function Administration() {
  const { loading, user, access } = useAccess();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [busy, setBusy] = useState(false);

  const isDirection = !!access && access.profile_type === 'direction';

  const refresh = useCallback(async () => {
    const list = await base44.entities.AccessProfile.list('-created_date');
    setRows(list);
  }, []);

  useEffect(() => {
    if (!isDirection) return;
    refresh();
    fetch(`${import.meta.env.BASE_URL}data/meta.json`)
      .then((r) => r.json())
      .then((meta) => {
        const keep = (k) => k !== 'Hors périmètre';
        setAgencies(Object.keys(meta.agences).filter(keep).sort((a, b) => a.localeCompare(b, 'fr')));
        setSectors(Object.keys(meta.secteurs).filter(keep).sort((a, b) => a.localeCompare(b, 'fr')));
      })
      .catch(() => {});
  }, [isDirection, refresh]);

  const syncRole = async (email, profileType) => {
    const role = profileType === 'direction' ? 'admin' : 'user';
    const users = await base44.entities.User.list();
    const existing = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (existing) {
      if (existing.role !== role) await base44.entities.User.update(existing.id, { role });
    } else {
      await base44.users.inviteUser(email, role);
    }
  };

  const handleCreate = async (payload) => {
    setBusy(true);
    try {
      await syncRole(payload.email, payload.profile_type);
      await base44.entities.AccessProfile.create({ ...payload, active: true });
      await refresh();
      toast({ title: 'Accès créé', description: `${payload.email} — ${payload.profile_type}` });
    } catch (e) {
      toast({
        title: "Création impossible",
        description: e?.message || 'Vérifiez l’adresse e-mail.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (row, patch) => {
    try {
      await base44.entities.AccessProfile.update(row.id, patch);
      if (patch.profile_type) await syncRole(row.email, patch.profile_type);
      await refresh();
    } catch (e) {
      toast({ title: 'Modification impossible', description: e?.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (row) => {
    try {
      await base44.entities.AccessProfile.delete(row.id);
      const users = await base44.entities.User.list();
      const existing = users.find((u) => (u.email || '').toLowerCase() === row.email.toLowerCase());
      if (existing && existing.role === 'admin' && row.email !== user?.email) {
        await base44.entities.User.update(existing.id, { role: 'user' });
      }
      await refresh();
      toast({ title: 'Accès supprimé', description: row.email });
    } catch (e) {
      toast({ title: 'Suppression impossible', description: e?.message, variant: 'destructive' });
    }
  };

  if (!loading && !isDirection) {
    return (
      <NoAccess
        user={user}
        reason="Cet espace est réservé au profil Direction. Votre accès vous ouvre la carte, limitée à votre périmètre."
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary">
              Service &amp; Pièces MIGAUD
            </p>
            <h1 className="font-heading text-2xl font-bold uppercase tracking-wide">
              Accès &amp; profils
            </h1>
          </div>
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Carte
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-5 py-7">
        <div className="grid gap-3 sm:grid-cols-3">
          {LEGEND.map((l) => (
            <div key={l.title} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <p className="font-heading text-sm font-bold uppercase tracking-wide">{l.title}</p>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{l.text}</p>
            </div>
          ))}
        </div>

        <AccessForm
          agencies={agencies}
          sectors={sectors}
          onCreate={handleCreate}
          busy={busy}
        />

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-lg font-bold uppercase tracking-wide">
              Accès attribués
            </h2>
            <span className="text-xs text-muted-foreground">{rows.length} compte(s)</span>
          </div>
          <AccessTable
            rows={rows}
            agencies={agencies}
            sectors={sectors}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        </section>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Un compte sans accès attribué ne voit pas la carte : attribuez-lui un profil et un
          périmètre. Un profil Direction dispose aussi de l'administration des comptes ; les
          profils agence et commercial restent en lecture.
        </p>
      </div>
    </div>
  );
}