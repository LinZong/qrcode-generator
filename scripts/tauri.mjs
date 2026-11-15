import { createRequire } from 'node:module';

// Signing needs Apple's recursive xattr, not Homebrew's incompatible variant.
// This only affects this CLI process and its children, not the user's shell.
if (process.platform === 'darwin') {
  process.env.PATH = `/usr/bin:${process.env.PATH ?? ''}`;
}

createRequire(import.meta.url)('@tauri-apps/cli/tauri.js');
