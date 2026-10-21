const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Expo keeps transform caches in CI, including inlined EXPO_PUBLIC values.
// A source-only build change must not reuse another revision's diagnostic tag.
config.cacheVersion = `${config.cacheVersion ?? ''}:moflight:${process.env.EXPO_PUBLIC_MOFLIGHT_SOURCE ?? 'unversioned'}`;
module.exports = config;
