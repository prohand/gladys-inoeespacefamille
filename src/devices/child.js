// -----------------------------------------------------------------------------
// Device type: CHILD BOOKINGS
//
// One device per child of the family: is the child booked today, tomorrow,
// on which activities (canteen, after-school club, leisure centre...), and
// on how many of the next days. The binary features are what a scene tests
// ("tomorrow is a canteen day"), the text ones what a dashboard shows.
//
// The external id is built from the structure number and the child's iNoé
// id: renaming a child in the portal keeps the same device in Gladys.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { describeBookings } from '../inoe/parse.js';

export const DEVICE_TYPE = 'child';

export const CHILD_FEATURES = {
  BOOKED_TODAY: 'booked-today',
  BOOKED_TOMORROW: 'booked-tomorrow',
  TODAY: 'today',
  TOMORROW: 'tomorrow',
  BOOKED_DAYS: 'booked-days',
};

export function childIds(gladys, snapshot, child) {
  return gladys.externalIds(DEVICE_TYPE, `${snapshot.dossier.id}-${child.id}`);
}

export function buildChildDevice(gladys, snapshot, child) {
  const ids = childIds(gladys, snapshot, child);
  const binary = (name, key) => ({
    name,
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
    type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
    min: 0,
    max: 1,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  });
  const text = (name, key) => ({
    name,
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    min: 0,
    max: 0,
    read_only: true,
    has_feedback: false,
    keep_history: false,
  });
  return {
    name: `${child.name} – iNoé`,
    external_id: ids.device,
    features: [
      binary('Booked today', CHILD_FEATURES.BOOKED_TODAY),
      binary('Booked tomorrow', CHILD_FEATURES.BOOKED_TOMORROW),
      text('Today', CHILD_FEATURES.TODAY),
      text('Tomorrow', CHILD_FEATURES.TOMORROW),
      {
        name: 'Days booked ahead',
        external_id: ids.feature(CHILD_FEATURES.BOOKED_DAYS),
        // A feature whose category/type is the only one of its device is
        // labelled by Gladys with the translation of that category/type, not
        // its name: `unknown`/`integer` has none ("undefined"), a duration in
        // days reads "Duration (integer)" with its "d" unit.
        category: DEVICE_FEATURE_CATEGORIES.DURATION,
        type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
        unit: DEVICE_FEATURE_UNITS.DAYS,
        min: 0,
        max: 31,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    ],
  };
}

/** The bookings of a day as one line, "-" for none. */
export function activitiesText(bookings) {
  return describeBookings(bookings);
}

export function childStates(gladys, snapshot, child) {
  if (!child.planningRead) {
    // Unknown is not "not booked": publish nothing, the last values stay.
    return [];
  }
  const ids = childIds(gladys, snapshot, child);
  return [
    {
      device_feature_external_id: ids.feature(CHILD_FEATURES.BOOKED_TODAY),
      state: child.today.length > 0 ? 1 : 0,
    },
    {
      device_feature_external_id: ids.feature(CHILD_FEATURES.BOOKED_TOMORROW),
      state: child.tomorrow.length > 0 ? 1 : 0,
    },
    {
      device_feature_external_id: ids.feature(CHILD_FEATURES.TODAY),
      text: activitiesText(child.today),
    },
    {
      device_feature_external_id: ids.feature(CHILD_FEATURES.TOMORROW),
      text: activitiesText(child.tomorrow),
    },
    {
      device_feature_external_id: ids.feature(CHILD_FEATURES.BOOKED_DAYS),
      state: child.bookedDays,
    },
  ];
}
