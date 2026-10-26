// -----------------------------------------------------------------------------
// Device type: FAMILY ACCOUNT
//
// One device per family account: what the portal's dashboard shows — the
// amount left to pay, the invoices still open, the next due date, the
// documents the structure is waiting for and its latest news.
//
// Read-only: every feature is a sensor refreshed by the sync loop
// (src/service.js), so the device declares no `poll_frequency`.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'family';

export const FAMILY_FEATURES = {
  AMOUNT_DUE: 'amount-due',
  UNPAID_INVOICES: 'unpaid-invoices',
  NEXT_DUE_DATE: 'next-due-date',
  DOCUMENTS_EXPECTED: 'documents-expected',
  LATEST_NEWS: 'latest-news',
};

/** The structure number and the family id: what the portal never renumbers. */
export function familyIds(gladys, snapshot) {
  return gladys.externalIds(DEVICE_TYPE, `${snapshot.dossier.id}-${snapshot.family.id}`);
}

export function buildFamilyDevice(gladys, snapshot) {
  const ids = familyIds(gladys, snapshot);
  const name = snapshot.family.name
    ? `${snapshot.dossier.name} – ${snapshot.family.name}`
    : snapshot.dossier.name;
  return {
    name,
    external_id: ids.device,
    features: [
      {
        name: 'Amount due',
        external_id: ids.feature(FAMILY_FEATURES.AMOUNT_DUE),
        category: DEVICE_FEATURE_CATEGORIES.CURRENCY,
        type: DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
        unit: DEVICE_FEATURE_UNITS.EURO,
        min: 0,
        max: 100000,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
      {
        name: 'Unpaid invoices',
        external_id: ids.feature(FAMILY_FEATURES.UNPAID_INVOICES),
        category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
        type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
        min: 0,
        max: 1000,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
      {
        name: 'Next due date',
        external_id: ids.feature(FAMILY_FEATURES.NEXT_DUE_DATE),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        min: 0,
        max: 0,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: 'Documents expected',
        external_id: ids.feature(FAMILY_FEATURES.DOCUMENTS_EXPECTED),
        category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
        type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
        min: 0,
        max: 1000,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: 'Latest news',
        external_id: ids.feature(FAMILY_FEATURES.LATEST_NEWS),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        min: 0,
        max: 0,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
    ],
  };
}

/** The states of the family device for one snapshot. */
export function familyStates(gladys, snapshot) {
  const ids = familyIds(gladys, snapshot);
  const states = [
    {
      device_feature_external_id: ids.feature(FAMILY_FEATURES.AMOUNT_DUE),
      state: snapshot.amountDue,
    },
    {
      device_feature_external_id: ids.feature(FAMILY_FEATURES.DOCUMENTS_EXPECTED),
      state: snapshot.documentsExpected,
    },
  ];
  // A list that could not be read publishes nothing rather than a false 0.
  if (snapshot.invoices !== null) {
    states.push(
      {
        device_feature_external_id: ids.feature(FAMILY_FEATURES.UNPAID_INVOICES),
        state: snapshot.unpaidCount,
      },
      {
        device_feature_external_id: ids.feature(FAMILY_FEATURES.NEXT_DUE_DATE),
        text: snapshot.nextInvoice?.dueDate ?? '-',
      },
    );
  }
  if (snapshot.news !== null) {
    states.push({
      device_feature_external_id: ids.feature(FAMILY_FEATURES.LATEST_NEWS),
      text: snapshot.latestNews?.title || '-',
    });
  }
  return states;
}
