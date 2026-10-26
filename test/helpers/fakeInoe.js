// -----------------------------------------------------------------------------
// A fake iNoé portal: a `fetch` that answers like espacefamille.aiga.fr,
// inoe.aiga.fr and ism.aiga.fr, from data the test sets. No network.
//
// The answers follow the shapes of the portal's web application (prod.js,
// /version, infoDossierController, the ISM login and its cookies, the Ext
// stores `{ success, data }`).
// -----------------------------------------------------------------------------

export const BUILD = 'v5.75.1.prod.20261021.55688';
export const DOSSIER_ID = '11578177';
export const PASSWORD = 'S3cret-Pa55';
export const USERNAME = 'parent@example.fr';

export function createFakeInoe() {
  const fake = {
    build: BUILD,
    dossiers: { [DOSSIER_ID]: { code: 'demo', nomStructure: 'Ville de Démo' } },
    users: { [USERNAME]: PASSWORD },
    roles: ['ROLE_FAMILLE'],
    // Set to true to make ISM accept the password but set no cookie.
    noCookie: false,
    // Set to a URL to make the dossier endpoint answer 303 once.
    redirectDossierTo: null,
    maintenance: false,
    sessions: new Set(),
    logins: 0,
    calls: [],
    dashboard: {
      familleFacturesMontant: 42.5,
      familleDocumentsAttendus: 1,
      blocageImpaye: false,
      familleVO: {
        id: 900,
        nom: 'MARTIN',
        listeEnfants: [
          { id: 0, prenom: 'Ajouter une personne' },
          { id: 501, prenom: 'Léa', nom: 'MARTIN', parent: false },
          { id: 502, prenom: 'Tom', nom: 'MARTIN', parent: false },
          { id: 400, prenom: 'Julie', nom: 'MARTIN', parent: true },
        ],
      },
    },
    invoices: [
      {
        id: 7001,
        numero: 'F2026-0042',
        intitule: 'Restauration scolaire octobre',
        nomRupture: 'Régie périscolaire',
        montantFacture: '42,50',
        montantRegle: '0',
        solde: '42,50',
        reglerAvant: '2026-11-05',
      },
    ],
    news: [{ id: 31, titre: 'Fermeture le 11 novembre', date: '2026-10-20T08:00:00' }],
    // One row per slot, as the portal's calendar lists them.
    slots: Object.values(SLOTS).map(
      ([idActivite, plageFonctionnementId, tarifId, activity, slot]) => ({
        idActivite,
        plageFonctionnementId,
        tarifId,
        periodeIntitule: activity,
        abreviation: slot,
        intitule: `${activity} ${slot}`,
      }),
    ),
    // Events by child id: canteen on Monday, a full day of leisure centre on
    // Tuesday, an absence on Wednesday.
    events: {
      501: [
        event(1, '2026-10-26', 'cantine'),
        event(2, '2026-10-27', 'matin'),
        event(3, '2026-10-27', 'repas'),
        event(5, '2026-10-27', 'apresMidi'),
        {
          ...event(4, '2026-10-28', 'cantine'),
          nouvellePalette: { id: 2, intitule: 'Absence', presence: 'ABSENCE' },
        },
      ],
      502: [],
    },
    failPlanningOf: null,
  };

  fake.fetch = async (url, options = {}) => {
    const method = options.method ?? 'GET';
    const parsed = new URL(url);
    const headers = options.headers ?? {};
    fake.calls.push({ method, url, headers, body: options.body });
    if (fake.maintenance) {
      return reply(503, 'Maintenance');
    }

    if (parsed.host === 'espacefamille.aiga.fr' && parsed.pathname === '/prod.js') {
      return reply(
        200,
        "avialibleweburls.push('v5.74.0.prod.20260915.55231');\navialibleweburls.push('v5.75.1.prod.20261021.55688');\n",
      );
    }

    if (parsed.host === 'inoe.aiga.fr' && parsed.pathname.endsWith('/version')) {
      const dossier = parsed.searchParams.get('dossierID');
      return fake.dossiers[dossier] ? reply(200, JSON.stringify(fake.build)) : reply(404, '');
    }

    if (parsed.host === 'ism.aiga.fr' && parsed.pathname === '/login') {
      const { username, password } = JSON.parse(options.body);
      if (fake.users[username] !== password) {
        return reply(401, JSON.stringify({ error: 'Bad credentials' }));
      }
      fake.logins += 1;
      const session = `sess-${fake.logins}`;
      fake.sessions.add(session);
      // Like ISM: a token and cookies, no portal user (that comes from getSession).
      return reply(200, JSON.stringify({ token: 'jwt-not-a-user', expiresIn: 900 }), {
        'set-cookie': fake.noCookie
          ? []
          : [`SESSION=${session}; Domain=.aiga.fr; Path=/; Secure; HttpOnly`],
      });
    }

    const api = /^\/inoe\/inoe([^/]+)\/api\/EF\/([^/]+)\/(.+)$/.exec(parsed.pathname);
    if (parsed.host === 'espacefamille.aiga.fr' && api) {
      const [, build, dossierOrCode, path] = api;
      if (path === 'public/infoDossierController/dossier') {
        if (fake.redirectDossierTo) {
          const location = fake.redirectDossierTo;
          fake.redirectDossierTo = null;
          return reply(303, '', { location });
        }
        const dossier = fake.dossiers[dossierOrCode];
        if (!dossier) {
          return reply(404, '');
        }
        return reply(
          200,
          JSON.stringify({
            code: dossier.code,
            raisonSociale: 'Commune',
            infosGenerales: { nomStructure: dossier.nomStructure },
            build,
          }),
        );
      }
      const session = /SESSION=([^;]+)/.exec(headers.cookie ?? '')?.[1];
      const signedIn = Boolean(session && fake.sessions.has(session));
      if (path === 'loginController/getSession') {
        // Without a valid session the portal answers an anonymous user.
        return json({
          apiUser: signedIn
            ? { id: 42, login: USERNAME, roles: fake.roles }
            : { id: -1, roles: [] },
          loginAsToken: null,
        });
      }
      if (!signedIn) {
        return reply(401, '');
      }
      if (dossierOrCode !== 'DEMO') {
        return reply(404, '');
      }
      return route(path, parsed.searchParams);
    }
    return reply(404, '');
  };

  function route(path, query) {
    switch (path) {
      case 'tableaudebordController/infos/':
        return json({ success: true, data: [fake.dashboard] });
      case 'factureController/factures':
        // The real portal fails without the parameter its screen sends.
        if (query.get('panier') !== 'false') {
          return reply(500, 'panier');
        }
        return json({ success: true, data: fake.invoices, totalCount: fake.invoices.length });
      case 'public/filactuController/messages/':
        return json({ success: true, data: fake.news });
      case 'pointageANController/plageFonctionnements/':
        return json({ success: true, data: fake.slots });
      case 'pointageANController/events/': {
        const child = query.get('idIndividu');
        if (fake.failPlanningOf === child) {
          return reply(500, 'boom');
        }
        const from = query.get('dateDebut');
        const to = query.get('dateFin');
        const data = (fake.events[child] ?? []).filter(
          (item) => item.date.slice(0, 10) >= from && item.date.slice(0, 10) <= to,
        );
        return json({ success: true, data });
      }
      default:
        return reply(404, '');
    }
  }

  /** Make every session the portal gave so far expire. */
  fake.expireSessions = () => fake.sessions.clear();

  return fake;
}

