// Loaded before the tests (node --require). The store and the services it uses import two modules that only
// exist on a phone -- AsyncStorage and SecureStore -- so those are pointed at plain in-memory fakes. Everything
// else runs as it does in the app.
const Module = require("node:module");
const path = require("node:path");

const FAKES = {
  "@react-native-async-storage/async-storage": path.join(__dirname, "fakes", "async-storage.ts"),
  "expo-secure-store": path.join(__dirname, "fakes", "secure-store.ts"),
};

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (Object.prototype.hasOwnProperty.call(FAKES, request)) return FAKES[request];
  return resolveFilename.call(this, request, ...rest);
};

// The services log as they go, for someone watching a phone; a test run does not want it.
if (!process.env.DEBUG_TESTS) {
  for (const name of ["log", "info", "warn"]) console[name] = () => {};
}
