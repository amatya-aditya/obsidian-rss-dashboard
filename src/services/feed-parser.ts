import { requestUrl, Platform } from "obsidian";
import { Feed, FeedItem, MediaSettings, Tag } from "../types/types.js";
import { MediaService } from "./media-service";

// Type definitions for external API responses
interface AllOriginsResponse {
    contents: string;
}

interface Rss2JsonFeedItem {
    title?: string;
    link?: string;
    description?: string;
    pubDate?: string;
}

interface Rss2JsonFeed {
    title?: string;
    description?: string;
    link?: string;
    language?: string;
    image?: string;
}

interface Rss2JsonResponse {
    status: string;
    feed?: Rss2JsonFeed;
    items?: Rss2JsonFeedItem[];
    message?: string;
}

interface JsonFeedAuthor {
    name?: string;
}

interface JsonFeedItem {
    url?: string;
    title?: string;
    summary?: string;
    date_published?: string;
    id?: string;
    authors?: JsonFeedAuthor[];
    content_html?: string;
    content_text?: string;
    image?: string;
    category?: string;
    tags?: string[];
}

interface JsonFeed {
    version?: string;
    title?: string;
    description?: string;
    home_page_url?: string;
    authors?: JsonFeedAuthor[];
    icon?: string;
    items?: JsonFeedItem[];
}

function isValidFeed(text: string): boolean {
    if (!text) return false;
    const sample = text.slice(0, 2048).toLowerCase();
    return (
        sample.includes('<rss') ||
        sample.includes('<feed') ||
        sample.includes('<rdf:rdf') ||
        sample.includes('<rdf') ||
        sample.includes('xmlns="http://purl.org/rss/1.0/"') ||
        sample.includes('xmlns:rdf=')
    );
}

async function discoverFeedUrl(baseUrl: string): Promise<string | null> {
    try {
        
        
        const response = await requestUrl({
            url: baseUrl,
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }
        });
        
        if (!response.text) return null;
        
        
        if (baseUrl.includes('feeds.feedburner.com')) {
            
            
            
            const feedNameMatch = baseUrl.match(/feeds\.feedburner\.com\/([^/?]+)/);
            if (feedNameMatch) {
                const feedName = feedNameMatch[1];
                const feedBurnerUrls = [
                    `https://feeds.feedburner.com/${feedName}?format=xml`,
                    `https://feeds.feedburner.com/${feedName}?fmt=xml`,
                    `https://feeds.feedburner.com/${feedName}?type=xml`,
                    `https://feeds.feedburner.com/${feedName}/feed`,
                    `https://feeds.feedburner.com/${feedName}/rss`,
                    `https://feeds.feedburner.com/${feedName}/atom`,
                    `https://feeds.feedburner.com/${feedName}.xml`,
                    `https://feeds.feedburner.com/${feedName}/feed.xml`,
                    `https://feeds.feedburner.com/${feedName}/rss.xml`,
                    `https://feeds.feedburner.com/${feedName}/atom.xml`
                ];
                
                for (const feedUrl of feedBurnerUrls) {
                    try {
                        
                        const feedResponse = await requestUrl({
                            url: feedUrl,
                            method: "GET",
                            headers: {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                                "Accept": "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
                            }
                        });
                        
                        if (feedResponse.text && 
                            (feedResponse.text.includes('<rss') || 
                             feedResponse.text.includes('<feed') || 
                             feedResponse.text.includes('<channel'))) {
                            
                            return feedUrl;
                        }
                    } catch {
                        
                        continue;
                    }
                }
            }
        }
        
        
        const feedLinkMatches = response.text.match(/<link[^>]+(?:type="application\/rss\+xml"|type="application\/atom\+xml"|type="application\/rdf\+xml"|type="application\/xml")[^>]+href="([^"]+)"/gi);
        
        if (feedLinkMatches) {
            for (const match of feedLinkMatches) {
                const hrefMatch = match.match(/href="([^"]+)"/);
                if (hrefMatch) {
                    let feedUrl = hrefMatch[1];
                    
                    
                    if (feedUrl.startsWith('/')) {
                        const url = new URL(baseUrl);
                        feedUrl = `${url.protocol}//${url.host}${feedUrl}`;
                    } else if (!feedUrl.startsWith('http')) {
                        feedUrl = `${baseUrl}/${feedUrl}`;
                    }
                    
                    
                    return feedUrl;
                }
            }
        }
        
        
            const altFeedPatterns = [
            /<a[^>]+href="([^"]*feed[^"]*)"[^>]*>/gi,
            /<a[^>]+href="([^"]*rss[^"]*)"[^>]*>/gi,
            /<a[^>]+href="([^"]*atom[^"]*)"[^>]*>/gi,
            /<a[^>]+href="([^"]*rdf[^"]*)"[^>]*>/gi,
            /<a[^>]+href="([^"]*xml[^"]*)"[^>]*>/gi
        ];
        
        for (const pattern of altFeedPatterns) {
            const matches = response.text.match(pattern);
            if (matches) {
                for (const match of matches) {
                    const hrefMatch = match.match(/href="([^"]+)"/);
                    if (hrefMatch) {
                        let feedUrl = hrefMatch[1];
                        if (feedUrl.startsWith('/')) {
                            const url = new URL(baseUrl);
                            feedUrl = `${url.protocol}//${url.host}${feedUrl}`;
                        } else if (!feedUrl.startsWith('http')) {
                            feedUrl = `${baseUrl}/${feedUrl}`;
                        }
                        if (feedUrl === baseUrl) continue;
                        
                        return feedUrl;
                    }
                }
            }
        }
    } catch {
        // Feed discovery failed, return null
    }
    return null;
}

