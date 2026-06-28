// Friend ("lite") build config — produces an unpacked .app we then ad-hoc sign
// + wrap in a DMG ourselves (scripts/build-friend.sh). The ARCH is chosen by the
// CLI flag the script passes (--arm64 / --x64 / --universal), not here.
module.exports = {
  appId: 'com.purpl.aplyd',
  productName: 'aplyd',
  directories: { buildResources: 'assets', output: 'release' },
  files: [
    'dist/main/**/*',
    'dist/renderer/**/*',
    'dist/shared/**/*',
    'node_modules/**/*',
    'package.json',
    'assets/**/*',
  ],
  asarUnpack: ['node_modules/better-sqlite3/**/*'],
  mac: {
    icon: 'assets/icon.icns',
    category: 'public.app-category.productivity',
    identity: null, // we ad-hoc sign ourselves afterwards
    target: ['dir'],
  },
  extraResources: [{ from: 'assets', to: 'assets' }],
};
