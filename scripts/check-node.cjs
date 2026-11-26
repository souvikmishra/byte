// Runs before `npm run lint`. Node 24.14.x ships a CommonJS export lexer
// (merve < 1.2.2) that can read past the start of a buffer and kill the process
// with SIGBUS on macOS. web-ext hits it every time on 24.14.0. Fixed in 24.15.0
// (nodejs/node#62213).
const [major, minor] = process.versions.node.split('.').map(Number);
if (major === 24 && minor === 14) {
  console.error(
    `Node ${process.version} crashes web-ext (SIGBUS in Node's CJS lexer, fixed in 24.15.0, nodejs/node#62213).\n` +
    'Use Node >= 24.15, e.g. `fnm install 24 && fnm use 24`.'
  );
  process.exit(1);
}
