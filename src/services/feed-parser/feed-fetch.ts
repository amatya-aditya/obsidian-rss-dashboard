import { Platform } from "obsidian";
import { resolveProxyPrefixes } from "../../utils/proxy-utils.js";
import type { FeedEncoding } from "../../types/types.js";
import { tryFetch } from "./feed-fetch-direct.js";
import {
  fetchThroughConfiguredProxies,
  fetchThroughFallbackProxies,
} from "./feed-fetch-proxies.js";

export type FeedFetchProxyConfig = {
  enabled: boolean;
  url: string;
};

export type FeedFetchProxyOption = boolean | FeedFetchProxyConfig;

function normalizeProxyConfig(
  proxyConfig: FeedFetchProxyOption,
): FeedFetchProxyConfig {
  if (typeof proxyConfig === "boolean") {
    return { enabled: proxyConfig, url: "" };
  }
  return proxyConfig;
}

function getProxyUrls(proxyConfig: FeedFetchProxyConfig): string[] {
  return resolveProxyPrefixes(proxyConfig.url);
}

export async function fetchFeedXml(
  url: string,
  proxyConfig: FeedFetchProxyOption = true,
  signal?: AbortSignal,
  encodingOverride?: FeedEncoding,
): Promise<string> {
  const isAndroid = Platform.isAndroidApp;
  const config = normalizeProxyConfig(proxyConfig);
  const useCorsProxies = typeof proxyConfig === "boolean" ? proxyConfig : true;

  if (!config.enabled) {
    return tryFetch(url, false, signal, encodingOverride, isAndroid);
  }

  if (typeof proxyConfig === "object") {
    try {
      return await tryFetch(url, false, signal, encodingOverride, isAndroid);
    } catch (error) {
      if (isAndroid) {
        throw error;
      }

      const proxyText = await fetchThroughConfiguredProxies(
        url,
        getProxyUrls(config),
        signal,
        encodingOverride,
      );
      if (proxyText !== null) {
        return proxyText;
      }

      throw error;
    }
  }

  try {
    return await tryFetch(
      url,
      useCorsProxies,
      signal,
      encodingOverride,
      isAndroid,
    );
  } catch (error) {
    if (!useCorsProxies) throw error;
    if (isAndroid) {
      throw error;
    }

    const fallbackText = await fetchThroughFallbackProxies(
      url,
      signal,
      encodingOverride,
    );
    if (fallbackText !== null) {
      return fallbackText;
    }

    throw error;
  }
}
