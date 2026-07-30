const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8934',
  },
  webServer: {
    command: 'npx --yes serve . -l 8934',
    url: 'http://localhost:8934',
    reuseExistingServer: !process.env.CI,
  },
});
