// Stub for expo/src/winter/runtime.native.ts
// Prevents the import.meta circular-evaluation issue when Jest loads
// @reduxjs/toolkit (via Babel transform) in a Node test environment.
// The real module provides import.meta metadata for the Expo module system;
// in a unit-test context this is not needed.
module.exports = {};
