import { defineConfig } from "vitest/config";

// Plain Node environment — every module under test (src/utils, src/data,
// server/labPdfExtraction.js) is pure logic with no DOM dependency, so jsdom
// isn't needed here.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.js", "server/**/*.test.js"],
  },
});
