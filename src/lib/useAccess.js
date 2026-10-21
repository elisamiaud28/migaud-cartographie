import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Résout le profil d'accès de l'utilisateur connecté.
 * Un profil d'accès définit le périmètre visible (direction / agence / commercial).
 */
export default function useAccess() {
  const [state, setState] = useState({
    loading: true,
    user: null,
    access: null,
    suspended: false,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let user = null;
      try {
        user = await base44.auth.me();
      } catch (e) {
        user = null;
      }

      let access = null;
      if (user) {
        try {
          const rows = await base44.entities.AccessProfile.filter({ email: user.email });
          access = rows && rows.length ? rows[0] : null;
        } catch (e) {
          access = null;
        }
        if (!access && user.role === 'admin') {
          access = {
            id: null,
            email: user.email,
            full_name: user.full_name,
            profile_type: 'direction',
            scope: null,
          };
        }
      }

      let suspended = false;
      if (access && access.active === false) {
        suspended = true;
        access = null;
      }

      if (!cancelled) setState({ loading: false, user, access, suspended });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}