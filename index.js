// -----------------------------------------------------------------------------
// Entry point of the iNoé Espace Famille integration.
//
// Role of this file: wire the SDK to the sync service (src/service.js). It
// holds NO portal logic. It only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. connects, then starts the refresh loop.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createSceneActions } from './src/capabilities/scenes.js';
import { FAMILY_WIDGET, SCENE_ACTIONS } from './src/capabilities/keys.js';
import { createWidgets, refreshWidget } from './src/capabilities/widget.js';
import { errorMessage, testReport } from './src/messages.js';
import { Service } from './src/service.js';

const gladys = new GladysIntegration();
const service = new Service(gladys, { onRefreshed: () => refreshWidget(gladys) });

// --- Discovery: Gladys asks for the list of devices --------------------------
// The devices come from the last read of the portal: re-publish them, and read
// the portal when nothing was read yet.
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing the devices');
  if (service.snapshot) {
    await service.republish();
  } else {
    await service.refresh().catch(() => {});
  }
});

// --- A device created from the Discovery tab ---------------------------------
// The SDK forgets the values remembered for it: publish them now rather than
// leave the new device empty until the next refresh.
gladys.onDeviceCreated(async () => {
  await service.publishStates();
});

// --- Manifest actions: buttons in the Configuration screen -------------------
gladys.onAction('test_connection', async () => {
  logger.info('Action test_connection');
  try {
    const snapshot = await service.refresh();
    return snapshot ? testReport(snapshot) : service.lastErrorMessage();
  } catch (err) {
    return errorMessage(err);
  }
});

// --- Scene actions (Gladys 5.1+) ---------------------------------------------
// Scene TRIGGERS need no handler: the sync loop fires them with
// publishSceneEvent from what changed between two reads.
const sceneActions = createSceneActions(service);
gladys.onSceneAction(SCENE_ACTIONS.REFRESH, sceneActions[SCENE_ACTIONS.REFRESH]);
gladys.onSceneAction(SCENE_ACTIONS.CHECK_BOOKING, sceneActions[SCENE_ACTIONS.CHECK_BOOKING]);

// --- Dashboard widget (Gladys 5.1+) ------------------------------------------
const widgets = createWidgets(service);
gladys.onWidgetGet(FAMILY_WIDGET, () => widgets[FAMILY_WIDGET].get());
gladys.onWidgetAction(FAMILY_WIDGET, (actionKey) => widgets[FAMILY_WIDGET].action(actionKey));

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  service.configure(newConfig);
  // Restart the loop: the interval may have changed, and a new account must
  // be read now rather than at the next tick.
  service.start();
});

// --- Connection lifecycle ----------------------------------------------------
// The SDK logs the WebSocket lifecycle itself (under `gladys-sdk`).
gladys.on('connected', async () => {
  try {
    service.configure(await gladys.getConfig());
    service.start();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
        de: 'Die Initialisierung ist fehlgeschlagen, sieh in den Protokollen der Integration nach.',
        es: 'La inicialización falló, consulte los registros de la integración.',
      })
      .catch(() => {});
  }
});

gladys.on('disconnected', () => {
  service.stop();
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  service.stop();
});

// An unexpected rejection is logged, never fatal: the next refresh retries.
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection', err);
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the iNoé Espace Famille integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
