import { Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PROFILE_OPTIONS } from '@/components/access/AccessForm';

export default function AccessTable({ rows, agencies, sectors, onUpdate, onDelete }) {
  if (!rows.length) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Aucun accès attribué pour l'instant.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="hidden grid-cols-[1.4fr_1.2fr_1.3fr_auto_auto] gap-3 border-b border-border px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground md:grid">
        <span>Personne</span>
        <span>Profil</span>
        <span>Périmètre</span>
        <span>Actif</span>
        <span />
      </div>
      {rows.map((row) => {
        const options = row.profile_type === 'agence' ? agencies : sectors;
        return (
          <div
            key={row.id}
            className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[1.4fr_1.2fr_1.3fr_auto_auto] md:items-center"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.full_name || row.email}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{row.email}</p>
            </div>

            <Select
              value={row.profile_type}
              onValueChange={(v) => onUpdate(row, { profile_type: v, scope: v === 'direction' ? '' : row.scope })}
            >
              <SelectTrigger className="h-9 bg-background text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROFILE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {row.profile_type === 'direction' ? (
              <div className="flex h-9 items-center rounded-md border border-border px-3 text-xs text-muted-foreground">
                Territoire complet
              </div>
            ) : (
              <Select value={row.scope || ''} onValueChange={(v) => onUpdate(row, { scope: v })}>
                <SelectTrigger className="h-9 bg-background text-xs">
                  <SelectValue placeholder="À préciser" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={row.active !== false}
                onCheckedChange={(v) => onUpdate(row, { active: v })}
              />
              <span className="text-[11px] text-muted-foreground md:hidden">
                {row.active === false ? 'Suspendu' : 'Actif'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onDelete(row)}
              title="Supprimer cet accès"
              className="justify-self-start rounded-md border border-border p-2 text-muted-foreground transition-colors hover:border-destructive hover:text-destructive md:justify-self-center"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}