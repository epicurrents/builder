/**
 * Write the test fixtures without running the tests, for a manual session against `npm run serve`.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import writeFixtures, { FIXTURE_DIR } from './global-setup.ts'

writeFixtures()
console.info(`Wrote the fixtures to ${FIXTURE_DIR}.`)
