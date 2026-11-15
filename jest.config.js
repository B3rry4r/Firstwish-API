/** Jest: specs live next to the code (src/<resource>/tests/*.spec.ts) and in test/. */
module.exports = {
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testRegex: "\\.spec\\.ts$",
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json", isolatedModules: true }] },
  moduleFileExtensions: ["ts", "js", "json"],
  setupFiles: ["<rootDir>/test/kit/jest-setup.ts"],
  testTimeout: 20000,
};
