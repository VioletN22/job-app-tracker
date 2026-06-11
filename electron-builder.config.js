module.exports = {
  appId: 'com.jobtracker.app',
  productName: 'Job Application Tracker',
  directories: {
    buildResources: 'assets',
    output: 'dist',
  },
  files: [
    'dist/main/**/*',
    'dist/renderer/**/*',
    'node_modules/**/*',
    'package.json',
  ],
  mac: {
    target: ['dmg', 'zip'],
    category: 'public.app-category.productivity',
  },
};
