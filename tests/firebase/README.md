# Isolated profile-photo rules tests

This is a narrow rules fixture for local Firebase Auth and Realtime Database
emulators only. It uses the `demo-spine-society-r112-photo` project ID and binds
both emulator ports to `127.0.0.1`. It contains no production alias or
credentials. Do not deploy `database.rules.json`; it is not the complete
production ruleset.

From the application root, run:

```sh
pnpm dlx firebase-tools@latest emulators:exec \
  --config tests/firebase/firebase.json \
  --project demo-spine-society-r112-photo \
  --only auth,database \
  'node tests/profile-photo-emulator.test.mjs'
```

The CLI stops both emulators after the test. It creates fictional accounts
with random passwords, writes fictional photo strings only to the local
emulator, and prints neither credentials nor photo contents.
