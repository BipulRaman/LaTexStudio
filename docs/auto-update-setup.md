# Auto-update setup

LaTeX Studio uses Tauri's built-in updater. Releases are signed in CI with an
Ed25519 keypair so the in-app updater can verify that every update came from
this repository and was not tampered with on the way to the user.

This page documents the **one-time** setup needed to enable signed updates.
After it's done, every tagged GitHub release automatically becomes an update
that existing installs can pick up.

---

## What's already wired up

- `tauri-plugin-updater` registered in [src-tauri/src/lib.rs](../app/src-tauri/src/lib.rs)
- Updater config + `createUpdaterArtifacts: true` in [tauri.conf.json](../app/src-tauri/tauri.conf.json)
- Boot check + `Help → Check for Updates…` menu item in [App.tsx](../app/src/App.tsx)
- Release workflow signs binaries and publishes `latest.json` — [release.yml](../.github/workflows/release.yml)
- Helper workflow that generates the signing keypair entirely in CI — [generate-updater-keys.yml](../.github/workflows/generate-updater-keys.yml)

The only thing missing on a fresh fork is the actual signing key. Follow the
steps below.

---

## One-time setup (~5 minutes)

### 1. Create the passphrase secret

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Field | Value |
|------|-------|
| Name | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` |
| Value | Any passphrase you like. **Save a copy in a password manager** — losing it forces a full re-key. |

### 2. Generate the keypair

**Actions** tab → **Generate Updater Signing Keys** → **Run workflow** (no inputs).

The workflow uses the passphrase secret you just created to encrypt a new
private key. Wait for the green check (~1 min).

### 3. Install the public key

Open the completed run → **Generate keypair** job → expand the
**Print setup instructions** step. You'll see something like:

```
"pubkey": "dW50cn..............."
```

Open [app/src-tauri/tauri.conf.json](../app/src-tauri/tauri.conf.json),
find:

```json
"pubkey": "REPLACE_ME_WITH_PUBLIC_KEY_FROM_TAURI_SIGNER_GENERATE",
```

Replace with the real key string. Commit and push.

### 4. Install the private key as a secret

Same workflow run → **Artifacts** section → download
**`tauri-signing-keypair`** (a zip). Open the file named `key` in any text
editor and copy its full contents.

Back in GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Field | Value |
|------|-------|
| Name | `TAURI_SIGNING_PRIVATE_KEY` |
| Value | The full contents of the `key` file (including any line breaks) |

### 5. Delete the artifact

Same run page → Artifacts → trash icon next to `tauri-signing-keypair`.
(It auto-expires in 24 hours but delete it sooner.)

### 6. Ship a release

Tag a new version (e.g. `v1.0.1`) and publish it from the GitHub UI. The
**Release Desktop Binaries** workflow will produce:

- Platform installers (`.msi`, `.exe`, `.dmg`, `.deb`, `.AppImage`)
- A `.sig` file next to each installer
- `latest.json` — the manifest the in-app updater fetches

### 7. Verify the update flow

1. Install the **previous** version of LaTeX Studio (e.g. v1.0.0).
2. Launch it.
3. Within ~3 seconds you should see a toast: *"Update available: v1.0.1"*.
4. **Help → Check for Updates…** → confirm.
5. App downloads, verifies the signature, installs, and relaunches as v1.0.1.

You're done. Future tagged releases will reach existing installs
automatically through the same path.

---

## What if the password leaks?

Both secrets should be considered compromised together. To rotate:

1. Delete both secrets and create a fresh `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
2. Re-run **Generate Updater Signing Keys**.
3. Update the pubkey in [tauri.conf.json](../app/src-tauri/tauri.conf.json)
   and create a new `TAURI_SIGNING_PRIVATE_KEY` secret from the new artifact.
4. Bump the version and publish a new release.

**Important:** every existing install has the *old* public key compiled in.
After a rotation they cannot auto-update — the new signature will not match
the old pubkey. Tell users in the release notes that this version requires a
manual reinstall once; subsequent updates work normally.

---

## What if the password changes (only)?

If you change the value of `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` without also
re-generating the key, the next release will fail at the signing step
(decryption error). The release publishes binaries without signatures and
without `latest.json`, so in-app updates silently skip that version.

Fix by either restoring the old password value, or rotating both secrets as
described above.

---

## Endpoint URL

The app fetches the update manifest from:

```
https://github.com/BipulRaman/LaTexStudio/releases/latest/download/latest.json
```

This GitHub-provided URL is a permanent redirect to the latest release's
`latest.json`, so it always points at the newest published version. The
endpoint is configured in
[tauri.conf.json](../app/src-tauri/tauri.conf.json) under
`plugins.updater.endpoints`.
