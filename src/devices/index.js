// -----------------------------------------------------------------------------
// Device registry.
//
// The devices follow the account: one "family" device, plus one device per
// child the portal lists. They are built from the last snapshot (see
// src/inoe/snapshot.js), so a child added by the structure shows up in the
// Discovery tab at the next refresh.
// -----------------------------------------------------------------------------

import { buildChildDevice, childIds, childStates } from './child.js';
import { buildFamilyDevice, familyIds, familyStates } from './family.js';

/** The discovery payload: nothing before the first successful read. */
export function buildDiscoveredDevices(gladys, snapshot) {
  if (!snapshot) {
    return [];
  }
  return [
    buildFamilyDevice(gladys, snapshot),
    ...snapshot.children.map((child) => buildChildDevice(gladys, snapshot, child)),
  ];
}

/** Every state of every device, for one snapshot. */
export function buildStates(gladys, snapshot) {
  if (!snapshot) {
    return [];
  }
  return [
    ...familyStates(gladys, snapshot),
    ...snapshot.children.flatMap((child) => childStates(gladys, snapshot, child)),
  ];
}

/** The external ids of every device, for the transport badges. */
export function deviceExternalIds(gladys, snapshot) {
  if (!snapshot) {
    return [];
  }
  return [
    familyIds(gladys, snapshot).device,
    ...snapshot.children.map((child) => childIds(gladys, snapshot, child).device),
  ];
}

/** The child a device external id stands for, or undefined. */
export function findChild(gladys, snapshot, externalId) {
  return snapshot?.children.find(
    (child) => childIds(gladys, snapshot, child).device === externalId,
  );
}

/** The device external id of a child. */
export function childDeviceId(gladys, snapshot, child) {
  return childIds(gladys, snapshot, child).device;
}
