# Local (private) build profiles

Profiles placed here are **gitignored** — only this README is tracked. Use this folder for editions that:

- reference non-public packages (a public profile in `profiles/` would refuse to load one), or
- are deployment-specific and should not be published.

Drop a `<name>.mjs` here with the same shape as a public profile (see [`../README.md`](../README.md)), then build it exactly the same way:

```bash
npm run setup -- --profile <name>
```

The loader resolves `profiles/<name>.mjs` first, then `profiles/local/<name>.mjs` — so a public profile of the same name wins, and a local profile cannot shadow one. Give local profiles their own names.
