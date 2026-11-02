# Synthetic vault prototype — local only

**Do not use real passwords. No independent security review has occurred.**
This is an isolated development experiment, not an account feature, production
password manager or public route. No autofill, Clerk integration, server, vault
analytics, synchronization or plaintext export exists. No dependency was added.

Build and run with `npm run vault:build` and `npm run vault:preview`, then open
http://127.0.0.1:54410. Preview binds loopback only, uses a separate index/build
under `.wrangler/vault-dist`, and has no public deploy command. Do not override
the host or upload that directory. A normal app build never imports this folder.
Public artifact preparation rejects the prototype markers. CI tests it only on
its ephemeral local runner. `npm run test:vault` exercises four browser targets.

## Design and threat model

Assets: master passphrase, nonextractable encryption key, decrypted credentials
and metadata, encrypted local database and backups. Browser/device, supplied
application code, dependencies and Web Crypto implementation are trusted.
An attacker who obtains only an encrypted backup should not read or undetectably
edit its entries without guessing the master passphrase. This is a design goal,
not a claim of audited security.

- Browser Web Crypto supplies PBKDF2-HMAC-SHA256 (600,000 iterations), a fresh
  128-bit salt, and nonextractable AES-256-GCM keys. AES uses fresh random 96-bit
  IVs and 128-bit authentication tags for every save. No custom cipher/hash is
  implemented. PBKDF2 parameters follow the Web-Crypto-compatible fallback in
  https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html.
  Parameters are fixed and validated on import; no reduced-cost test mode.
- The entire bounded entries JSON (including titles/folders/usernames/URLs) is
  encrypted. AAD binds version, vault ID, revision, KDF, iterations and salt.
  IV tampering also fails GCM verification. Imports reject unknown fields,
  malformed encodings, unexpected parameters, oversized inputs and invalid data.
- IndexedDB stores only the envelope. Each read/compare/write is a transaction;
  expected vault ID/revision prevents a stale tab from replacing a newer save.
  There is no `localStorage` credential/key copy. Quota/write failure preserves
  the previous committed ciphertext. Edits are saved one at a time.
- Lock releases controller references, clears React entry/edit/master/search/
  folder state, and invalidates in-flight decrypt/encrypt operations. A late
  operation cannot reopen the interface. A transaction already committing when
  lock occurs can finish writing encrypted data, never plaintext. Lock occurs
  manually, on tab hiding, or after 60 seconds without keyboard/pointer activity.
  Sleeping devices/browser throttling can delay timers until execution resumes;
  no browser app can enforce real-time locking while suspended.
- Keys are not exportable; encoded input/plaintext byte buffers are cleared
  where possible. JavaScript strings, React/GC copies and process memory cannot
  be reliably erased. Unlocked plaintext is necessarily accessible to running
  code. No promise of protection against memory forensics is made.
- CSP denies every network connection and form submission, allows scripts/styles
  only from the local build, and blocks framing. URLs are displayed as text.
  No clipboard/autofill integration. Existing XSS or a compromised browser,
  extension, operating system or build/dependency can defeat these protections.
- Offline guessing is possible; choose a strong master even for tests. Encryption
  does not prevent deletion, storage eviction or replay of an older valid backup.
  An offline client cannot detect rollback without a separately trusted anchor.

## Recovery and future sync

Only encrypted backup export is provided. Import works into empty storage only;
it never silently replaces an existing vault. Unlock validates a backup's tag
and data. Preserve the master separately. There is no password reset, recovery
key, operator decryption or provider recovery. Lost master, browser storage or
backup can mean permanent data loss. Clear site storage only after deliberately
preserving any synthetic backup you want; this prototype adds no remote deletion.

Future sync would send only bounded opaque encrypted envelopes over HTTPS,
require normal Clerk authentication/live session validation, enforce owner-scoped
database reads/writes, and use transactional expected-revision updates, quotas,
rate limits, deletion and encrypted versioned backups. The server must never
receive the master or derived key. A signed/independently anchored revision and
key rotation/recovery design need separate security review. Existing Pro/admin
permissions must not confer decryption access. This is a design only; no hosted
tables, sync endpoint or authentication exemptions are created here.

Before any real use: independent cryptographic/application review, dependency
review, client key/DOM lifecycle audit, origin/XSS policy, multi-tab crash/quota/
restore rehearsal, physical devices, master change/rotation, import fuzzing,
recovery and encrypted-sync protocol review. Keep public access disabled.
