# Browser tests

Playwright tests that drive a built edition the way a user does: through its standalone page, its menus and its file input. They test what `npm run build:edition` produces, so a failure here is one a deployment of that edition would show.

This directory is its own npm package and is not a workspace. Installing Playwright at the builder root would rewrite the committed lock and recreate the nested core copies [AGENTS.md](../AGENTS.md) warns about; here it has a lock of its own and touches nothing else.

## Running

```bash
npm run build:edition -- --profile psg   # in the builder root; the tests read dist/psg/
# psg-module is private, so the psg profile is a local one: profiles/local/psg.mjs
cd e2e
npm install
npm run install:browsers                 # once: Playwright's Chromium
npm test                                 # or `npm run test:e2e` from the builder root
```

`E2E_EDITION=<name>` tests another edition and `E2E_PORT` moves the server off 4173. `npx playwright show-report` opens the last run's report, with the screenshots each test takes and the warnings the page logged.

## How it works

- **Server.** [server.mjs](server.mjs) serves `dist/<edition>/` and the fixtures with the cross-origin isolation headers, so the page runs the SharedArrayBuffer cache an isolated deployment runs, and answers byte ranges for the URL importers. The same fixtures under `/slow-fixtures/` arrive slowly, in proportion to their size (`E2E_SLOW_MS_PER_MB`, default 250), for testing what the viewer shows while a large read is still on its way.
- **Fixtures.** [global-setup.ts](global-setup.ts) writes synthetic EDF+ files into `.fixtures/` with [fixtures/edf.ts](fixtures/edf.ts). The 4-hour study is written once and kept between runs; delete it after changing the writer. Every sample is a known function of time, so a test can read data back and compare it with what was written. Never add a real recording here, de-identified or not.
- **Browser.** Full Chromium in new headless mode. The interface admits a browser by `window.chrome`, which Playwright's default headless shell does not define.
- **Opening a study.** [tests/helpers.ts](tests/helpers.ts) accepts the disclaimer, opens the file through the File menu and selects it. It removes `showOpenFilePicker` first, because the native picker is an OS dialog no test can drive and the interface falls back to its file input without it.
- **Reading state.** `withRecording` evaluates a function against the active recording through `window.__EPICURRENTS__.APP`, for assertions the screen cannot answer, such as which samples the cache returns for a range.
- **Problems.** `collectProblems` gathers console warnings and errors, uncaught exceptions and failed requests. A test fails on errors that are not in `KNOWN_PROBLEMS` and attaches warnings to its report. Each known problem is a defect of its own; remove its entry when it is fixed.

## Expected failures

A test marked `test.fail` asserts the correct behaviour of something that is broken today, and its reason names the defect. It passes while the defect stands and fails once it is fixed, which is the prompt to remove the mark.

| Test | Defect |
|---|---|
| an interrupted file is refused | `PsgRecording.isContinuous` reads the header's interruptions, which are empty when `PsgStudyLoader` checks them, so an EDF+D file opens as a polysomnography. |
