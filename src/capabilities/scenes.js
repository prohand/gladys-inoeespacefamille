// -----------------------------------------------------------------------------
// Scene actions (SDK v0.14+, Gladys 5.1+).
//
// A scene action is an OPERATION a scene author places in a scene. Each one
// is declared in the manifest `scene_actions` field and handled here, keyed
// by that same key; index.js registers every entry with
// `gladys.onSceneAction(key, ...)`.
//
//   - refresh        read the portal now; outputs the amount due and the
//                    number of invoices to pay, for a following condition;
//   - check_booking  is a child booked today / tomorrow, and on what. A child
//                    not booked is an OUTPUT (`booked: false`), not a
//                    failure: the scene author gates on it.
//
// Scene TRIGGERS are the other direction ("this happened"): they are fired by
// the sync loop from what changed between two reads (src/inoe/changes.js).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { findChild } from '../devices/index.js';
import { localDay } from '../inoe/parse.js';
import { CHECK_DAYS, SCENE_ACTIONS } from './keys.js';

const logger = createLogger({ name: 'scenes' });

/** The snapshot, read again when it dates from another day than today. */
async function currentSnapshot(service) {
  const today = localDay(service.now(), service.config.timezone);
  if (service.snapshot && service.snapshot.today === today) {
    return service.snapshot;
  }
  return service.refresh();
}

/**
 * The scene action handlers, keyed by manifest key.
 * @param {import('../service.js').Service} service
 */
export function createSceneActions(service) {
  return {
    async [SCENE_ACTIONS.REFRESH]() {
      logger.info('Scene action refresh');
      const snapshot = await service.refresh();
      if (!snapshot) {
        throw new Error('The integration is not configured yet');
      }
      return { amount_due: snapshot.amountDue, unpaid_invoices: snapshot.unpaidCount };
    },

    async [SCENE_ACTIONS.CHECK_BOOKING](fields) {
      logger.info(`Scene action check_booking <- ${fields.device} (${fields.day})`);
      const snapshot = await currentSnapshot(service);
      const child = findChild(service.gladys, snapshot, fields.device);
      if (!child) {
        // A device of the family account, or a child no longer listed.
        throw new Error('This device is not a child of the iNoé account');
      }
      const activities = fields.day === CHECK_DAYS.TOMORROW ? child.tomorrow : child.today;
      return { booked: activities.length > 0, activities: activities.join(', ') };
    },
  };
}
