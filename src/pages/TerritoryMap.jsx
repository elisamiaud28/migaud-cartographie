import { useEffect, useMemo, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import '@/styles/territory.css';
import { initTerritory } from '@/lib/territory/initTerritory';
import { loadTerritory } from '@/lib/territory/loadTerritory';
import { scopeTerritory } from '@/lib/territory/scopeTerritory';
import useAccess from '@/lib/useAccess';
import SessionBar, { accessLabel } from '@/components/SessionBar';
import NoAccess from '@/components/NoAccess';

export default function TerritoryMap() {
  const { loading: authLoading, user, access, suspended } = useAccess();
  const [territory, setTerritory] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTerritory()
      .then(setTerritory)
      .catch((e) => setError(e?.message || 'Chargement des données impossible.'));
  }, []);

  const needsScope =
    !!access && access.profile_type !== 'direction' && !access.scope;

  const scoped = useMemo(() => {
    if (!territory || !access || needsScope) return null;
    return scopeTerritory(territory, access);
  }, [territory, access, needsScope]);

  const isEmpty = !!scoped && scoped.data.features.length === 0;
  const isDirection = !!access && access.profile_type === 'direction';

  useEffect(() => {
    if (!scoped || isEmpty) return undefined;
    return initTerritory(scoped);
  }, [scoped, isEmpty]);

  if (!authLoading && (!access || needsScope)) {
    return (
      <NoAccess
        user={user}
        reason={
          needsScope
            ? "Votre profil est enregistré mais son périmètre n'est pas encore renseigné. La direction doit préciser votre agence ou votre secteur commercial."
            : undefined
        }
      />
    );
  }

  if (isEmpty) {
    return (
      <NoAccess
        user={user}
        reason={`Aucune commune n'est rattachée à votre périmètre (${accessLabel(
          access
        )}). Vérifiez le rattachement dans le fichier territorial ou contactez la direction.`}
      />
    );
  }

  return (
    <div className="territory-shell relative">
      <aside id="side">
        <div className="head">
          <SessionBar user={user} access={access} />
          <p className="eyebrow">Service &amp; Pièces MIGAUD</p>
          <h1>Carte des territoires</h1>
          {access && !isDirection && (
            <p className="mt-2 text-[11px] text-[color:var(--muted)]">
              Périmètre : <b className="text-[color:var(--text)]">{accessLabel(access)}</b>
            </p>
          )}
          <div className="modes">
            <button data-mode="agences" className="on" type="button">
              Par agence
            </button>
            <button data-mode="secteurs" type="button">
              Par commercial
            </button>
            <button data-mode="cps" type="button">
              Par CPS
            </button>
          </div>
          <div className="modes admin" id="adminModes" hidden>
            <button data-mode="flux" type="button">
              Flux réels
            </button>
            <button data-mode="ecart" type="button">
              Écarts
            </button>
          </div>
        </div>

        <div className="kpis">
          <div className="kpi">
            <b id="kCom">0</b>
            <span>communes</span>
          </div>
          <div className="kpi">
            <b id="kAg">0</b>
            <span id="kAgL">agences</span>
          </div>
          <div className="kpi">
            <b id="kDep">0</b>
            <span>dépts</span>
          </div>
          <div className="kpi">
            <b id="kSite">0</b>
            <span>sites</span>
          </div>
        </div>

        <div className="searchwrap">
          <input
            id="q"
            type="search"
            placeholder="Commune, code postal ou code INSEE"
            autoComplete="off"
            aria-label="Rechercher"
          />
          <p className="hint">Ex. « Vertou », « 85000 », « 79180 »</p>
          <ul id="results"></ul>
        </div>

        <div className="scroll">
          <div className="sectitle">
            <span id="listTitle">Agences</span>
            <button id="reset" type="button">
              Tout afficher
            </button>
          </div>
          <div id="legend" hidden></div>
          <div id="aglist"></div>
          <div className="notes" id="notes"></div>
          <div className="notes" id="adminStats" hidden></div>
        </div>

        <div id="detail"></div>

        <div className="foot">
          <button id="exp" type="button">
            Exporter la vue (CSV)
          </button>
          <button id="fit" type="button">
            Recadrer
          </button>
          {isDirection && (
            <button id="lock" type="button" title="Données de facturation">
              🔒
            </button>
          )}
        </div>
      </aside>

      <main>
        <button id="burger" type="button">
          Filtres
        </button>
        <div id="map"></div>
        <div className="mapctl">
          <div id="cpanel" hidden></div>
          <div className="seg">
            <button data-base="clair" className="on" type="button">
              Clair
            </button>
            <button data-base="plan" type="button">
              Plan
            </button>
            <button data-base="sat" type="button">
              Satellite
            </button>
            <button data-base="aucun" type="button">
              Sans fond
            </button>
          </div>
          <div className="seg">
            <button id="tSites" className="on" type="button">
              Sites MIGAUD
            </button>
            <button id="tLabels" className="on" type="button">
              Étiquettes
            </button>
            <button id="tConcur" type="button" hidden>
              Concurrents ▾
            </button>
          </div>
        </div>
      </main>

      <div id="gate" hidden>
        <div className="gatebox">
          <p className="eyebrow">Accès restreint</p>
          <h2>Données de facturation</h2>
          <p className="gtxt">
            Habitudes d'achat réelles des clients (SAV et magasin) croisées avec les secteurs
            théoriques. Chiffres internes — ne pas diffuser.
          </p>
          <input
            id="pwd"
            type="password"
            placeholder="Mot de passe"
            autoComplete="current-password"
          />
          <p id="gerr" className="gerr"></p>
          <div className="gbtns">
            <button id="gcancel" type="button">
              Annuler
            </button>
            <button id="gok" type="button" className="prim">
              Déverrouiller
            </button>
          </div>
        </div>
      </div>

      {(authLoading || (!scoped && !error)) && (
        <div className="pointer-events-none absolute inset-0 z-[900] flex items-center justify-center bg-[color:var(--ink)]/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--line)] border-t-[color:var(--accent-soft)]" />
            <p className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
              Chargement de la carte
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-[900] flex items-center justify-center bg-[color:var(--ink)]/90 p-6">
          <p className="max-w-sm text-center text-sm text-[color:var(--accent-soft)]">{error}</p>
        </div>
      )}
    </div>
  );
}