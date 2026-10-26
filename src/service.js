// -----------------------------------------------------------------------------
// The sync loop: read the portal, update Gladys.
//
// One refresh = one snapshot (src/inoe/snapshot.js), then:
//   - the devices, re-published only when their list changed (a child added);
//   - the states, through publishChangedStates (only what changed is sent);
//   - the transport badge of every device: cloud, or unreachable on failure;
//   - the scene events of what changed since the last read (src/inoe/changes.js);
//   - the connection status of the Configuration screen;
//   - a nudge to the dashboard widget.
//
// Refreshes never overlap: a refresh asked while one runs (the widget button,
// a scene, a configuration saved) waits for it and gets its result.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { missingSettings, normalizeConfig, parseDossierId } from './config.js';
import {
  buildDiscoveredDevices,
  buildStates,
  childDeviceId,
  deviceExternalIds,
} from './devices/index.js';
import { InoeClient } from './inoe/client.js';
import { detectChanges } from './inoe/changes.js';
import { readSnapshot } from './inoe/snapshot.js';
import { errorMessage, notConfiguredMessage } from './messages.js';
import { loadMemory as defaultLoadMemory, saveMemory as defaultSaveMemory } from './store.js';

const logger = createLogger({ name: 'service' });

// An unchanged value is still sent every 6 hours, so it stays recently dated
// in Gladys without spending the 300 states/minute of the host API.
const STATE_HEARTBEAT_MS = 6 * 60 * 60 * 1000;

export class Service {
  /**
   * @param {object} gladys the SDK client
   * @param {object} [options]
   * @param {(account: object) => InoeClient} [options.createClient]
   * @param {() => Promise<object|null>} [options.loadMemory]
   * @param {(memory: object) => Promise<void>} [options.saveMemory]
   * @param {() => Date} [options.now]
   * @param {() => void} [options.onRefreshed] called after every refresh (widget nudge)
   */
  constructor(gladys, options = {}) {
    this.gladys = gladys;
    this.createClient = options.createClient ?? ((account) => new InoeClient(account));
    this.loadMemory = options.loadMemory ?? (() => defaultLoadMemory());
    this.saveMemory = options.saveMemory ?? ((memory) => defaultSaveMemory(memory));
    this.now = options.now ?? (() => new Date());
    this.onRefreshed = options.onRefreshed ?? (() => {});
    this.config = normalizeConfig();
    this.client = null;
    this.accountKey = null;
    this.snapshot = null;
    this.memory = undefined;
    this.lastError = null;
    this.publishedDevices = null;
    this.running = null;
    this.timer = null;
  }

  /** Apply a configuration; a new account starts from a fresh session. */
  configure(rawConfig) {
    this.config = normalizeConfig(rawConfig);
    const account = {
      dossierId: parseDossierId(this.config.portal_url),
      username: this.config.username,
      password: this.config.password,
    };
    const key = JSON.stringify(account);
    if (key !== this.accountKey) {
      this.accountKey = key;
      this.client = missingSettings(this.config).length === 0 ? this.createClient(account) : null;
      this.snapshot = null;
      this.publishedDevices = null;
    }
  }

  /** Refresh now, unless a refresh is already running: then share its result. */
  refresh() {
    if (!this.running) {
      this.running = this.runRefresh().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  async runRefresh() {
    const missing = missingSettings(this.config);
    if (missing.length > 0 || !this.client) {
      this.lastError = null;
      await this.gladys.setConnectionStatus(false, notConfiguredMessage(missing));
      return null;
    }
    let snapshot;
    try {
      snapshot = await readSnapshot(this.client, this.config, this.now());
    } catch (err) {
      this.lastError = err;
      logger.error(`Refresh failed: ${err.message}`);
      // A failed read may be an expired cookie the portal answers oddly:
      // start the next attempt from a clean session.
      this.client.reset();
      await this.publishTransports(DEVICE_TRANSPORTS.UNREACHABLE);
      await this.gladys.setConnectionStatus(false, errorMessage(err));
      this.onRefreshed();
      throw err;
    }
    this.lastError = null;
    this.snapshot = snapshot;
    await this.publish(snapshot);
    await this.fireSceneEvents(snapshot);
    await this.gladys.setConnectionStatus(true);
    this.onRefreshed();
    return snapshot;
  }

  async publish(snapshot) {
    const devices = buildDiscoveredDevices(this.gladys, snapshot);
    const signature = JSON.stringify(devices);
    if (signature !== this.publishedDevices) {
      await this.gladys.publishDiscoveredDevices(devices);
      this.publishedDevices = signature;
    }
    await this.publishStates(snapshot);
    await this.publishTransports(DEVICE_TRANSPORTS.CLOUD);
  }

  async publishStates(snapshot = this.snapshot) {
    if (!snapshot) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(buildStates(this.gladys, snapshot), {
        heartbeat: STATE_HEARTBEAT_MS,
      });
    } catch (err) {
      // States of devices the user has not created yet may be refused: the
      // read itself worked, and onDeviceCreated publishes them again.
      logger.warn(`States not published: ${err.message}`);
    }
  }

  async publishTransports(transport) {
    const ids = deviceExternalIds(this.gladys, this.snapshot);
    if (ids.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(ids.map((external_id) => ({ external_id, transport })));
    } catch (err) {
      // A badge refused (devices not created yet) must not fail the refresh.
      logger.debug(`Transport badges not published: ${err.message}`);
    }
  }

  async fireSceneEvents(snapshot) {
    if (this.memory === undefined) {
      this.memory = await this.loadMemory();
    }
    const { events, memory } = detectChanges(this.memory, snapshot, this.config, (child) =>
      childDeviceId(this.gladys, snapshot, child),
    );
    for (const { key, data } of events) {
      try {
        await this.gladys.publishSceneEvent(key, data);
        logger.info(`Scene event ${key}`);
      } catch (err) {
        logger.warn(`Scene event ${key} refused: ${err.message}`);
      }
    }
    this.memory = memory;
    await this.saveMemory(memory);
  }

  /** Refresh on a timer, at the interval of the configuration. */
  start() {
    this.stop();
    // (Re)connected: Gladys may have restarted and lost the discovery list.
    this.publishedDevices = null;
    this.refresh().catch(() => {});
    this.timer = setInterval(
      () => this.refresh().catch(() => {}),
      this.config.refresh_minutes * 60 * 1000,
    );
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Re-publish what is known, without reading the portal (a scan request). */
  async republish() {
    if (this.snapshot) {
      this.publishedDevices = null;
      await this.publish(this.snapshot);
    }
  }

  /** The error message of the last refresh, or null when it worked. */
  lastErrorMessage() {
    return this.lastError ? errorMessage(this.lastError) : null;
  }
}