export async function fetchFeedXml(url: string): Promise<string> {
    const isAndroid = Platform.isAndroidApp;
    
    
    async function tryFetch(targetUrl: string): Promise<string> {
        if (targetUrl.includes('feeds.feedburner.com')) {
            const httpsUrl = targetUrl.replace(/^http:\/\//i, 'https://');
            const feedNameMatch = httpsUrl.match(/feeds\.feedburner\.com\/([^/?]+)/);
            if (feedNameMatch) {
                const feedName = feedNameMatch[1];
                const feedBurnerUrls = [
                    `https://feeds.feedburner.com/${feedName}?format=xml`,
                    `https://feeds.feedburner.com/${feedName}?fmt=xml`,
                    `https://feeds.feedburner.com/${feedName}?type=xml`,
                    `https://feeds.feedburner.com/${feedName}`
                ];
                for (const fbUrl of feedBurnerUrls) {
                    try {
                        const fbResponse = await requestUrl({
                            url: fbUrl,
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                                "Accept": "application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8"
                            }
                        });
                        if (fbResponse.text && isValidFeed(fbResponse.text)) {
                            
                            return fbResponse.text;
                        } else {
                            throw new Error('Not a valid RSS/Atom feed');
                        }
            } catch {
                        
                        continue;
                    }
                }
            }
        }
        try {
            const secureUrl = targetUrl; // try original URL as-is first (don't force https)
            const response = await requestUrl({
                url: secureUrl,
                method: "GET",
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                    "Accept": "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
                }
            });
            
            if (!response.text) {
                throw new Error('Empty response from feed');
            }

            if (isValidFeed(response.text)) {
                // Handle arXiv stub feeds that point to rss.arxiv.org but contain no items
                const hasItems = /<item\b[\s\S]*?<\/item>/i.test(response.text);
                if (!hasItems) {
                    const atomLinkMatch = response.text.match(/<atom:link[^>]*href=["']([^"']+)["'][^>]*>/i);
                    const channelLinkMatch = response.text.match(/<channel[^>]*>[\s\S]*?<link[^>]*>([^<]+)<\/link>/i);
                    const candidateUrl = atomLinkMatch?.[1] || channelLinkMatch?.[1] || '';
                    if (candidateUrl && /arxiv\.org\//i.test(candidateUrl)) {
                        try {
                            const arxivResp = await requestUrl({
                                url: candidateUrl,
                                method: "GET",
                                headers: {
                                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                                    "Accept": "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
                                }
                            });
                            if (arxivResp.text && isValidFeed(arxivResp.text)) {
                                return arxivResp.text;
                            }
                        } catch {
                            // ArXiv feed fetch failed, continue
                        }
                    }
                }
                return response.text;
            }

            // If initial scheme fails, try toggled scheme (http<->https) before other fallbacks
            const toggledUrl = targetUrl.startsWith('http://')
                ? targetUrl.replace(/^http:\/\//i, 'https://')
                : targetUrl.startsWith('https://')
                    ? targetUrl.replace(/^https:\/\//i, 'http://')
                    : '';
            if (toggledUrl) {
                try {
                    const toggledResp = await requestUrl({
                        url: toggledUrl,
                        method: "GET",
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                            "Accept": "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
                        }
                    });
                    if (toggledResp.text && isValidFeed(toggledResp.text)) {
                        return toggledResp.text;
                    }
                } catch {
                    // Toggled url fetch failed, continue
                }
            }

            
            if (response.text.includes('<?php') || response.text.includes('WordPress') || response.text.includes('wp-blog-header.php')) {
                console.warn('Received php file instead of RSS feed, trying alternative URLs...');
                
                
                const baseUrl = secureUrl.replace(/\/feed\/?$/, '');
                const alternativeUrls = [
                    `${baseUrl}/feed/rss/`,
                    `${baseUrl}/feed/rss2/`,
                    `${baseUrl}/feed/atom/`,
                    `${baseUrl}/rss/`,
                    `${baseUrl}/rss.xml`,
                    `${baseUrl}/feed.xml`,
                    `${baseUrl}/index.php/feed/`,
                    `${baseUrl}/?feed=rss2`,
                    `${baseUrl}/?feed=rss`,
                    `${baseUrl}/?feed=atom`,
                    
                    `${baseUrl}/wp-feed.php`,
                    `${baseUrl}/feed/feed/`,
                    `${baseUrl}/feed/rdf/`,
                    
                    `${baseUrl}/?feed=rss2&paged=1`,
                    `${baseUrl}/?feed=rss&paged=1`,
                    
                    `${baseUrl}/feed`,
                    `${baseUrl}/rss`,
                    `${baseUrl}/rss.xml`,
                    `${baseUrl}/index.rss`,
                    `${baseUrl}/index.xml`,
                    
                    `${baseUrl}/index.php?feed=rss2`,
                    `${baseUrl}/index.php?feed=rss`,
                    `${baseUrl}/index.php?feed=atom`
                ];
            
            for (const altUrl of alternativeUrls) {
                try {
                        
                    const altResponse = await requestUrl({
                        url: altUrl,
                        method: "GET",
                        headers: {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                                "Accept": "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
                            }
                        });
                        
                        if (altResponse.text && isValidFeed(altResponse.text)) {
                            
                        return altResponse.text;
                        } else {
                            throw new Error('Not a valid RSS/Atom feed');
                    }
                } catch {
                        
                    continue;
                }
            }
            
            
                
            const discoveredUrl = await discoverFeedUrl(baseUrl) || (baseUrl.includes('arxiv.org') ? baseUrl.replace('export.arxiv.org', 'rss.arxiv.org') : null);
            if (discoveredUrl) {
                try {
                        
                        const discoveredResponse = await requestUrl({
                        url: discoveredUrl,
                        method: "GET",
                        headers: {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                                "Accept": "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
                            }
                        });
                        
                        if (discoveredResponse.text && isValidFeed(discoveredResponse.text)) {
                            
                        return discoveredResponse.text;
                        } else {
                            throw new Error('Not a valid RSS/Atom feed');
                    }
                } catch {
                    // Discovered url fetch failed, continue
                }
            }
            
            throw new Error('All alternative feed URLs failed, received PHP file instead of RSS feed');
        }

            throw new Error('Not a valid RSS/Atom feed');
        } catch (error) {
            
            console.warn(`[RSS dashboard] direct fetch failed for ${targetUrl}, trying AllOrigins proxy...`, error);
            
            try {
                const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
                const proxyResponse = await requestUrl({
                    url: allOriginsUrl,
                    method: "GET"
                });
                const data = JSON.parse(proxyResponse.text) as AllOriginsResponse;
                if (!data.contents) throw new Error('No contents from AllOrigins');
                
                
                if (isValidFeed(data.contents)) {
                    return data.contents;
                } else {
                    throw new Error('Not a valid RSS/Atom feed');
                }
            } catch (proxyError) {
                console.error(`[RSS dashboard] AllOrigins proxy fetch failed for ${targetUrl}:`, proxyError);

                // Try allOrigins raw endpoint
                try {
                    const rawUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
                    const rawResp = await requestUrl({ url: rawUrl, method: "GET" });
                    if (rawResp.text && isValidFeed(rawResp.text)) {
                        return rawResp.text;
                    } else {
                        throw new Error('AllOrigins raw returned non-feed');
                    }
                } catch {
                    // Toggled url fetch failed, continue
                }
                
                if (!isAndroid) {
                    
                    try {
                        const codetabsUrl = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(targetUrl)}`;
                        const codetabsResponse = await requestUrl({ url: codetabsUrl, method: "GET" });
                        if (codetabsResponse.text && isValidFeed(codetabsResponse.text)) {
                            
                            return codetabsResponse.text;
                        } else {
                            throw new Error('Not a valid RSS/Atom feed');
                        }
                    } catch (e) {
                        console.warn('[RSS dashboard] codetabs proxy failed', e);
                    }
                    
                    // isomorphic-git CORS proxy (raw)
                    try {
                        const isoUrl = `https://cors.isomorphic-git.org/${targetUrl}`;
                        const isoResp = await requestUrl({ url: isoUrl, method: "GET" });
                        if (isoResp.text && isValidFeed(isoResp.text)) {
                            return isoResp.text;
                        } else {
                            throw new Error('Not a valid RSS/Atom feed');
                        }
                    } catch (e) {
                        console.warn('[RSS dashboard] isomorphic-git proxy failed', e);
                    }

                    try {
                        const thingproxyUrl = `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(targetUrl)}`;
                        const thingproxyResponse = await requestUrl({ url: thingproxyUrl, method: "GET" });
                        if (thingproxyResponse.text && isValidFeed(thingproxyResponse.text)) {
                            
                            return thingproxyResponse.text;
                        } else {
                            throw new Error('Not a valid RSS/Atom feed');
                        }
                    } catch (e) {
                        console.warn('[RSS dashboard] thingproxy failed', e);
                    }
                    
                    try {
                        const discoveredUrl = await discoverFeedUrl(targetUrl);
                        if (discoveredUrl && discoveredUrl !== targetUrl) {
                            
                            const discoveredResponse = await requestUrl({
                                url: discoveredUrl,
                                method: "GET",
                                headers: {
                                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                                    "Accept": "application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8"
                                }
                            });
                            if (discoveredResponse.text && isValidFeed(discoveredResponse.text)) {
                                
                                return discoveredResponse.text;
                            } else {
                                throw new Error('Not a valid RSS/Atom feed');
                            }
                        }
                    } catch (e) {
                        console.warn('[RSS dashboard] discoverFeedUrl proxy fetch failed', e);
                    }
                }
                throw new Error(`Could not fetch a valid RSS/Atom feed from ${targetUrl}`);
            }
        }
    }
    
    try {
        return await tryFetch(url);
    } catch (error) {
        
        if (isAndroid) {
            
            throw error;
        }
        
        
        try {
            const proxyUrl = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`;
            const proxyResponse = await requestUrl({ url: proxyUrl, method: "GET", headers: {
                "Accept": "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
            }});
            
            if (proxyResponse.text && isValidFeed(proxyResponse.text)) {
                return proxyResponse.text;
            } else {
                throw new Error('First proxy blocked by Cloudflare');
            }
        } catch {
            try {
                const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
                const proxyResponse = await requestUrl({ url: rss2jsonUrl, method: "GET" });
                const data = JSON.parse(proxyResponse.text) as Rss2JsonResponse;
                
                if (data.status === 'ok' && data.feed) {
                    
                    const feed = data.feed;
                    const items = data.items || [];
                    
                    let rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n    <title>${feed.title || 'Unknown feed'}</title>\n    <description>${feed.description || ''}</description>\n    <link>${feed.link || ''}</link>\n    <language>${feed.language || 'en'}</language>`;
                    
                    if (feed.image) {
                        rss += `\n    <image>\n        <url>${feed.image}</url>\n        <title>${feed.title || 'Unknown feed'}</title>\n        <link>${feed.link || ''}</link>\n    </image>`;
                    }
                    
                    items.forEach((item: Rss2JsonFeedItem) => {
                        rss += `\n    <item>\n        <title>${item.title || ''}</title>\n        <link>${item.link || ''}</link>\n        <description><![CDATA[${item.description || ''}]]></description>\n        <pubDate>${item.pubDate || new Date().toISOString()}</pubDate>\n        <guid>${item.link || ''}</guid>\n    </item>`;
                    });
                    
                    rss += `\n</channel>\n</rss>`;
                    
                    return rss;
                    } else {
                        throw new Error('RSS2JSON returned error: ' + (data.message || 'Unknown error'));
                    }
            } catch {
                throw error; 
            }
        }
    }
}

interface ParsedFeed {
    title: string;
    description?: string;
    link?: string;
    author?: string;
    image?: { url: string };
    items: ParsedItem[];
    type: 'rss' | 'atom' | 'json';
    feedItunesImage: string;
    feedImageUrl: string;
}

interface ParsedItem {
    title: string;
    link: string;
    description: string;
    pubDate: string;
    guid: string;
    author?: string;
    content?: string;
    category?: string;
    enclosure?: {
        url: string;
        type: string;
        length: string;
    };
    itunes?: {
        duration?: string;
        explicit?: string;
        image?: { href: string };
        category?: string;
        summary?: string;
        episodeType?: string;
        season?: string;
        episode?: string;
    };
    image?: { url: string };
    
    ieee?: {
        pubYear?: string;
        volume?: string;
        issue?: string;
        startPage?: string;
        endPage?: string;
        fileSize?: string;
        authors?: string;
    };
}

export class CustomXMLParser {
    private parseXML(xmlString: string): Document {
        const parser = new DOMParser();
        return parser.parseFromString(xmlString, "text/xml");
    }

    private detectEncoding(xmlString: string): string {
        const match = xmlString.match(/encoding=["']([^"']+)["']/);
        return match ? match[1] : 'UTF-8';
    }

    private getTextContent(element: Element | null, tagName: string): string {
        if (!element) return '';
        let el: Element | null = null;
        if (tagName.includes('\\:')) {
            el = element.querySelector(tagName);
        } else if (tagName.includes(':')) {
            const parts = tagName.split(':');
            if (parts.length === 2) {
                const [namespace, localName] = parts;
                try {
                    el = element.querySelector(`${namespace}\\:${localName}`);
                } catch {
                    try {
                        const elements = element.getElementsByTagNameNS('*', localName);
                        if (elements.length > 0) {
                            el = elements[0];
                        }
                    } catch {
                        try {
                            el = element.querySelector(localName);
                        } catch {
                            el = element.querySelector(`*[local-name()="${localName}"]`);
                        }
                    }
                }
                if (!el && namespace === 'content' && localName === 'encoded') {
                    const contentSelectors = [
                        'content\\:encoded',
                        'content:encoded',
                        '*[local-name()="encoded"]',
                        'encoded'
                    ];
                    for (const selector of contentSelectors) {
                        try {
                            el = element.querySelector(selector);
                            if (el) break;
                        } catch {
                            continue;
                        }
                    }
                }
            }
        } else {
            el = element.querySelector(tagName);
            if (!el) {
                const tagEls = element.getElementsByTagName(tagName);
                if (tagEls.length > 0) {
                    el = tagEls[0];
                } else if (element.getElementsByTagNameNS) {
                    const nsEls = element.getElementsByTagNameNS('*', tagName);
                    if (nsEls.length > 0) {
                        el = nsEls[0];
                    }
                }
            }
        }
        if (!el) return '';
        const textContent = el.textContent?.trim() || '';
        if (textContent) {
            return this.sanitizeCDATA(textContent);
        }
        return '';
    }

    private sanitizeCDATA(text: string): string {
        if (!text) return '';
        
        
        let cleaned = text
            .replace(/<!\[CDATA\[/g, '')
            .replace(/\]\]>/g, '')
            .trim();
        
        
        cleaned = this.decodeHtmlEntities(cleaned);
        
        
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        
        return cleaned;
    }

