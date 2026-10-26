// -----------------------------------------------------------------------------
// The changelog roll the Release workflow runs (.github/scripts/changelog-release.mjs).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-inoeespacefamille';

test('the Unreleased section moves under the released version', () => {
  const text = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- Something new.',
    '',
    '## [1.0.0] - 2026-10-26',
    '',
    '- First release.',
    '',
    `[Unreleased]: ${REPO}/compare/v1.0.0...HEAD`,
    `[1.0.0]: ${REPO}/releases/tag/v1.0.0`,
    '',
  ].join('\n');
  const rolled = rollChangelog(text, '1.1.0', '2026-11-02');
  assert.match(
    rolled,
    /## \[Unreleased\]\n\n## \[1\.1\.0\] - 2026-11-02\n\n### Added\n\n- Something new\./,
  );
  assert.match(rolled, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.1\\.0\\.\\.\\.HEAD`));
  assert.match(
    rolled,
    new RegExp(`\\[1\\.1\\.0\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.v1\\.1\\.0`),
  );
});

test('an empty Unreleased section still names the release', () => {
  const rolled = rollChangelog('## [Unreleased]\n', '1.0.1', '2026-11-02');
  assert.match(
    rolled,
    /## \[1\.0\.1\] - 2026-11-02\n\n- Maintenance release, no functional change\./,
  );
});

test('a version already in the changelog is not added twice', () => {
  const text = '## [Unreleased]\n\n## [1.0.0] - 2026-10-26\n';
  assert.equal(rollChangelog(text, '1.0.0', '2026-10-27'), text);
});

test('the changelog of the repository can be rolled', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(text, /^## \[Unreleased\]$/m);
  assert.match(text, new RegExp(`^\\[Unreleased\\]: ${REPO}/`, 'm'));
});
