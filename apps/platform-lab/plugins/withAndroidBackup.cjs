const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

// Exclusion-only rules retain Android's default coverage of files, databases
// and preferences. SecureStore's bundled rules include preferences only.
const exclusions = `    <exclude domain="sharedpref" path="SecureStore" />
    <exclude domain="root" path="app_webview" />
    <exclude domain="sharedpref" path="WebViewChromiumPrefs.xml" />`;
const legacy = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
${exclusions}
</full-backup-content>
`;
const modern = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
${exclusions}
  </cloud-backup>
  <device-transfer>
${exclusions}
  </device-transfer>
</data-extraction-rules>
`;

module.exports = function withAndroidBackup(config) {
  config = withAndroidManifest(config, config => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    application.$['android:fullBackupContent'] = '@xml/moflight_backup_rules';
    application.$['android:dataExtractionRules'] = '@xml/moflight_data_extraction_rules';
    return config;
  });
  return withDangerousMod(config, ['android', async config => {
    const directory = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'moflight_backup_rules.xml'), legacy);
    await fs.writeFile(path.join(directory, 'moflight_data_extraction_rules.xml'), modern);
    return config;
  }]);
};
