# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

### Added

- "Upcoming bookings" dashboard widget: the booked days of the planning window, one card per day
  with each child's slots, Refresh button and a link to the portal.

## [1.0.0] - 2026-10-26

### Added

- First version of the iNoé Espace Famille integration (AIGA family portal), read-only and cloud.
- A "family" device: amount due (€), invoices to pay, next due date, documents expected, latest
  news of the structure.
- One device per child: booked today / tomorrow, every slot booked (a full day of leisure centre
  reads "Matin, Repas, Après-midi"), and the number of days booked ahead.
- Scene triggers: new invoice, invoice due soon, a child's booking changed, new message from the
  structure.
- Scene actions: read the portal now, check a child's booking for today or tomorrow.
- "Family space" dashboard widget: amount due, next invoice, each child's day, Refresh button and
  a link to the portal.
- "Test the connection" button on the Configuration screen.
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/prohand/gladys-inoeespacefamille/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/prohand/gladys-inoeespacefamille/releases/tag/v1.0.0
