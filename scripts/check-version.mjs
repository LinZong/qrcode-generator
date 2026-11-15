import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const packageJson = JSON.parse(read('package.json'));
const npmLock = JSON.parse(read('package-lock.json'));
const tauriConfig = JSON.parse(read('src-tauri/tauri.conf.json'));
const cargoVersion = read('src-tauri/Cargo.toml').match(
  /\[package\][\s\S]*?\nversion = "([^"]+)"/,
)?.[1];
const cargoLockVersion = read('src-tauri/Cargo.lock').match(
  /\[\[package\]\]\nname = "qrcode-generator"\nversion = "([^"]+)"/,
)?.[1];
const version = packageJson.version;

for (const [source, actual] of Object.entries({
  'package-lock.json': npmLock.version,
  'package-lock.json root package': npmLock.packages[''].version,
  'tauri.conf.json': tauriConfig.version,
  'Cargo.toml': cargoVersion,
  'Cargo.lock': cargoLockVersion,
})) {
  assert.equal(actual, version, `${source} version must match package.json (${version})`);
}

const tag = process.argv[2];
if (tag) assert.equal(tag, `v${version}`, `Release tag must be v${version}`);
console.log(`Version ${version} is consistent${tag ? ` with tag ${tag}` : ''}.`);
