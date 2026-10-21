import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const PROFILE_OPTIONS = [
  { value: 'direction', label: 'Direction — tout voir + administrer' },
  { value: 'agence', label: "Responsable d'agence — sa zone" },
  { value: 'commercial', label: 'Commercial — son secteur seul' },
];

export default function AccessForm({ agencies, sectors, onCreate, busy }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [profileType, setProfileType] = useState('commercial');
  const [scope, setScope] = useState('');

  const scopeOptions = profileType === 'agence' ? agencies : sectors;
  const needsScope = profileType !== 'direction';

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (needsScope && !scope) return;
    await onCreate({
      email: email.trim().toLowerCase(),
      full_name: fullName.trim(),
      profile_type: profileType,
      scope: needsScope ? scope : '',
    });
    setEmail('');
    setFullName('');
    setScope('');
    setProfileType('commercial');
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-card p-5">
      <h2 className="font-heading text-lg font-bold uppercase tracking-wide">
        Attribuer un accès
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        La personne reçoit une invitation par e-mail pour créer son mot de passe, puis n'accède
        qu'à son périmètre.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="new-email" className="text-xs uppercase tracking-wider text-muted-foreground">
            E-mail
          </Label>
          <Input
            id="new-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom.nom@migaud.fr"
            className="bg-background"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="new-name" className="text-xs uppercase tracking-wider text-muted-foreground">
            Nom
          </Label>
          <Input
            id="new-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Prénom Nom"
            className="bg-background"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Profil</Label>
          <Select
            value={profileType}
            onValueChange={(v) => {
              setProfileType(v);
              setScope('');
            }}
          >
            <SelectTrigger className="bg-background">
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
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            {profileType === 'agence' ? 'Agence' : 'Secteur commercial'}
          </Label>
          {needsScope ? (
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Choisir…" />
              </SelectTrigger>
              <SelectContent>
                {scopeOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex h-9 items-center rounded-md border border-border px-3 text-xs text-muted-foreground">
              Territoire complet
            </div>
          )}
        </div>
      </div>

      <Button type="submit" disabled={busy} className="mt-4 gap-2">
        <UserPlus className="h-4 w-4" />
        Créer l'accès
      </Button>
    </form>
  );
}