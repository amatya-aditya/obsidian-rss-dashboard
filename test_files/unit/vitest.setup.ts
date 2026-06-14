import { installObsidianDomPolyfills } from "./test-dom-polyfills";
import { resetFeedIconFailureCache } from "../../src/utils/favicon-utils";
import { beforeEach } from "vitest";

installObsidianDomPolyfills();

beforeEach(() => {
  resetFeedIconFailureCache();
});
