import { requestUrl, Notice } from "obsidian";
import { Feed, FeedItem, MediaSettings, Tag } from "../types/types.js";
import { MediaService } from "./media-service";

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
            
            
            
            const feedNameMatch = baseUrl.match(/feeds\.feedburner\.com\/([^\/\?]+)/);
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
                                "Accept": "application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8"
                            }
                        });
                        
                        if (feedResponse.text && 
                            (feedResponse.text.includes('<rss') || 
                             feedResponse.text.includes('<feed') || 
                             feedResponse.text.includes('<channel'))) {
                            
                            return feedUrl;
                        }
                    } catch (error) {
                        
                        continue;
                    }
                }
            }
        }
        
        
        const feedLinkMatches = response.text.match(/<link[^>]+(?:type="application\/rss\+xml"|type="application\/atom\+xml"|type="application\/xml")[^>]+href="([^"]+)"/gi);
        
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
    } catch (e) {
        console.error("Error discovering feed URL:", e);
    }
    return null;
}

export async function fetchFeedXml(url: string): Promise<string> {
    async function tryFetch(targetUrl: string): Promise<string> {
        
        const isAndroid = /android/i.test(navigator.userAgent);
        
        
        
        const response = await requestUrl({
            url: targetUrl,
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                "Accept": "application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8"
            }
        });
        
        
        
        
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers?.['location'] || response.headers?.['Location'];
            if (location) {
                
                return await tryFetch(location);
            }
        }
        
        let xmlText: string | undefined = undefined;
        let encoding = 'utf-8';
        
        if (response.arrayBuffer) {
            const buffer = response.arrayBuffer;
            const ascii = new TextDecoder('ascii').decode(buffer.slice(0, 1024));
            const encodingMatch = ascii.match(/encoding=["']([^"']+)["']/i);
            if (encodingMatch) {
                encoding = encodingMatch[1].toLowerCase();
            }
            
            
            
            if (isAndroid && encoding !== 'utf-8' && encoding !== 'utf8') {
                
                const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
                const proxyResponse = await requestUrl({ url: allOriginsUrl, method: "GET" });
                const data = JSON.parse(proxyResponse.text);
                if (!data.contents) throw new Error('No contents from AllOrigins');
                return data.contents;
            }
            
            try {
                xmlText = new TextDecoder(encoding).decode(buffer);
            } catch (e) {
                console.warn(`[RSS] Failed to decode with encoding ${encoding}, falling back to UTF-8:`, e);
                xmlText = new TextDecoder('utf-8').decode(buffer);
            }
        }
        
        if (!xmlText && response.text) {
            xmlText = response.text;
        }
        
        if (!xmlText) {
            console.error(`[RSS] Empty response from ${targetUrl}`);
            throw new Error('Empty response from feed');
        }
        
        
        
        
        
        if (!xmlText.includes('<rss') && !xmlText.includes('<feed') && !xmlText.includes('<channel') && !xmlText.includes('<item>')) {
            console.warn(`[RSS] Response doesn't appear to be RSS/XML: ${xmlText.substring(0, 500)}`);
        }
        
        
        if (xmlText.includes('<?php') || xmlText.includes('WordPress') || xmlText.includes('wp-blog-header.php')) {
            console.warn('Received PHP file instead of RSS feed, trying alternative URLs...');
            
            
            const cleanUrl = (url: string): string => {
                return url
                    .replace(/\/feed\/?$/, '')  
                    .replace(/\/+$/, '')        
                    .replace(/\/+/g, '/')       
                    .replace(/:\/\/[^\/]+\/\/+/, '://$&'.replace('$&', url.match(/:\/\/[^\/]+/)?.[0] || '')); 
            };
            
            const baseUrl = cleanUrl(targetUrl);
            
            
            const isFeedBurner = baseUrl.includes('feeds.feedburner.com');
            const isBlogger = baseUrl.includes('blogger.com') || baseUrl.includes('blogspot.com');
            
            let alternativeUrls: string[] = [];
            
            if (isFeedBurner) {
                
                alternativeUrls = [
                    `${baseUrl}?format=xml`,
                    `${baseUrl}?fmt=xml`,
                    `${baseUrl}?type=xml`,
                    `${baseUrl}/feed`,
                    `${baseUrl}/rss`,
                    `${baseUrl}/atom`,
                    `${baseUrl}.xml`,
                    `${baseUrl}/feed.xml`,
                    `${baseUrl}/rss.xml`,
                    `${baseUrl}/atom.xml`
                ];
            } else if (isBlogger) {
                
                alternativeUrls = [
                    `${baseUrl}/feeds/posts/default?alt=rss`,
                    `${baseUrl}/feeds/posts/default?alt=atom`,
                    `${baseUrl}/feeds/posts/default`,
                    `${baseUrl}/feeds/posts/summary?alt=rss`,
                    `${baseUrl}/feeds/posts/summary?alt=atom`,
                    `${baseUrl}/feeds/posts/summary`,
                    `${baseUrl}/rss.xml`,
                    `${baseUrl}/atom.xml`,
                    `${baseUrl}/feed`,
                    `${baseUrl}/rss`
                ];
            } else {
                
                alternativeUrls = [
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
                    
                    `${baseUrl}/index.php?feed=rss2`,
                    `${baseUrl}/index.php?feed=rss`,
                    `${baseUrl}/index.php?feed=atom`
                ];
            }
            
            for (const altUrl of alternativeUrls) {
                try {
                    
                    const altResponse = await requestUrl({
                        url: altUrl,
                        method: "GET",
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                            "Accept": "application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8"
                        }
                    });
                    
                    if (altResponse.text && !altResponse.text.includes('<?php') && !altResponse.text.includes('WordPress')) {
                        
                        return altResponse.text;
                    }
                } catch (altError) {
                    
                    continue;
                }
            }
            
            
            
            const discoveredUrl = await discoverFeedUrl(baseUrl);
            if (discoveredUrl) {
                try {
                    
                    const discoveredResponse = await requestUrl({
                        url: discoveredUrl,
                        method: "GET",
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Feedbro/4.0",
                            "Accept": "application/rss+xml, application/xml, application/atom+xml, text/xml;q=0.9, */*;q=0.8"
                        }
                    });
                    
                    if (discoveredResponse.text && !discoveredResponse.text.includes('<?php') && !discoveredResponse.text.includes('WordPress')) {
                        
                        return discoveredResponse.text;
                    }
                } catch (discoveredError) {
                    
                }
            }
            
            throw new Error('All alternative feed URLs failed, received PHP file instead of RSS feed');
        }

        return xmlText;
    }
    
    try {
        try {
            return await tryFetch(url);
        } catch (err) {
            console.warn(`[RSS] First attempt failed for ${url}:`, err);
            if (/^http:\/\//i.test(url)) {
                const httpsUrl = url.replace(/^http:\/\//i, 'https://');
                if (httpsUrl !== url) {
                    return await tryFetch(httpsUrl);
                }
            }
            throw err;
        }
    } catch (error) {
        console.error(`[RSS] All direct attempts failed for ${url}:`, error);
        
        try {
            const proxyUrl = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`;
            const proxyResponse = await requestUrl({ url: proxyUrl, method: "GET" });
            return proxyResponse.text;
        } catch (proxyError) {
            console.error(`Codetabs proxy fetch failed for ${url}:`, proxyError);
            
            try {
                const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
                const proxyResponse = await requestUrl({ url: allOriginsUrl, method: "GET" });
                const data = JSON.parse(proxyResponse.text);
                if (!data.contents) throw new Error('No contents from AllOrigins');
                if (data.contents.includes('<?php') || data.contents.includes('WordPress')) {
                    throw new Error('Proxy also returned PHP file instead of RSS feed');
                }
                return data.contents;
            } catch (proxyError2) {
                console.error(`AllOrigins proxy fetch failed for ${url}:`, proxyError2);
                throw proxyError2;
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
                } catch (e) {
                    try {
                        
                        const elements = element.getElementsByTagNameNS('*', localName);
                        if (elements.length > 0) {
                            el = elements[0];
                        }
                    } catch (e2) {
                        try {
                            
                            el = element.querySelector(localName);
                        } catch (e3) {
                            
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
                        } catch (e) {
                            continue;
                        }
                    }
                }
            }
        } else {
            
            el = element.querySelector(tagName);
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
        
        
        cleaned = cleaned
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
            .replace(/\s+/g, ' ') 
            .trim();
        
        return cleaned;
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
            } catch (e) {
                
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
        
        
        return text
            .replace(/<[^>]*>/g, '') 
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&#x2F;/g, '/')
            .replace(/\s+/g, ' ') 
            .trim();
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
        } catch (error) {
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
        if (!channel) throw new Error('Invalid RSS feed: no channel element found');

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
            
            
            let author = authors || this.getTextContentWithMultipleSelectors(item, [
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

        return {
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
    }

    private parseRSS1(doc: Document): ParsedFeed {
        
        const channel = doc.querySelector('channel');
        if (!channel) throw new Error('Invalid RSS 1.0 feed: no channel element found');

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

            
            const doi = this.getTextContent(item, 'prism:doi') || this.getTextContent(item, 'dc:identifier');
            const source = this.getTextContent(item, 'dc:source');
            const publicationName = this.getTextContent(item, 'prism:publicationName');

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
            title: title || 'Unknown Feed',
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
        if (!feed) throw new Error('Invalid Atom feed: no feed element found');

        const title = this.getTextContent(feed, 'title');
        const description = this.getTextContent(feed, 'subtitle');
        const link = this.getAttribute(feed, 'link[rel="alternate"]', 'href') || this.getAttribute(feed, 'link', 'href');
        const author = this.getTextContent(feed, 'author > name');
        
        const iconElement = feed.querySelector('icon');
        const image = iconElement ? { url: iconElement.textContent || '' } : undefined;

        const items: ParsedItem[] = [];
        const entryElements = feed.querySelectorAll('entry');

        entryElements.forEach(entry => {
            const title = this.getTextContent(entry, 'title');
            let link = this.getAttribute(entry, 'link[rel="alternate"]', 'href') || this.getAttribute(entry, 'link', 'href');
            
            
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
            const data = JSON.parse(jsonString);
            
            
            if (data.version && data.version.startsWith('https://jsonfeed.org/')) {
                return {
                    title: data.title || '',
                    description: data.description,
                    link: data.home_page_url,
                    author: data.authors?.[0]?.name,
                    image: data.icon ? { url: data.icon } : undefined,
                    items: data.items?.map((item: any) => {
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
            
            throw new Error('Unsupported JSON feed format');
        } catch (error) {
            throw new Error(`Failed to parse JSON feed: ${error}`);
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
            const title = channelTitleMatch ? this.sanitizeCDATA(channelTitleMatch[1].trim()) : 'Unknown Feed';
            
            
            const channelDescMatch = cleanedXml.match(/<channel[^>]*>[\s\S]*?<description[^>]*>([\s\S]*?)<\/description>/i);
            const description = channelDescMatch ? this.sanitizeCDATA(channelDescMatch[1].trim()) : '';
            
            
            const channelLinkMatch = cleanedXml.match(/<channel[^>]*>[\s\S]*?<link[^>]*>([^<]+)<\/link>/i);
            const link = channelLinkMatch ? channelLinkMatch[1].trim() : '';
            
            const items: ParsedItem[] = [];
            
            
            let itemMatches: RegExpMatchArray[] = [];
            
            
            const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
            let itemMatch;
            while ((itemMatch = itemRegex.exec(cleanedXml)) !== null) {
                itemMatches.push(itemMatch);
            }
            
            
            if (itemMatches.length === 0) {
                
                const altItemRegex = /<item[^>]*>([\s\S]*?)(?=<item|<\/channel>|<\/rss>)/gi;
                while ((itemMatch = altItemRegex.exec(cleanedXml)) !== null) {
                    itemMatches.push(itemMatch);
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
            console.error('Fallback parsing failed:', error);
            throw new Error(`Fallback parsing failed: ${error}`);
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
                    
                    const title = titleMatch ? titleMatch[1].trim() : 'Unknown Feed';
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

        
        processed = processed.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');

        
        if (!processed.startsWith('<?xml')) {
            processed = '<?xml version="1.0" encoding="UTF-8"?>' + processed;
        }

        return processed;
    }

    async parseString(xmlString: string): Promise<ParsedFeed> {
        try {
            
            if (xmlString.trim().startsWith('{')) {
                return this.parseJSON(xmlString);
            }

            
            let cleanedXml = this.preprocessXmlContent(xmlString.trim());

            const encoding = this.detectEncoding(cleanedXml);
            const doc = this.parseXML(cleanedXml);
            
            
            const parserError = doc.querySelector('parsererror');
            if (parserError) {
                console.warn('XML parsing errors detected:', parserError.textContent);
                console.warn('Attempting RSS content extraction...');
                
                
                const extractedXml = this.extractRssContent(xmlString);
                if (extractedXml !== xmlString) {
                    try {
                        const extractedDoc = this.parseXML(extractedXml);
                        const extractedParserError = extractedDoc.querySelector('parsererror');
                        if (!extractedParserError && this.validateFeedStructure(extractedDoc)) {
                            
                            
                            
                            const rootElement = extractedDoc.documentElement;
                            const isRDF = rootElement && 
                                (rootElement.tagName.toLowerCase() === 'rdf:rdf' ||
                                 rootElement.getAttribute('xmlns:rdf') || 
                                 rootElement.getAttribute('xmlns')?.includes('rdf'));
                            
                            if (isRDF) {
                                return this.parseRSS1(extractedDoc);
                            } else if (extractedDoc.querySelector('rss')) {
                                return this.parseRSS(extractedDoc);
                            } else if (extractedDoc.querySelector('feed')) {
                                return this.parseAtom(extractedDoc);
                            }
                        }
                    } catch (extractError) {
                        console.warn('Extracted XML parsing failed:', extractError);
                    }
                }
                
                console.warn('Attempting fallback parsing');
                return this.fallbackParse(xmlString);
            }

            
            if (!this.validateFeedStructure(doc)) {
                console.warn('Invalid feed structure detected, attempting fallback parsing');
                return this.fallbackParse(xmlString);
            }

            
            const rootElement = doc.documentElement;
            const isRDF = rootElement && 
                (rootElement.tagName.toLowerCase() === 'rdf:rdf' ||
                 rootElement.getAttribute('xmlns:rdf') || 
                 rootElement.getAttribute('xmlns')?.includes('rdf'));
            
            if (isRDF) {
                return this.parseRSS1(doc);
            } else if (doc.querySelector('rss')) {
                return this.parseRSS(doc);
            } else if (doc.querySelector('feed')) {
                return this.parseAtom(doc);
            } else {
                console.warn('Unknown feed format, attempting fallback parsing');
                return this.fallbackParse(xmlString);
            }
        } catch (error) {
            console.error('Error parsing feed:', error);
            console.error('Original XML length:', xmlString.length);
            console.error('XML preview:', xmlString.substring(0, 500));
            
            try {
                return this.fallbackParse(xmlString);
            } catch (fallbackError) {
                throw new Error(`All parsing attempts failed: ${error}. Fallback error: ${fallbackError}`);
            }
        }
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
        } catch (error) {
            console.warn(`Failed to convert relative URL "${relativeUrl}" to absolute URL with base "${baseUrl}":`, error);
            return relativeUrl;
        }
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
                (match, attributes, src) => {
                    const absoluteSrc = this.convertToAbsoluteUrl(src, baseUrl);
                    return `<img${attributes}src="${absoluteSrc}"`;
                }
            );
            
            
            content = content.replace(
                /<source([^>]+)srcset=["']([^"']+)["']/gi,
                (match, attributes, srcset) => {
                    
                    const processedSrcset = srcset.split(',').map((part: string) => {
                        const trimmedPart = part.trim();
                        
                        const urlMatch = trimmedPart.match(/^([^\s]+)(\s+\d+w)?$/);
                        if (urlMatch) {
                            const url = urlMatch[1];
                            const sizeDescriptor = urlMatch[2] || '';
                            const absoluteUrl = this.convertToAbsoluteUrl(url, baseUrl);
                            return absoluteUrl + sizeDescriptor;
                        }
                        return trimmedPart;
                    }).join(', ');
                    return `<source${attributes}srcset="${processedSrcset}"`;
                }
            );
            
            
            content = content.replace(
                /<a([^>]+)href=["']([^"']+)["']/gi,
                (match, attributes, href) => {
                    const absoluteHref = this.convertToAbsoluteUrl(href, baseUrl);
                    return `<a${attributes}href="${absoluteHref}"`;
                }
            );
            
            return content;
        } catch (error) {
            console.warn(`Failed to convert relative URLs in content with base "${baseUrl}":`, error);
            return content;
        }
    }
    
    
    private extractCoverImage(html: string, baseUrl: string = ''): string {
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
        } catch (e) {
            console.error("Error extracting cover image:", e);
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
            
            
            text = text.replace(/\s+/g, ' ')
                      .replace(/&nbsp;/g, ' ')
                      .replace(/&amp;/g, '&')
                      .replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .replace(/&quot;/g, '"')
                      .replace(/&#39;/g, "'")
                      .trim();
            
            
            if (text.length > maxLength) {
                text = text.substring(0, maxLength) + '...';
            }
            
            return text;
        } catch (e) {
            console.error("Error extracting summary:", e);
            return "";
        }
    }
    
    
    async parseFeed(url: string, existingFeed: Feed | null = null): Promise<Feed> {
        if (!url) {
            throw new Error("Feed URL is required");
        }
        
        try {
           
            const responseText = await fetchFeedXml(url);
            const parsed = await this.parser.parseString(responseText);
            let feedTitle = existingFeed?.title || parsed.title || "Unnamed Feed";
          
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
                const itemGuid = this.convertToAbsoluteUrl(item.guid || item.link || '', url);
                const existingItem = existingItems.get(itemGuid);
                
                
                const isPodcast = item.itunes?.duration || item.enclosure?.type?.startsWith('audio/');
                
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
                        coverImage,
                        summary: this.extractSummary(item.content || item.description || '') || existingItem.summary,
                        image: this.convertToAbsoluteUrl(item.itunes?.image?.href || item.image?.url || parsed.image?.url || '', url) || existingItem.image,
                        duration: item.itunes?.duration || existingItem.duration,
                        explicit: item.itunes?.explicit === 'yes' || existingItem.explicit,
                        category: item.itunes?.category || existingItem.category,
                        episodeType: item.itunes?.episodeType || existingItem.episodeType,
                        season: item.itunes?.season ? Number(item.itunes.season) : existingItem.season,
                        episode: item.itunes?.episode ? Number(item.itunes.episode) : existingItem.episode,
                        enclosure: item.enclosure ? {
                            url: this.convertToAbsoluteUrl(item.enclosure.url, url),
                            type: item.enclosure.type,
                            length: item.enclosure.length
                        } : existingItem.enclosure,
                        ieee: item.ieee || existingItem.ieee
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
                        enclosure: item.enclosure ? {
                            url: this.convertToAbsoluteUrl(item.enclosure.url, url),
                            type: item.enclosure.type,
                            length: item.enclosure.length
                        } : undefined,
                        ieee: item.ieee
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
            

            
            if (this.mediaSettings.autoDetectMediaType) {
                const processedFeed = MediaService.detectAndProcessFeed(newFeed);
                
                
                if (processedFeed.mediaType === 'video' && !existingFeed?.folder) {
                    processedFeed.folder = this.mediaSettings.defaultYouTubeFolder;
                } else if (processedFeed.mediaType === 'podcast' && !existingFeed?.folder) {
                    processedFeed.folder = this.mediaSettings.defaultPodcastFolder;
                }
                
                
                return MediaService.applyMediaTags(processedFeed, this.availableTags);
            }

            return newFeed;
        } catch (error) {
            console.error(`Error parsing feed ${url}:`, error);
            throw error;
        }
    }
    
    /**
     * Apply maxItemsLimit and autoDeleteDuration to a feed's items
     */
    private applyFeedLimits(feed: Feed): void {
        
        if (feed.maxItemsLimit && feed.maxItemsLimit > 0 && feed.items.length > feed.maxItemsLimit) {
            
            feed.items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
            feed.items = feed.items.slice(0, feed.maxItemsLimit);
        }

        
        if (feed.autoDeleteDuration && feed.autoDeleteDuration > 0) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - feed.autoDeleteDuration);
            feed.items = feed.items.filter(item => 
                new Date(item.pubDate).getTime() > cutoffDate.getTime()
            );
        }
    }
    
    
    async refreshFeed(feed: Feed): Promise<Feed> {
        try {
            const refreshedFeed = await this.parseFeed(feed.url, feed);
            
            
            this.applyFeedLimits(refreshedFeed);
            
            return refreshedFeed;
        } catch (error) {
            console.error(`Error refreshing feed ${feed.title}:`, error);
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
                console.error(`Error refreshing feed ${feed.title}:`, error);
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
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch feed: ${response.statusText}`);
        }

        return await response.text();
    }

    public async parseFeed(url: string, folder: string): Promise<Feed> {
        try {
            const xml = await this.fetchFeedXml(url);
            const parsed = await this.parser.parseString(xml);

            
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
        } catch (error) {
            console.error("Error parsing feed:", error);
            throw error;
        }
    }
}
