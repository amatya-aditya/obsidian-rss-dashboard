import { installObsidianDomPolyfills } from "./test-dom-polyfills";
import { resetFeedIconFailureCache } from "../../src/utils/favicon-utils";
import { resetProxyHealth } from "../../src/utils/proxy-health";
import { beforeEach } from "vitest";

installObsidianDomPolyfills();

beforeEach(() => {
  resetFeedIconFailureCache();
  resetProxyHealth();
});
