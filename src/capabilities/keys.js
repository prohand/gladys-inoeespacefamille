// -----------------------------------------------------------------------------
// The keys users store in their scenes and dashboards.
//
// Gladys keeps them in the scenes and the dashboards that use them: a key
// published once is never renamed (that would silently break those scenes).
// test/manifest.test.js checks that the manifest declares exactly these.
// -----------------------------------------------------------------------------

export const SCENE_TRIGGERS = {
  NEW_INVOICE: 'new_invoice',
  INVOICE_DUE_SOON: 'invoice_due_soon',
  BOOKING_CHANGED: 'booking_changed',
  NEW_MESSAGE: 'new_message',
};

export const SCENE_ACTIONS = {
  REFRESH: 'refresh',
  CHECK_BOOKING: 'check_booking',
};

export const BOOKING_CHANGES = {
  BOOKED: 'booked',
  CANCELLED: 'cancelled',
};

export const CHECK_DAYS = {
  TODAY: 'today',
  TOMORROW: 'tomorrow',
};

export const FAMILY_WIDGET = 'family_space';
export const BOOKINGS_WIDGET = 'upcoming_bookings';

export const WIDGET_ACTIONS = {
  REFRESH: 'refresh',
};