// The rows of the fake planning: activity id, slot id, tariff id, activity
// name, slot name.
export const SLOTS = {
  cantine: [10, 100, 1000, 'Périscolaire', 'Cantine'],
  soir: [10, 101, 1001, 'Périscolaire', 'Garderie soir'],
  matin: [20, 200, 2000, 'Accueil de loisirs', 'Matin'],
  repas: [20, 201, 2001, 'Accueil de loisirs', 'Repas'],
  apresMidi: [20, 202, 2002, 'Accueil de loisirs', 'Après-midi'],
};

/** A booked event on one slot of SLOTS, shaped like PointageEventVO. */
export function event(id, day, slot) {
  const [idActivite, plageFonctionnementId, tarifId] = SLOTS[slot];
  return {
    id,
    idIndividu: 501,
    date: `${day}T00:00:00`,
    idActivite,
    plageFonctionnement_id: plageFonctionnementId,
    tarif_id: tarifId,
    checked: true,
    nouvellePalette: { id: 1, intitule: 'Réservation', presence: 'PRESENCE' },
  };
}

function json(body) {
  return reply(200, JSON.stringify(body));
}

// The subset of a fetch Response the client reads: status, ok, text() and the
// headers, Set-Cookie included (which a real `Response` built here would hide).
function reply(status, body, headers = {}) {
  const setCookies = headers['set-cookie'] ?? [];
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => String(body ?? ''),
    headers: {
      get: (name) => {
        const value = headers[name.toLowerCase()];
        return Array.isArray(value) ? value.join(', ') : (value ?? null);
      },
      getSetCookie: () => setCookies,
    },
  };
}
