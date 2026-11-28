// web-ext config (lint/build). Only extension files ship; dev tooling is ignored.
// web-ext already ignores dotfiles and node_modules.
module.exports = {
  ignoreFiles: [
    'package.json',
    'package-lock.json',
    'web-ext-config.cjs',
    'playwright.config.js',
    'AGENTS.md',
    'CLAUDE.md',
    'docs',
    'design',
    'icons.yaml',
    'scripts',
    'test',
    'test-results',
    'playwright-report',
  ],
};