    public decodeHtmlEntities(text: string): string {
        if (!text) return '';
        
        const decoded = text
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&#x2F;/g, '/')
            .replace(/&#8230;/g, '...') 
            .replace(/&#8217;/g, '\u2019') 
            .replace(/&#8216;/g, '\u2018') 
            .replace(/&#8220;/g, '\u201C') 
            .replace(/&#8221;/g, '\u201D') 
            .replace(/&#8211;/g, '\u2013') 
            .replace(/&#8212;/g, '\u2014')
            .replace(/&#038;/g, '&')  
            .replace(/&#x26;/g, '&')  
            .replace(/&#x3c;/g, '<')  
            .replace(/&#x3e;/g, '>')  
            .replace(/&#x22;/g, '"')  
            .replace(/&#x27;/g, "'")  
            .replace(/&#x2f;/g, '/')
            .replace(/&apos;/g, "'")
            .replace(/&lsquo;/g, '\u2018')
            .replace(/&rsquo;/g, '\u2019')
            .replace(/&ldquo;/g, '\u201C')
            .replace(/&rdquo;/g, '\u201D')
            .replace(/&ndash;/g, '\u2013')
            .replace(/&mdash;/g, '\u2014')
            .replace(/&hellip;/g, '...')
            .replace(/&copy;/g, '\u00A9')
            .replace(/&reg;/g, '\u00AE')
            .replace(/&trade;/g, '\u2122')
            .replace(/&deg;/g, '\u00B0')
            .replace(/&plusmn;/g, '\u00B1')
            .replace(/&times;/g, '\u00D7')
            .replace(/&divide;/g, '\u00F7')
            .replace(/&frac12;/g, '\u00BD')
            .replace(/&frac14;/g, '\u00BC')
            .replace(/&frac34;/g, '\u00BE')
            .replace(/&sup1;/g, '\u00B9')
            .replace(/&sup2;/g, '\u00B2')
            .replace(/&sup3;/g, '\u00B3')
            .replace(/&micro;/g, '\u00B5')
            .replace(/&para;/g, '\u00B6')
            .replace(/&middot;/g, '\u00B7')
            .replace(/&bull;/g, '\u2022')
            .replace(/&dagger;/g, '\u2020')
            .replace(/&Dagger;/g, '\u2021')
            .replace(/&permil;/g, '\u2030')
            .replace(/&lsaquo;/g, '\u2039')
            .replace(/&rsaquo;/g, '\u203A')
            .replace(/&euro;/g, '\u20AC')
            .replace(/&pound;/g, '\u00A3')
            .replace(/&cent;/g, '\u00A2')
            .replace(/&curren;/g, '\u00A4')
            .replace(/&yen;/g, '\u00A5')
            .replace(/&brvbar;/g, '\u00A6')
            .replace(/&sect;/g, '\u00A7')
            .replace(/&uml;/g, '\u00A8')
            .replace(/&ordf;/g, '\u00AA')
            .replace(/&laquo;/g, '\u00AB')
            .replace(/&not;/g, '\u00AC')
            .replace(/&shy;/g, '\u00AD')
            .replace(/&macr;/g, '\u00AF')
            .replace(/&ordm;/g, '\u00BA')
            .replace(/&raquo;/g, '\u00BB')
            .replace(/&frac14;/g, '\u00BC')
            .replace(/&frac12;/g, '\u00BD')
            .replace(/&frac34;/g, '\u00BE')
            .replace(/&iquest;/g, '\u00BF')
            .replace(/&Agrave;/g, '\u00C0')
            .replace(/&Aacute;/g, '\u00C1')
            .replace(/&Acirc;/g, '\u00C2')
            .replace(/&Atilde;/g, '\u00C3')
            .replace(/&Auml;/g, '\u00C4')
            .replace(/&Aring;/g, '\u00C5')
            .replace(/&AElig;/g, '\u00C6')
            .replace(/&Ccedil;/g, '\u00C7')
            .replace(/&Egrave;/g, '\u00C8')
            .replace(/&Eacute;/g, '\u00C9')
            .replace(/&Ecirc;/g, '\u00CA')
            .replace(/&Euml;/g, '\u00CB')
            .replace(/&Igrave;/g, '\u00CC')
            .replace(/&Iacute;/g, '\u00CD')
            .replace(/&Icirc;/g, '\u00CE')
            .replace(/&Iuml;/g, '\u00CF')
            .replace(/&ETH;/g, '\u00D0')
            .replace(/&Ntilde;/g, '\u00D1')
            .replace(/&Ograve;/g, '\u00D2')
            .replace(/&Oacute;/g, '\u00D3')
            .replace(/&Ocirc;/g, '\u00D4')
            .replace(/&Otilde;/g, '\u00D5')
            .replace(/&Ouml;/g, '\u00D6')
            .replace(/&times;/g, '\u00D7')
            .replace(/&Oslash;/g, '\u00D8')
            .replace(/&Ugrave;/g, '\u00D9')
            .replace(/&Uacute;/g, '\u00DA')
            .replace(/&Ucirc;/g, '\u00DB')
            .replace(/&Uuml;/g, '\u00DC')
            .replace(/&Yacute;/g, '\u00DD')
            .replace(/&THORN;/g, '\u00DE')
            .replace(/&szlig;/g, '\u00DF')
            .replace(/&agrave;/g, '\u00E0')
            .replace(/&aacute;/g, '\u00E1')
            .replace(/&acirc;/g, '\u00E2')
            .replace(/&atilde;/g, '\u00E3')
            .replace(/&auml;/g, '\u00E4')
            .replace(/&aring;/g, '\u00E5')
            .replace(/&aelig;/g, '\u00E6')
            .replace(/&ccedil;/g, '\u00E7')
            .replace(/&egrave;/g, '\u00E8')
            .replace(/&eacute;/g, '\u00E9')
            .replace(/&ecirc;/g, '\u00EA')
            .replace(/&euml;/g, '\u00EB')
            .replace(/&igrave;/g, '\u00EC')
            .replace(/&iacute;/g, '\u00ED')
            .replace(/&icirc;/g, '\u00EE')
            .replace(/&iuml;/g, '\u00EF')
            .replace(/&eth;/g, '\u00F0')
            .replace(/&ntilde;/g, '\u00F1')
            .replace(/&ograve;/g, '\u00F2')
            .replace(/&oacute;/g, '\u00F3')
            .replace(/&ocirc;/g, '\u00F4')
            .replace(/&otilde;/g, '\u00F5')
            .replace(/&ouml;/g, '\u00F6')
            .replace(/&divide;/g, '\u00F7')
            .replace(/&oslash;/g, '\u00F8')
            .replace(/&ugrave;/g, '\u00F9')
            .replace(/&uacute;/g, '\u00FA')
            .replace(/&ucirc;/g, '\u00FB')
            .replace(/&uuml;/g, '\u00FC')
            .replace(/&yacute;/g, '\u00FD')
            .replace(/&thorn;/g, '\u00FE')
            .replace(/&yuml;/g, '\u00FF')
            .replace(/&#(\d+);/g, (match: string, dec: string) => {
                const num = parseInt(dec, 10);
                return num >= 0 && num <= 0x10FFFF ? String.fromCodePoint(num) : match;
            })
            .replace(/&#x([0-9a-fA-F]+);/g, (match: string, hex: string) => {
                const num = parseInt(hex, 16);
                return num >= 0 && num <= 0x10FFFF ? String.fromCodePoint(num) : match;
            });
        
        return decoded;
    }

    private getAttribute(element: Element | null, tagName: string, attribute: string): string {
        const el = element?.querySelector(tagName);
        return el?.getAttribute(attribute) || '';
    }

    private getTextContentWithMultipleSelectors(element: Element | null, selectors: string[]): string {
        if (!element) return '';
        
        for (const selector of selectors) {
            try {
                const el = element.querySelector(selector);
                if (el && el.textContent?.trim()) {
                    return this.sanitizeCDATA(el.textContent.trim());
                }
            } catch {
                
                continue;
            }
        }
        
        return '';
    }

    private getTextContentWithNamespace(element: Element | null, namespace: string, tagName: string): string {
        const el = element?.querySelector(`${namespace}\\:${tagName}`);
        return el?.textContent?.trim() || '';
    }

    private validateFeedStructure(doc: Document): boolean {
        
        const hasRSS = doc.querySelector('rss');
        if (hasRSS) return true;
        
        
        const hasAtom = doc.querySelector('feed');
        if (hasAtom) return true;
        
        
        const rootElement = doc.documentElement;
        const hasRDF = rootElement && 
            (rootElement.getAttribute('xmlns:rdf') || 
             rootElement.getAttribute('xmlns')?.includes('rdf'));
        if (hasRDF) return true;
        
        
        const hasChannel = doc.querySelector('channel');
        if (hasChannel) return true;
        
        
        const hasItems = doc.querySelector('item');
        if (hasItems) return true;
        
        return false;
    }

    private sanitizeText(text: string): string {
        if (!text) return '';
        
        
        let cleaned = text.replace(/<[^>]*>/g, '');
        
        
        cleaned = this.decodeHtmlEntities(cleaned);
        
        
        return cleaned.replace(/\s+/g, ' ').trim();
    }

    private convertAppUrls(url: string): string {
        
        if (url && url.startsWith('app://')) {
            return url.replace('app://', 'https://');
        }
        return url;
    }

    private extractImageFromContent(content: string): string {
        if (!content) return '';
        
        try {
            const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
            const imageUrl = imgMatch ? imgMatch[1] : '';
            return this.convertAppUrls(imageUrl);
        } catch {
            return '';
        }
    }

    private transformSageUrl(url: string): string {
        
        if (url.includes('journals.sagepub.com')) {
            
            if (url.includes('/doi/abs/')) {
                const transformedUrl = url.replace('/doi/abs/', '/doi/full/');
                
                return transformedUrl;
            }
            
            
            if (url.includes('/doi/') && !url.includes('/doi/full/')) {
                
                const transformedUrl = url.replace('/doi/', '/doi/full/');
                
                return transformedUrl;
            }
        }
        return url;
    }

    private parseRSS(doc: Document): ParsedFeed {
        const channel = doc.querySelector('channel');
        if (!channel) throw new Error('Invalid rss feed: no channel element found');

        const title = this.getTextContent(channel, 'title');
        
        
        const description = this.getTextContent(channel, 'description');
        const link = this.getTextContent(channel, 'link');
        
        
        
        
        
        const author = this.getTextContentWithMultipleSelectors(channel, [
            'author',
            'dc\\:creator',
            'dc:creator',
            '*[local-name()="creator"]'
        ]);
        
        
        const imageElement = channel.querySelector('image');
        const image = imageElement ? { url: this.getTextContent(imageElement, 'url') } : undefined;

        
        const itunesImageElement = channel.querySelector('itunes\\:image');
        const itunesImage = itunesImageElement ? { url: itunesImageElement.getAttribute('href') || '' } : undefined;
        
        const feedItunesImage = itunesImageElement ? itunesImageElement.getAttribute('href') || '' : '';
        const feedImageUrl = imageElement ? this.getTextContent(imageElement, 'url') : '';

        const items: ParsedItem[] = [];
        const itemElements = channel.querySelectorAll('item');
        

        itemElements.forEach(item => {
            const title = this.getTextContent(item, 'title');
            let link = this.getTextContent(item, 'link');
            
            
            link = this.transformSageUrl(link);
            
            let description = this.getTextContent(item, 'description');
            const pubDate = this.getTextContent(item, 'pubDate');
            const guid = this.getTextContent(item, 'guid') || link;
            
            
            if (description === 'null' || description === '') {
                description = '';
            }
            
            
            const pubYear = this.getTextContent(item, 'pubYear');
            const volume = this.getTextContent(item, 'volume');
            const issue = this.getTextContent(item, 'issue');
            const startPage = this.getTextContent(item, 'startPage');
            const endPage = this.getTextContent(item, 'endPage');
            const fileSize = this.getTextContent(item, 'fileSize');
            const authors = this.getTextContent(item, 'authors');
            
            
            const ieee = (pubYear || volume || issue || startPage || endPage || fileSize || authors) ? {
                pubYear,
                volume,
                issue,
                startPage,
                endPage,
                fileSize,
                authors
            } : undefined;
            
            
            const author = authors || this.getTextContentWithMultipleSelectors(item, [
                'author',
                'dc\\:creator',
                'dc:creator',
                '*[local-name()="creator"]'
            ]);
            
            const content = this.getTextContentWithMultipleSelectors(item, [
                'content\\:encoded',
                'content:encoded',
                '*[local-name()="encoded"]',
                'encoded'
            ]) || description;

            
            const enclosureElement = item.querySelector('enclosure');
            const enclosure = enclosureElement ? {
                url: enclosureElement.getAttribute('url') || '',
                type: enclosureElement.getAttribute('type') || '',
                length: enclosureElement.getAttribute('length') || ''
            } : undefined;

            
            const itunes = {
                duration: this.getTextContent(item, 'itunes\\:duration'),
                explicit: this.getTextContent(item, 'itunes\\:explicit'),
                image: { href: this.getAttribute(item, 'itunes\\:image', 'href') },
                category: this.getTextContent(item, 'itunes\\:category'),
                summary: this.getTextContent(item, 'itunes\\:summary'),
                episodeType: this.getTextContent(item, 'itunes\\:episodeType'),
                season: this.getTextContent(item, 'itunes\\:season'),
                episode: this.getTextContent(item, 'itunes\\:episode')
            };

            
            const itemImageElement = item.querySelector('image');
            const itemImage = itemImageElement ? { url: this.getTextContent(itemImageElement, 'url') } : undefined;

            
            let mediaImage = '';
            const mediaContentElement = item.querySelector('media\\:content');
            if (mediaContentElement) {
                const mediaUrl = mediaContentElement.getAttribute('url');
                if (mediaUrl) {
                    mediaImage = mediaUrl;
                }
            }

            
            let fallbackImage = '';
            if (!itemImage && !mediaImage) {
                fallbackImage = this.extractImageFromContent(content || description || '');
            }

            items.push({
                title,
                link,
                description,
                pubDate,
                guid,
                author,
                content,
                enclosure,
                itunes,
                image: itemImage || (mediaImage ? { url: mediaImage } : undefined) || (fallbackImage ? { url: fallbackImage } : undefined),
                category: this.getTextContent(item, 'category'),
                ieee
            });
        });

        const result: ParsedFeed = {
            title,
            description,
            link,
            author,
            image: itunesImage || image, 
            items,
            type: 'rss',
            feedItunesImage,
            feedImageUrl
        };
        
        return result;
    }

    private parseRSS1(doc: Document): ParsedFeed {
        
        const channel = doc.querySelector('channel');
        if (!channel) throw new Error('Invalid rss 1.0 feed: no channel element found');

        const title = this.getTextContent(channel, 'title');
        const description = this.getTextContent(channel, 'description');
        const link = this.getTextContent(channel, 'link');
        const author = this.getTextContent(channel, 'dc:creator') || this.getTextContent(channel, 'dc:publisher');
        
        
        let image: { url: string } | undefined;
        const imageRef = channel.querySelector('image');
        if (imageRef) {
            const imageResource = imageRef.getAttribute('rdf:resource');
            if (imageResource) {
                image = { url: this.convertAppUrls(imageResource) };
            } else {
                
                const imageUrl = this.getTextContent(imageRef, 'url');
                if (imageUrl) {
                    image = { url: this.convertAppUrls(imageUrl) };
                }
            }
        }

        const items: ParsedItem[] = [];
        
        const itemElements = Array.from(doc.getElementsByTagName('item'));

        itemElements.forEach((item, index) => {
            
            const guid = item.getAttribute('rdf:about') || 
                        this.getTextContent(item, 'guid') || 
                        this.getTextContent(item, 'link') ||
                        this.getTextContent(item, 'prism:url');
            
            const title = this.getTextContent(item, 'title') || this.getTextContent(item, 'dc:title');
            let link = this.getTextContent(item, 'link') || this.getTextContent(item, 'prism:url');
            
            
            link = this.transformSageUrl(link);
            
            
            const description = this.getTextContent(item, 'description') || 
                              this.getTextContent(item, 'content:encoded');
            
            
            const pubDate = this.getTextContent(item, 'dc:date') || 
                          this.getTextContent(item, 'pubDate');
            
            
            const authorElements = item.querySelectorAll('dc\\:creator');
            let author = '';
            if (authorElements.length > 0) {
                author = Array.from(authorElements)
                    .map(el => el.textContent?.trim())
                    .filter(text => text)
                    .join(', ');
            } else {
                
                author = this.getTextContent(item, 'dc:creator') || '';
            }
            
            
            const contentValue = this.getTextContentWithMultipleSelectors(item, [
                'content\\:encoded',
                'content:encoded',
                '*[local-name()="encoded"]',
                'encoded'
            ]) || description;

            

            items.push({
                title: title || 'Untitled',
                link: link || '#',
                description: description || '',
                pubDate: pubDate || new Date().toISOString(),
                guid: guid || link || `item-${items.length}`,
                author: author || undefined,
                content: contentValue || description || '',
                category: this.getTextContent(item, 'category')
            });
        });

        return {
            title: title || 'Unknown feed',
            description: description || '',
            link: link || '',
            author: author || undefined,
            image,
            items,
            type: 'rss',
            feedItunesImage: "",
            feedImageUrl: ""
        };
    }

    private parseAtom(doc: Document): ParsedFeed {
        
        const feed = doc.querySelector('feed');
        if (!feed) {
            
            throw new Error('Invalid atom feed: no feed element found');
        }

        const title = this.getTextContent(feed, 'title');
        const description = this.getTextContent(feed, 'subtitle');
        const link = this.getAttribute(feed, 'link[rel="alternate"]', 'href') || this.getAttribute(feed, 'link', 'href');
        const author = this.getTextContent(feed, 'author > name');
        
        const iconElement = feed.querySelector('icon');
        const image = iconElement ? { url: iconElement.textContent || '' } : undefined;

        const items: ParsedItem[] = [];
        const entryElements = Array.from(feed.getElementsByTagName('entry'));
        

        entryElements.forEach((entry, idx) => {
            const title = this.getTextContent(entry, 'title');
            let link = this.getAtomEntryLink(entry);
            link = this.transformSageUrl(link);
            const description = this.getTextContent(entry, 'summary');
            const pubDate = this.getTextContent(entry, 'published') || this.getTextContent(entry, 'updated');
            const guid = this.getTextContent(entry, 'id') || link;
            const author = this.getTextContent(entry, 'author > name');
            const content = this.getTextContent(entry, 'content') || description;

            items.push({
                title,
                link,
                description,
                pubDate,
                guid,
                author,
                content,
                category: this.getTextContent(entry, 'category')
            });
            
        });
        

        return {
            title,
            description,
            link,
            author,
            image,
            items,
            type: 'atom',
            feedItunesImage: "",
            feedImageUrl: ""
        };
    }

    private parseJSON(jsonString: string): ParsedFeed {
        try {
            const data = JSON.parse(jsonString) as JsonFeed;
            
            
            if (data.version && data.version.startsWith('https://jsonfeed.org/')) {
                return {
                    title: data.title || '',
                    description: data.description,
                    link: data.home_page_url,
                    author: data.authors?.[0]?.name,
                    image: data.icon ? { url: data.icon } : undefined,
                    items: data.items?.map((item: JsonFeedItem) => {
                        let itemUrl = item.url || '';
                        
                        itemUrl = this.transformSageUrl(itemUrl);
                        
                        return {
                            title: item.title || '',
                            link: itemUrl,
                            description: item.summary || '',
                            pubDate: item.date_published || new Date().toISOString(),
                            guid: item.id || itemUrl || '',
                            author: item.authors?.[0]?.name,
                            content: item.content_html || item.content_text || '',
                            image: item.image ? { url: item.image } : undefined,
                            category: item.category || item.tags?.[0] || ''
                        };
                    }) || [],
                    type: 'json',
                    feedItunesImage: "",
                    feedImageUrl: ""
                };
            }
            
            throw new Error('Unsupported json feed format');
        } catch (error) {
            throw new Error(`Failed to parse json feed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private fallbackParse(xmlString: string): ParsedFeed {
        try {
            
            
            
            
            
            let cleanedXml = xmlString;
            
            
            cleanedXml = cleanedXml.replace(/<\?php[\s\S]*?\?>/gi, '');
            cleanedXml = cleanedXml.replace(/<\?.*?\?>/gi, '');
            
            
            const rssStartMatch = cleanedXml.match(/<rss[^>]*>/i);
            if (rssStartMatch) {
                const rssStartIndex = cleanedXml.indexOf(rssStartMatch[0]);
                cleanedXml = cleanedXml.substring(rssStartIndex);
            }
            
            
            const rssEndMatch = cleanedXml.match(/<\/rss>/i);
            if (rssEndMatch) {
                const rssEndIndex = cleanedXml.indexOf(rssEndMatch[0]) + rssEndMatch[0].length;
                cleanedXml = cleanedXml.substring(0, rssEndIndex);
            }
            
            
            
            
            
            const channelTitleMatch = cleanedXml.match(/<channel[^>]*>[\s\S]*?<title[^>]*>([^<]+)<\/title>/i);
            const title = channelTitleMatch ? this.sanitizeCDATA(channelTitleMatch[1].trim()) : 'Unknown feed';
            
            
            const channelDescMatch = cleanedXml.match(/<channel[^>]*>[\s\S]*?<description[^>]*>([\s\S]*?)<\/description>/i);
            const description = channelDescMatch ? this.sanitizeCDATA(channelDescMatch[1].trim()) : '';
            
            
            const channelLinkMatch = cleanedXml.match(/<channel[^>]*>[\s\S]*?<link[^>]*>([^<]+)<\/link>/i);
            const link = channelLinkMatch ? channelLinkMatch[1].trim() : '';
            
            const items: ParsedItem[] = [];
            
            
            const itemMatches: RegExpMatchArray[] = [];
            
            
            const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
            let itemMatch;
            while ((itemMatch = itemRegex.exec(cleanedXml)) !== null) {
                itemMatches.push(itemMatch);
            }
            
            
            if (itemMatches.length === 0) {
                
                // Replace lookahead with compatible pattern: find items by matching content until next item/channel/rss tag
                const itemStartRegex = /<item[^>]*>/gi;
                while ((itemMatch = itemStartRegex.exec(cleanedXml)) !== null) {
                    const itemStartIndex = itemMatch.index;
                    const itemStartTag = itemMatch[0];
                    const contentStartIndex = itemStartIndex + itemStartTag.length;
                    
                    // Find where this item ends by looking for next item, channel close, or rss close
                    const remainingText = cleanedXml.substring(contentStartIndex);
                    const nextItemMatch = remainingText.match(/<item[^>]*>/i);
                    const channelCloseMatch = remainingText.match(/<\/channel>/i);
                    const rssCloseMatch = remainingText.match(/<\/rss>/i);
                    
                    let endIndex = remainingText.length;
                    if (nextItemMatch && nextItemMatch.index !== undefined) {
                        endIndex = Math.min(endIndex, nextItemMatch.index);
                    }
                    if (channelCloseMatch && channelCloseMatch.index !== undefined) {
                        endIndex = Math.min(endIndex, channelCloseMatch.index);
                    }
                    if (rssCloseMatch && rssCloseMatch.index !== undefined) {
                        endIndex = Math.min(endIndex, rssCloseMatch.index);
                    }
                    
                    const itemContent = remainingText.substring(0, endIndex);
                    const fullMatch = itemStartTag + itemContent;
                    itemMatches.push([fullMatch, itemContent]);
                }
            }
            
            
            if (itemMatches.length === 0) {
                
                const aggressiveItemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
                while ((itemMatch = aggressiveItemRegex.exec(xmlString)) !== null) {
                    itemMatches.push(itemMatch);
                }
            }
            
            
            
            itemMatches.forEach((itemMatch, index) => {
                const itemXml = itemMatch[1];
                
                
                let itemAuthor = '';
                let itemPubDate = '';
                let itemGuid = '';
                
                const itemTitleMatch = itemXml.match(/<title[^>]*>([^<]+)<\/title>/i);
                if (!itemTitleMatch) {
                    
                    return;
                }
                
                const itemTitle = this.sanitizeCDATA(itemTitleMatch[1].trim());
                
                
                const itemLinkMatch = itemXml.match(/<link[^>]*>([^<]+)<\/link>/i);
                let itemLink = itemLinkMatch ? itemLinkMatch[1].trim() : '#';
                
                
                itemLink = this.transformSageUrl(itemLink);
                
                const itemDescMatch = itemXml.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
                let itemDescription = itemDescMatch ? this.sanitizeCDATA(itemDescMatch[1].trim()) : '';
                if (itemDescription === 'null' || itemDescription === '') {
                    itemDescription = '';
                }
                
                const itemPubDateMatch = itemXml.match(/<pubDate[^>]*>([^<]+)<\/pubDate>/i);
                itemPubDate = itemPubDateMatch ? itemPubDateMatch[1].trim() : new Date().toISOString();
                
                const itemGuidMatch = itemXml.match(/<guid[^>]*>([^<]+)<\/guid>/i);
                itemGuid = itemGuidMatch ? itemGuidMatch[1].trim() : itemLink;
                
                const authorMatches = [
                    itemXml.match(/<author[^>]*>([^<]+)<\/author>/i),
                    itemXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i),
                    itemXml.match(/<dc\\:creator[^>]*>([^<]+)<\/dc\\:creator>/i),
                    itemXml.match(/<dc:creator[^>]*><!\[CDATA\[([^\]]*)\]\]><\/dc:creator>/i),
                    itemXml.match(/<dc\\:creator[^>]*><!\[CDATA\[([^\]]*)\]\]><\/dc\\:creator>/i)
                ];
                for (const match of authorMatches) {
                    if (match) {
                        itemAuthor = this.sanitizeCDATA(match[1].trim());
                        break;
                    }
                }
                
                const itemCategoryMatch = itemXml.match(/<category[^>]*>([^<]+)<\/category>/i);
                const itemCategory = itemCategoryMatch ? this.sanitizeCDATA(itemCategoryMatch[1].trim()) : '';
                
                const pubYearMatch = itemXml.match(/<pubYear[^>]*>([^<]+)<\/pubYear>/i);
                const pubYear = pubYearMatch ? this.sanitizeCDATA(pubYearMatch[1].trim()) : '';
                const volumeMatch = itemXml.match(/<volume[^>]*>([^<]+)<\/volume>/i);
                const volume = volumeMatch ? this.sanitizeCDATA(volumeMatch[1].trim()) : '';
                const issueMatch = itemXml.match(/<issue[^>]*>([^<]+)<\/issue>/i);
                const issue = issueMatch ? this.sanitizeCDATA(issueMatch[1].trim()) : '';
                const startPageMatch = itemXml.match(/<startPage[^>]*>([^<]+)<\/startPage>/i);
                const startPage = startPageMatch ? this.sanitizeCDATA(startPageMatch[1].trim()) : '';
                const endPageMatch = itemXml.match(/<endPage[^>]*>([^<]+)<\/endPage>/i);
                const endPage = endPageMatch ? this.sanitizeCDATA(endPageMatch[1].trim()) : '';
                const fileSizeMatch = itemXml.match(/<fileSize[^>]*>([^<]+)<\/fileSize>/i);
                const fileSize = fileSizeMatch ? this.sanitizeCDATA(fileSizeMatch[1].trim()) : '';
                const authorsMatch = itemXml.match(/<authors[^>]*>([^<]+)<\/authors>/i);
                const authors = authorsMatch ? this.sanitizeCDATA(authorsMatch[1].trim()) : '';
                const ieee = (pubYear || volume || issue || startPage || endPage || fileSize || authors) ? {
                    pubYear,
                    volume,
                    issue,
                    startPage,
                    endPage,
                    fileSize,
                    authors
                } : undefined;
                if (authors && !itemAuthor) {
                    itemAuthor = authors;
                }
                items.push({
                    title: itemTitle,
                    link: itemLink,
                    description: itemDescription,
                    pubDate: itemPubDate,
                    guid: itemGuid,
                    author: itemAuthor || undefined,
                    content: itemDescription,
                    category: itemCategory,
                    ieee
                });
            });
            
            
            
            return {
                title,
                description,
                link,
                author: undefined,
                image: undefined,
                items,
                type: 'rss',
                feedItunesImage: "",
                feedImageUrl: ""
            };
        } catch (error) {
            
            throw new Error(`Fallback parsing failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private extractRssContent(xmlString: string): string {
        
        
        
        let rssContent = '';
        
        
        const rssMatch = xmlString.match(/<rss[^>]*>[\s\S]*?<\/rss>/i);
        if (rssMatch) {
            rssContent = rssMatch[0];
            
        } else {
            
            const channelMatch = xmlString.match(/<channel[^>]*>[\s\S]*?<\/channel>/i);
            if (channelMatch) {
                rssContent = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0">${channelMatch[0]}</rss>`;
                
            } else {
                
                const itemMatches = xmlString.match(/<item[^>]*>[\s\S]*?<\/item>/gi);
                if (itemMatches && itemMatches.length > 0) {
                    
                    
                    
                    const titleMatch = xmlString.match(/<title[^>]*>([^<]+)<\/title>/i);
                    const descMatch = xmlString.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
                    const linkMatch = xmlString.match(/<link[^>]*>([^<]+)<\/link>/i);
                    
                    const title = titleMatch ? titleMatch[1].trim() : 'Unknown feed';
                    const description = descMatch ? descMatch[1].trim() : '';
                    const link = linkMatch ? linkMatch[1].trim() : '';
                    
                    rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
    <title>${title}</title>
    <description>${description}</description>
    <link>${link}</link>
    ${itemMatches.join('\n    ')}
</channel>
</rss>`;
                }
            }
        }
        
        if (rssContent) {
            
            return rssContent;
        }
        
        
        return xmlString;
    }

    private preprocessXmlContent(xmlString: string): string {
        let processed = xmlString;
        
        processed = processed.replace(/^\uFEFF/, '');

        
            const xmlDeclMatch = processed.match(/<\?xml[^>]*\?>/);
        let xmlDecl = '';
        if (xmlDeclMatch) {
            xmlDecl = xmlDeclMatch[0];
        }
        
        processed = processed.replace(/<\?.*?\?>/g, '');
        
        if (xmlDecl) {
            processed = xmlDecl + processed;
        }

        
        
        processed = processed.trim();

        
        if (!xmlDecl) {
            const rssStartMatch = processed.match(/<rss[^>]*>/i);
            if (rssStartMatch) {
                const rssStartIndex = processed.indexOf(rssStartMatch[0]);
                processed = processed.substring(rssStartIndex);
            }
        }

        
        const rssCloseMatch = processed.match(/<\/rss>/i);
        if (rssCloseMatch) {
            const rssCloseIndex = processed.indexOf(rssCloseMatch[0]) + rssCloseMatch[0].length;
            processed = processed.substring(0, rssCloseIndex);
        }

        
        // Only escape bare ampersands that are not already part of an entity and not inside CDATA
        processed = processed.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (m: string) => m.replace(/&/g, '__AMP__'));
        // Replace lookahead with compatible pattern: match & and check if it's followed by valid entity pattern
        processed = processed.replace(/&/g, (match: string, offset: number, string: string) => {
            const remaining = string.substring(offset + 1);
            // Check if this ampersand is part of a valid entity
            if (remaining.match(/^(amp|lt|gt|quot|apos);/)) {
                return match; // Already valid entity
            }
            if (remaining.match(/^#\d+;/)) {
                return match; // Already valid numeric entity
            }
            if (remaining.match(/^#x[0-9a-fA-F]+;/i)) {
                return match; // Already valid hex entity
            }
            return '&amp;'; // Escape bare ampersand
        });
        processed = processed.replace(/__AMP__/g, '&');

        
        if (!processed.startsWith('<?xml')) {
            processed = '<?xml version="1.0" encoding="UTF-8"?>' + processed;
        }

        return processed;
    }

    parseString(xmlString: string): ParsedFeed {
        try {
            
            
            if (xmlString.trim().startsWith('{')) {
                
                return this.parseJSON(xmlString);
            }

            const cleanedXml = this.preprocessXmlContent(xmlString.trim());
            

            const doc = this.parseXML(cleanedXml);
            

            const parserError = doc.querySelector('parsererror');
            if (parserError) {
                
                
                const extractedXml = this.extractRssContent(xmlString);
                if (extractedXml !== xmlString) {
                    try {
                        const extractedDoc = this.parseXML(extractedXml);
                        const extractedParserError = extractedDoc.querySelector('parsererror');
                        if (!extractedParserError && this.validateFeedStructure(extractedDoc)) {
                            const rootElement = extractedDoc.documentElement;
                            const isRDF = rootElement && rootElement.tagName.toLowerCase() === 'rdf:rdf';
                            if (isRDF) {
                                
                                return this.parseRSS1(extractedDoc);
                            } else if (extractedDoc.querySelector('rss')) {
                                
                                return this.parseRSS(extractedDoc);
                            } else if (extractedDoc.querySelector('feed')) {
                                
                                return this.parseAtom(extractedDoc);
                            }
                        }
                    } catch (extractError) {
                        console.error('[RSS dashboard] parseString: Error in fallback extraction', extractError);
                    }
                }
                
                return this.fallbackParse(xmlString);
            }

            if (!this.validateFeedStructure(doc)) {
                
                return this.fallbackParse(xmlString);
            }

            const rootElement = doc.documentElement;
            const isRDF = rootElement && (
                rootElement.tagName.toLowerCase() === 'rdf:rdf' ||
                rootElement.getAttribute('xmlns') === 'http://purl.org/rss/1/'
            );
            
            if (isRDF) {
                
                return this.parseRSS1(doc);
            } else if (doc.querySelector('rss')) {
                
                return this.parseRSS(doc);
            } else if (doc.querySelector('feed')) {
                
                return this.parseAtom(doc);
            } else {
                
                return this.fallbackParse(xmlString);
            }
        } catch (error) {
            console.error('[RSS dashboard] parseString error:', error);
            try {
                return this.fallbackParse(xmlString);
            } catch (fallbackError) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                throw new Error(`All parsing attempts failed: ${errorMsg}. Fallback error: ${fallbackMsg}`);
            }
        }
    }

    private getAtomEntryLink(entry: Element): string {
        
        let el = entry.querySelector('link[rel="alternate"][type="text/html"]');
        if (el && el.getAttribute('href')) return el.getAttribute('href') || '';
        
        el = entry.querySelector('link[rel="alternate"]');
        if (el && el.getAttribute('href')) return el.getAttribute('href') || '';
        
        el = entry.querySelector('link[href]');
        if (el && el.getAttribute('href')) return el.getAttribute('href') || '';
        return '';
    }
}

export class FeedParser {
    private mediaSettings: MediaSettings;
    private availableTags: Tag[];
    private parser: CustomXMLParser;
    
    constructor(mediaSettings: MediaSettings, availableTags: Tag[]) {
        this.mediaSettings = mediaSettings;
        this.availableTags = availableTags;
        this.parser = new CustomXMLParser();
    }
    
    
    private convertToAbsoluteUrl(relativeUrl: string, baseUrl: string): string {
        if (!relativeUrl || !baseUrl) return relativeUrl;
        
        
        if (relativeUrl.startsWith('app://')) {
            return relativeUrl.replace('app://', 'https://');
        }
        
        
        if (relativeUrl.startsWith('//')) {
            return 'https:' + relativeUrl;
        }
        
        
        if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
            return relativeUrl;
        }
        
        try {
            
            const base = new URL(baseUrl);
            
            
            if (relativeUrl.startsWith('/')) {
                return `${base.protocol}//${base.host}${relativeUrl}`;
            }
            
            
            return new URL(relativeUrl, base).href;
        } catch {
            
            return relativeUrl;
        }
    }

    private decodeHtmlEntities(text: string): string {
        if (!text) return '';
        
        const decoded = text
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&#x2F;/g, '/')
            .replace(/&#8230;/g, '...') 
            .replace(/&#8217;/g, '\u2019') 
            .replace(/&#8216;/g, '\u2018') 
            .replace(/&#8220;/g, '\u201C') 
            .replace(/&#8221;/g, '\u201D') 
            .replace(/&#8211;/g, '\u2013') 
            .replace(/&#8212;/g, '\u2014')
            .replace(/&#038;/g, '&')  
            .replace(/&#x26;/g, '&')  
            .replace(/&#x3c;/g, '<')  
            .replace(/&#x3e;/g, '>')  
            .replace(/&#x22;/g, '"')  
            .replace(/&#x27;/g, "'")  
            .replace(/&#x2f;/g, '/')
            .replace(/&apos;/g, "'")
            .replace(/&lsquo;/g, '\u2018')
            .replace(/&rsquo;/g, '\u2019')
            .replace(/&ldquo;/g, '\u201C')
            .replace(/&rdquo;/g, '\u201D')
            .replace(/&ndash;/g, '\u2013')
            .replace(/&mdash;/g, '\u2014')
            .replace(/&hellip;/g, '...')
            .replace(/&copy;/g, '\u00A9')
            .replace(/&reg;/g, '\u00AE')
            .replace(/&trade;/g, '\u2122')
            .replace(/&deg;/g, '\u00B0')
            .replace(/&plusmn;/g, '\u00B1')
            .replace(/&times;/g, '\u00D7')
            .replace(/&divide;/g, '\u00F7')
            .replace(/&frac12;/g, '\u00BD')
            .replace(/&frac14;/g, '\u00BC')
            .replace(/&frac34;/g, '\u00BE')
            .replace(/&sup1;/g, '\u00B9')
            .replace(/&sup2;/g, '\u00B2')
            .replace(/&sup3;/g, '\u00B3')
            .replace(/&micro;/g, '\u00B5')
            .replace(/&para;/g, '\u00B6')
            .replace(/&middot;/g, '\u00B7')
            .replace(/&bull;/g, '\u2022')
            .replace(/&dagger;/g, '\u2020')
            .replace(/&Dagger;/g, '\u2021')
            .replace(/&permil;/g, '\u2030')
            .replace(/&lsaquo;/g, '\u2039')
            .replace(/&rsaquo;/g, '\u203A')
            .replace(/&euro;/g, '\u20AC')
            .replace(/&pound;/g, '\u00A3')
            .replace(/&cent;/g, '\u00A2')
            .replace(/&curren;/g, '\u00A4')
            .replace(/&yen;/g, '\u00A5')
            .replace(/&brvbar;/g, '\u00A6')
            .replace(/&sect;/g, '\u00A7')
            .replace(/&uml;/g, '\u00A8')
            .replace(/&ordf;/g, '\u00AA')
            .replace(/&laquo;/g, '\u00AB')
            .replace(/&not;/g, '\u00AC')
            .replace(/&shy;/g, '\u00AD')
            .replace(/&macr;/g, '\u00AF')
            .replace(/&ordm;/g, '\u00BA')
            .replace(/&raquo;/g, '\u00BB')
            .replace(/&frac14;/g, '\u00BC')
            .replace(/&frac12;/g, '\u00BD')
            .replace(/&frac34;/g, '\u00BE')
            .replace(/&iquest;/g, '\u00BF')
            .replace(/&Agrave;/g, '\u00C0')
            .replace(/&Aacute;/g, '\u00C1')
            .replace(/&Acirc;/g, '\u00C2')
            .replace(/&Atilde;/g, '\u00C3')
            .replace(/&Auml;/g, '\u00C4')
            .replace(/&Aring;/g, '\u00C5')
            .replace(/&AElig;/g, '\u00C6')
            .replace(/&Ccedil;/g, '\u00C7')
            .replace(/&Egrave;/g, '\u00C8')
            .replace(/&Eacute;/g, '\u00C9')
            .replace(/&Ecirc;/g, '\u00CA')
            .replace(/&Euml;/g, '\u00CB')
            .replace(/&Igrave;/g, '\u00CC')
            .replace(/&Iacute;/g, '\u00CD')
            .replace(/&Icirc;/g, '\u00CE')
            .replace(/&Iuml;/g, '\u00CF')
            .replace(/&ETH;/g, '\u00D0')
            .replace(/&Ntilde;/g, '\u00D1')
            .replace(/&Ograve;/g, '\u00D2')
            .replace(/&Oacute;/g, '\u00D3')
            .replace(/&Ocirc;/g, '\u00D4')
            .replace(/&Otilde;/g, '\u00D5')
            .replace(/&Ouml;/g, '\u00D6')
            .replace(/&times;/g, '\u00D7')
            .replace(/&Oslash;/g, '\u00D8')
            .replace(/&Ugrave;/g, '\u00D9')
            .replace(/&Uacute;/g, '\u00DA')
            .replace(/&Ucirc;/g, '\u00DB')
            .replace(/&Uuml;/g, '\u00DC')
            .replace(/&Yacute;/g, '\u00DD')
            .replace(/&THORN;/g, '\u00DE')
            .replace(/&szlig;/g, '\u00DF')
            .replace(/&agrave;/g, '\u00E0')
            .replace(/&aacute;/g, '\u00E1')
            .replace(/&acirc;/g, '\u00E2')
            .replace(/&atilde;/g, '\u00E3')
            .replace(/&auml;/g, '\u00E4')
            .replace(/&aring;/g, '\u00E5')
            .replace(/&aelig;/g, '\u00E6')
            .replace(/&ccedil;/g, '\u00E7')
            .replace(/&egrave;/g, '\u00E8')
            .replace(/&eacute;/g, '\u00E9')
            .replace(/&ecirc;/g, '\u00EA')
            .replace(/&euml;/g, '\u00EB')
            .replace(/&igrave;/g, '\u00EC')
            .replace(/&iacute;/g, '\u00ED')
            .replace(/&icirc;/g, '\u00EE')
            .replace(/&iuml;/g, '\u00EF')
            .replace(/&eth;/g, '\u00F0')
            .replace(/&ntilde;/g, '\u00F1')
            .replace(/&ograve;/g, '\u00F2')
            .replace(/&oacute;/g, '\u00F3')
            .replace(/&ocirc;/g, '\u00F4')
            .replace(/&otilde;/g, '\u00F5')
            .replace(/&ouml;/g, '\u00F6')
            .replace(/&divide;/g, '\u00F7')
            .replace(/&oslash;/g, '\u00F8')
            .replace(/&ugrave;/g, '\u00F9')
            .replace(/&uacute;/g, '\u00FA')
            .replace(/&ucirc;/g, '\u00FB')
            .replace(/&uuml;/g, '\u00FC')
            .replace(/&yacute;/g, '\u00FD')
            .replace(/&thorn;/g, '\u00FE')
            .replace(/&yuml;/g, '\u00FF')
            .replace(/&#(\d+);/g, (match: string, dec: string) => {
                const num = parseInt(dec, 10);
                return num >= 0 && num <= 0x10FFFF ? String.fromCodePoint(num) : match;
            })
            .replace(/&#x([0-9a-fA-F]+);/g, (match: string, hex: string) => {
                const num = parseInt(hex, 16);
                return num >= 0 && num <= 0x10FFFF ? String.fromCodePoint(num) : match;
            });
        
        return decoded;
    }

    
    private convertRelativeUrlsInContent(content: string, baseUrl: string): string {
        if (!content || !baseUrl) return content;
        
        try {
            
            content = content.replace(
                /app:\/\//g,
                'https://'
            );
            
            
            content = content.replace(
                /<img([^>]+)src=["']([^"']+)["']/gi,
                (match: string, attributes: string, src: string) => {
                    
                    const decodedSrc = this.parser.decodeHtmlEntities(src);
                    const absoluteSrc = this.convertToAbsoluteUrl(decodedSrc, baseUrl);
                    return `<img${attributes}src="${absoluteSrc}"`;
                }
            );
            
            
            content = content.replace(
                /<source([^>]+)srcset=["']([^"']+)["']/gi,
                (match: string, attributes: string, srcset: string) => {
                    
                    const processedSrcset = srcset.split(',').map((part: string) => {
                        const trimmedPart = part.trim();
                        
                        const urlMatch = trimmedPart.match(/^([^\s]+)(\s+\d+w)?$/);
                        if (urlMatch) {
                            const url = urlMatch[1];
                            const sizeDescriptor = urlMatch[2] || '';
                            
                            const decodedUrl = this.parser.decodeHtmlEntities(url);
                            const absoluteUrl = this.convertToAbsoluteUrl(decodedUrl, baseUrl);
                            return absoluteUrl + sizeDescriptor;
                        }
                        return trimmedPart;
                    }).join(', ');
                    return `<source${attributes}srcset="${processedSrcset}"`;
                }
            );
            
            
            content = content.replace(
                /<a([^>]+)href=["']([^"']+)["']/gi,
                (match: string, attributes: string, href: string) => {
                    
                    const decodedHref = this.decodeHtmlEntities(href);
                    const absoluteHref = this.convertToAbsoluteUrl(decodedHref, baseUrl);
                    return `<a${attributes}href="${absoluteHref}"`;
                }
            );
            
            return content;
        } catch {
            
            return content;
        }
    }
    
    
    private extractCoverImage(html: string, baseUrl = ''): string {
        if (!html) return "";
        
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            
            const ogImage = doc.querySelector('meta[property="og:image"]');
            if (ogImage?.getAttribute("content")) {
                const content = ogImage.getAttribute("content");
                if (content && content.startsWith("http")) {
                    return content;
                } else if (content && baseUrl) {
                    return this.convertToAbsoluteUrl(content, baseUrl);
                }
            }
            
            
            const twitterImage = doc.querySelector('meta[name="twitter:image"]');
            if (twitterImage?.getAttribute("content")) {
                const content = twitterImage.getAttribute("content");
                if (content && content.startsWith("http")) {
                    return content;
                } else if (content && baseUrl) {
                    return this.convertToAbsoluteUrl(content, baseUrl);
                }
            }

            
            const firstImg = doc.querySelector("img");
            if (firstImg?.getAttribute("src")) {
                const src = firstImg.getAttribute("src");
                if (src && src.startsWith("http")) {
                    return src;
                } else if (src && baseUrl) {
                    return this.convertToAbsoluteUrl(src, baseUrl);
                }
            }
            
            
            const imgTags = doc.querySelectorAll("img");
            for (const img of Array.from(imgTags)) {
                const src = img.getAttribute("src");
                if (src && src.startsWith("http") && 
                    (src.endsWith(".jpg") || src.endsWith(".jpeg") || 
                     src.endsWith(".png") || src.endsWith(".gif") || 
                     src.endsWith(".webp") || src.includes("image"))) {
                    return src;
                } else if (src && baseUrl && 
                    (src.endsWith(".jpg") || src.endsWith(".jpeg") || 
                     src.endsWith(".png") || src.endsWith(".gif") || 
                     src.endsWith(".webp") || src.includes("image"))) {
                    return this.convertToAbsoluteUrl(src, baseUrl);
                }
            }
        } catch {
            // Image extraction failed
        }

        return "";
    }

    
    private extractPodcastCoverImage(item: ParsedItem, feedImage: { url: string } | string | undefined, baseUrl: string): string {
        
        if (item.itunes?.image?.href) {
            const itunesImage = this.convertToAbsoluteUrl(item.itunes.image.href, baseUrl);
            if (itunesImage) {
                return itunesImage;
            }
        }

        
        if (item.image?.url) {
            const itemImage = this.convertToAbsoluteUrl(item.image.url, baseUrl);
            if (itemImage) {
              
                return itemImage;
            }
        }

        
        if (feedImage) {
            let feedImageUrl = '';
            if (typeof feedImage === 'string') {
                feedImageUrl = feedImage;
            } else if (feedImage.url) {
                feedImageUrl = feedImage.url;
            }
            
            if (feedImageUrl) {
                const convertedUrl = this.convertToAbsoluteUrl(feedImageUrl, baseUrl);
                if (convertedUrl) {
                 
                    return convertedUrl;
                }
            }
        }

        
        const contentImage = this.extractCoverImage(item.content || item.description || '', baseUrl);
        if (contentImage) {
            
            return contentImage;
        }


        return "";
    }
    
    
    private extractSummary(description: string, maxLength = 220): string {
        if (!description) return "";
        
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(description, "text/html");
            let text = doc.body.textContent || "";
            
            
            text = this.decodeHtmlEntities(text);
            
            
            text = text.replace(/\s+/g, ' ').trim();
            
            
            if (text.length > maxLength) {
                text = text.substring(0, maxLength) + '...';
            }
            
            return text;
        } catch {
            
            return "";
        }
    }
    
    
    async parseFeed(url: string, existingFeed: Feed | null = null): Promise<Feed> {
        if (!url) {
            throw new Error("Feed url is required");
        }
        
        const responseText = await fetchFeedXml(url);
        const parsed = this.parser.parseString(responseText);
        const feedTitle = existingFeed?.title || parsed.title || "Unnamed feed";
          
            const newFeed: Feed = existingFeed || {
                title: feedTitle,
                url: url,
                folder: "Uncategorized",
                items: [],
                lastUpdated: Date.now()
            };

            
            const existingItems = new Map<string, FeedItem>();
            if (existingFeed) {
                existingFeed.items.forEach(item => {
                    existingItems.set(item.guid, item);
                });
            }

            
            const newItems: FeedItem[] = [];
            const updatedItems: FeedItem[] = [];

            parsed.items.forEach((item: ParsedItem) => {
                
                const isAudioEnclosure = item.enclosure?.type?.startsWith('audio/');
                const isAudioLink = !!(item.link && item.link.includes('.mp3'));
            const isPodcast = isAudioEnclosure || isAudioLink;

                const audioUrl = isAudioEnclosure
                    ? this.convertToAbsoluteUrl(item.enclosure?.url || '', url)
                    : isAudioLink
                        ? this.convertToAbsoluteUrl(item.link || '', url)
                        : undefined;

                const enclosure = item.enclosure || (isAudioLink ? {
                    url: this.convertToAbsoluteUrl(item.link || '', url),
                    type: 'audio/mpeg',
                    length: ''
                } : undefined);

                const itemGuid = this.convertToAbsoluteUrl(item.guid || item.link || '', url);
                const existingItem = existingItems.get(itemGuid);
                
                if (existingItem) {
                    let coverImage = existingItem.coverImage;
                    if (isPodcast) {
                        coverImage = this.extractPodcastCoverImage(item, parsed.image, url) || existingItem.coverImage;
                    } else {
                        coverImage = this.extractCoverImage(item.content || item.description || '', url)
                            || this.convertToAbsoluteUrl(item.itunes?.image?.href || item.image?.url || '', url)
                            || (parsed.image && typeof parsed.image === 'object' && parsed.image.url ? this.convertToAbsoluteUrl(parsed.image.url, url) : '')
                            || existingItem.coverImage;
                    }
                    const updatedItem: FeedItem = {
                        ...existingItem,
                        title: item.title || existingItem.title,
                        description: this.convertRelativeUrlsInContent(item.description || '', url),
                        content: this.convertRelativeUrlsInContent(item.content || '', url),
                        pubDate: item.pubDate || existingItem.pubDate,
                        author: item.author || parsed.author || existingItem.author,
                        read: existingItem.read,
                        starred: existingItem.starred,
                        tags: existingItem.tags,
                        saved: existingItem.saved,
                        feedTitle: newFeed.title, // Update feedTitle to match the new feed title
                        coverImage,
                        summary: this.extractSummary(item.content || item.description || '') || existingItem.summary,
                        image: this.convertToAbsoluteUrl(item.itunes?.image?.href || item.image?.url || parsed.image?.url || '', url) || existingItem.image,
                        duration: item.itunes?.duration || existingItem.duration,
                        explicit: item.itunes?.explicit === 'yes' || existingItem.explicit,
                        category: item.itunes?.category || existingItem.category,
                        episodeType: item.itunes?.episodeType || existingItem.episodeType,
                        season: item.itunes?.season ? Number(item.itunes.season) : existingItem.season,
                        episode: item.itunes?.episode ? Number(item.itunes.episode) : existingItem.episode,
                        enclosure: enclosure ? enclosure : existingItem.enclosure,
                        ieee: item.ieee || existingItem.ieee,
                        audioUrl: audioUrl ? audioUrl : existingItem.audioUrl,
                        mediaType: isPodcast ? 'podcast' : (existingItem.mediaType || 'article'),
                    };
                    updatedItems.push(updatedItem);
                } else {
                    let coverImage = '';
                    if (isPodcast) {
                        coverImage = this.extractPodcastCoverImage(item, parsed.image, url);
                        if (!coverImage) {
                            if (parsed.feedItunesImage) {
                                coverImage = this.convertToAbsoluteUrl(parsed.feedItunesImage, url);
                            } else if (parsed.feedImageUrl) {
                                coverImage = this.convertToAbsoluteUrl(parsed.feedImageUrl, url);
                            } else if (parsed.image && typeof parsed.image === 'object' && parsed.image.url) {
                                coverImage = this.convertToAbsoluteUrl(parsed.image.url, url);
                            } else if (typeof parsed.image === 'string') {
                                coverImage = this.convertToAbsoluteUrl(parsed.image, url);
                            }
                        }
                        if (!coverImage) {
                            coverImage = this.extractCoverImage(item.content || item.description || '', url);
                        }
                    } else {
                        coverImage = this.extractCoverImage(item.content || item.description || '', url)
                            || this.convertToAbsoluteUrl(item.itunes?.image?.href || item.image?.url || '', url)
                            || (parsed.image && typeof parsed.image === 'object' && parsed.image.url ? this.convertToAbsoluteUrl(parsed.image.url, url) : '');
                    }
                    let image = this.convertToAbsoluteUrl(item.itunes?.image?.href || item.image?.url || parsed.image?.url || '', url);
                    if (!image) {
                        image = this.extractCoverImage(item.content || item.description || '', url);
                    }
                    const summary = this.extractSummary(item.content || item.description || '');
                    const newItem: FeedItem = {
                        title: item.title || 'No title',
                        link: this.convertToAbsoluteUrl(item.link || '', url),
                        description: this.convertRelativeUrlsInContent(item.description || '', url),
                        content: this.convertRelativeUrlsInContent(item.content || '', url),
                        pubDate: item.pubDate || new Date().toISOString(),
                        guid: itemGuid,
                        read: false,
                        starred: false,
                        tags: [],
                        feedTitle: newFeed.title,
                        feedUrl: newFeed.url,
                        coverImage,
                        summary,
                        author: item.author || parsed.author,
                        saved: false,
                        mediaType: isPodcast ? 'podcast' : 'article',
                         duration: item.itunes?.duration,
                        explicit: item.itunes?.explicit === 'yes',
                        image: image,
                        category: item.itunes?.category,
                        episodeType: item.itunes?.episodeType,
                        season: item.itunes?.season ? Number(item.itunes.season) : undefined,
                        episode: item.itunes?.episode ? Number(item.itunes.episode) : undefined,
                        enclosure: enclosure,
                        ieee: item.ieee,
                        audioUrl: audioUrl,
                    };
                    newItems.push(newItem);
                }
            });

            
            
            const allItems: FeedItem[] = [];
            
            
            
            if (existingFeed) {
                existingFeed.items.forEach(item => {
                    const itemGuid = this.convertToAbsoluteUrl(item.guid || item.link || '', url);
                    
                    if (!existingItems.has(itemGuid)) {
                        
                        allItems.push(item);
                    }
                });
            }
            
            
            allItems.push(...updatedItems);
            
            
            allItems.push(...newItems);

            newFeed.items = allItems;
            newFeed.lastUpdated = Date.now();

            
            this.applyFeedLimits(newFeed);

            
            const feedLogoCandidates = [
                parsed.feedItunesImage,
                parsed.feedImageUrl,
                parsed.image && typeof parsed.image === 'object' ? parsed.image.url : '',
                typeof parsed.image === 'string' ? parsed.image : ''
            ].filter(Boolean);
            const feedLogoUrl = feedLogoCandidates.length > 0 ? feedLogoCandidates[0] : '';
            const coverImageCounts: Record<string, number> = {};
            newFeed.items.forEach(item => {
                if (item.coverImage) {
                    coverImageCounts[item.coverImage] = (coverImageCounts[item.coverImage] || 0) + 1;
                }
            });
            const totalItems = newFeed.items.length;
            Object.entries(coverImageCounts).forEach(([imgUrl, count]) => {
                if (
                    imgUrl &&
                    (imgUrl === feedLogoUrl || feedLogoCandidates.includes(imgUrl)) &&
                    count >= Math.max(2, Math.floor(totalItems * 0.8))
                ) {
                    newFeed.items.forEach(item => {
                        if (item.coverImage === imgUrl) {
                            item.coverImage = '';
                        }
                    });
                }
            });
            

            
            
            const processedFeed = MediaService.detectAndProcessFeed(newFeed);
            if (processedFeed.mediaType === 'video' && !existingFeed?.folder) {
                processedFeed.folder = this.mediaSettings.defaultYouTubeFolder;
            } else if (processedFeed.mediaType === 'podcast' && !existingFeed?.folder) {
                processedFeed.folder = this.mediaSettings.defaultPodcastFolder;
            }
            return MediaService.applyMediaTags(processedFeed, this.availableTags);
    }
    
    /**
     * Apply maxItemsLimit and autoDeleteDuration to a feed's items
     */
    private applyFeedLimits(feed: Feed): void {
        
        if (feed.maxItemsLimit && feed.maxItemsLimit > 0 && feed.items.length > feed.maxItemsLimit) {
            
            const readItems = feed.items.filter(item => item.read);
            const unreadItems = feed.items.filter(item => !item.read);
            
            
            unreadItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
            
            
            const maxUnreadItems = Math.max(0, feed.maxItemsLimit - readItems.length);
            const limitedUnreadItems = unreadItems.slice(0, maxUnreadItems);
            
            
            feed.items = [...readItems, ...limitedUnreadItems];
        }

        
        if (feed.autoDeleteDuration && feed.autoDeleteDuration > 0) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - feed.autoDeleteDuration);
            
            
            const readItems = feed.items.filter(item => item.read);
            const unreadItems = feed.items.filter(item => !item.read && 
                new Date(item.pubDate).getTime() > cutoffDate.getTime()
            );
            
            feed.items = [...readItems, ...unreadItems];
        }
    }
    
    
    async refreshFeed(feed: Feed): Promise<Feed> {
        try {
            const refreshedFeed = await this.parseFeed(feed.url, feed);
            
            
            
            return refreshedFeed;
        } catch {
            
            return feed;
        }
    }
    
    
    async refreshAllFeeds(feeds: Feed[]): Promise<Feed[]> {
        const updatedFeeds: Feed[] = [];
        
        for (const feed of feeds) {
            try {
                
                const refreshedFeed = await this.refreshFeed(feed);
                updatedFeeds.push(refreshedFeed);
            } catch (error) {
                console.error(`[RSS dashboard] Error refreshing feed ${feed.title}:`, error);
                updatedFeeds.push(feed); 
            }
        }
        
        return updatedFeeds;
    }
}

export class FeedParserService {
    private static instance: FeedParserService;
    private parser: CustomXMLParser;

    private constructor() {
        this.parser = new CustomXMLParser();
    }

    public static getInstance(): FeedParserService {
        if (!FeedParserService.instance) {
            FeedParserService.instance = new FeedParserService();
        }
        return FeedParserService.instance;
    }

    private async fetchFeedXml(url: string): Promise<string> {
        const response = await requestUrl({
            url: url,
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                "Accept": "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
            }
        });

        if (!response.text) {
            throw new Error(`Failed to fetch feed: Empty response`);
        }

        return response.text;
    }

    public async parseFeed(url: string, folder: string): Promise<Feed> {
        const xml = await this.fetchFeedXml(url);
        const parsed = this.parser.parseString(xml);

            
            const isPodcast = parsed.items.some(item => 
                item.enclosure?.type?.startsWith('audio/') || 
                item.itunes?.duration || 
                item.itunes?.explicit
            );

            const items: FeedItem[] = parsed.items.map((item: ParsedItem) => ({
                title: item.title || "",
                link: item.link || "",
                description: item.description || "",
                pubDate: item.pubDate || new Date().toISOString(),
                guid: item.guid || item.link || "",
                read: false,
                starred: false,
                tags: [],
                feedTitle: parsed.title || "",
                feedUrl: url,
                coverImage: item.itunes?.image?.href || item.image?.url || "",
                mediaType: isPodcast ? 'podcast' : 'article',
                author: item.author || "",
                content: item.content || "",
                saved: false,
                
                duration: item.itunes?.duration || "",
                explicit: item.itunes?.explicit === "yes",
                image: item.itunes?.image?.href || item.image?.url || "",
                category: item.itunes?.category || "",
                summary: item.itunes?.summary || "",
                episodeType: item.itunes?.episodeType || "",
                season: item.itunes?.season ? Number(item.itunes.season) : undefined,
                episode: item.itunes?.episode ? Number(item.itunes.episode) : undefined,
                enclosure: item.enclosure ? {
                    url: item.enclosure.url,
                    type: item.enclosure.type,
                    length: item.enclosure.length
                } : undefined,
                ieee: item.ieee
            }));

            return {
                title: parsed.title || "",
                url: url,
                items: items,
                folder: folder,
                lastUpdated: Date.now(),
                mediaType: isPodcast ? 'podcast' : 'article'
            };
    }
}
