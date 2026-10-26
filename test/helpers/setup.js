// -----------------------------------------------------------------------------
// A Service wired to the SDK's fake Gladys and to the fake iNoé portal, with
// an in-memory "memory file" and a fixed clock.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { InoeClient } from '../../src/inoe/client.js';
import { Service } from '../../src/service.js';
import { createFakeInoe, DOSSIER_ID, PASSWORD, USERNAME } from './fakeInoe.js';

// 09:00 in Paris on Monday 26 October 2026.
export const NOW = new Date('2026-10-26T08:00:00Z');

export const CONFIG = {
  portal_url: `https://espacefamille.aiga.fr/${DOSSIER_ID}`,
  username: USERNAME,
  password: PASSWORD,
};

export async function setup({ config = CONFIG, now = NOW, memory = null } = {}) {
  const inoe = createFakeInoe();
  const gladys = createFakeGladys({ config });
  await gladys.connect();
  const disk = { memory, saves: 0 };
  const clock = { now };
  const service = new Service(gladys, {
    createClient: (account) => new InoeClient(account, { fetch: inoe.fetch }),
    loadMemory: async () => disk.memory,
    saveMemory: async (saved) => {
      disk.memory = JSON.parse(JSON.stringify(saved));
      disk.saves += 1;
    },
    now: () => clock.now,
    onRefreshed: () => gladys.requestWidgetRefresh('family_space'),
  });
  service.configure(config);
  return { inoe, gladys, service, disk, clock };
}
