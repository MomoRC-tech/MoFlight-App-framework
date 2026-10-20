import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const requireLab = createRequire(path.resolve('apps/platform-lab/package.json'));
const { compileModsAsync, AndroidConfig } = requireLab('expo/config-plugins');
const withAndroidBackup = requireLab('./plugins/withAndroidBackup.cjs');
const withSecureStore = requireLab('expo-secure-store/app.plugin.js').default;

test('Android backup generation covers app data and excludes credentials/sessions on both rule formats', async () => {
  const config = JSON.parse(await readFile('apps/platform-lab/app.json', 'utf8')).expo;
  assert.equal(config.android.allowBackup, true);
  assert.ok(config.plugins.includes('./plugins/withAndroidBackup.cjs'));
  const secureStore = config.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-secure-store');
  assert.equal(secureStore[1].configureAndroidBackup, false);
  const root = await mkdtemp(path.join(tmpdir(), 'moflight-backup-'));
  const main = path.join(root, 'android/app/src/main');
  try {
    await mkdir(main, { recursive: true });
    await writeFile(path.join(main, 'AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:name=".MainApplication" android:allowBackup="false" android:fullBackupContent="@xml/secure_store_backup_rules" android:dataExtractionRules="@xml/secure_store_data_extraction_rules" /></manifest>');
    // Run the actual Expo manifest and file mods against isolated native files.
    let generated = AndroidConfig.AllowBackup.withAllowBackup(config);
    generated = withSecureStore(generated, secureStore[1]);
    generated = withAndroidBackup(generated);
    await compileModsAsync(generated, { projectRoot: root, platforms: ['android'] });
    const manifest = await readFile(path.join(main, 'AndroidManifest.xml'), 'utf8');
    assert.match(manifest, /android:allowBackup="true"/);
    assert.match(manifest, /android:fullBackupContent="@xml\/moflight_backup_rules"/);
    assert.match(manifest, /android:dataExtractionRules="@xml\/moflight_data_extraction_rules"/);
    const legacy = await readFile(path.join(main, 'res/xml/moflight_backup_rules.xml'), 'utf8');
    const modern = await readFile(path.join(main, 'res/xml/moflight_data_extraction_rules.xml'), 'utf8');
    const transports = Array.from(modern.matchAll(/<(cloud-backup|device-transfer)>([\s\S]*?)<\/\1>/g), match => match[2] ?? '');
    assert.equal(transports.length, 2);
    for (const rules of [legacy, ...transports]) {
      assert.doesNotMatch(rules, /<include\b/, 'allow default database/file coverage, not preferences alone');
      assert.match(rules, /<exclude domain="sharedpref" path="SecureStore"/);
      assert.match(rules, /<exclude domain="root" path="app_webview"/);
      assert.match(rules, /<exclude domain="sharedpref" path="WebViewChromiumPrefs.xml"/);
    }
    assert.match(modern, /<cloud-backup>/);
    assert.match(modern, /<device-transfer>/);
    // Repeated generation must retain the same policy and resources.
    await compileModsAsync(withAndroidBackup(withSecureStore(AndroidConfig.AllowBackup.withAllowBackup(JSON.parse(await readFile('apps/platform-lab/app.json', 'utf8')).expo), secureStore[1])), { projectRoot: root, platforms: ['android'] });
    assert.equal(await readFile(path.join(main, 'res/xml/moflight_data_extraction_rules.xml'), 'utf8'), modern);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
