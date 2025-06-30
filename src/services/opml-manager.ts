import { Feed, Folder, FeedMetadata } from "../types/types";
import { Notice } from "obsidian";


function escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case "<": return "&lt;";
            case ">": return "&gt;";
            case "&": return "&amp;";
            case "'": return "&apos;";
            case '"': return "&quot;";
            default: return c;
        }
    });
}

export class OpmlManager {
    
    static parseOpml(opmlContent: string): { feeds: Feed[], folders: Folder[] } {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(opmlContent, "text/xml");
        
        const newFeeds: Feed[] = [];
        const folderMap: { [key: string]: Folder } = {};
        const folderHierarchy: { [key: string]: string } = {}; 
        
        
        const processOutlines = (outlines: NodeListOf<Element>, currentPath = '') => {
            for (let i = 0; i < outlines.length; i++) {
                const outline = outlines[i];
                const type = outline.getAttribute("type");
                
                
                if (!type && outline.hasChildNodes()) {
                    const folderName = outline.getAttribute("title") || 
                                      outline.getAttribute("text") || 
                                      "Unnamed Folder";
                    
                    
                    const folderPath = currentPath ? `${currentPath}/${folderName}` : folderName;
                    
                    
                    if (!folderMap[folderPath]) {
                        folderMap[folderPath] = {
                            name: folderName,
                            subfolders: []
                        };
                        
                        
                        if (currentPath) {
                            folderHierarchy[folderPath] = currentPath;
                        }
                    }
                    
                    
                    const childOutlines = outline.querySelectorAll(':scope > outline');
                    processOutlines(childOutlines, folderPath);
                }
                
                else if (type === "rss" || outline.getAttribute("xmlUrl")) {
                    const feedTitle = outline.getAttribute("title") || 
                                     outline.getAttribute("text") || 
                                     "Unnamed Feed";
                    const xmlUrl = outline.getAttribute("xmlUrl") || "";
                    const category = outline.getAttribute("category") || currentPath || "Uncategorized";
                    
                    if (xmlUrl) {
                        newFeeds.push({
                            title: feedTitle,
                            url: xmlUrl,
                            folder: category,
                            items: [],
                            lastUpdated: 0
                        });
                    }
                }
            }
        };
        
        
        const outlines = xmlDoc.querySelectorAll('body > outline');
        processOutlines(outlines);
        
        
        const rootFolders: Folder[] = [];
        const processedFolders = new Set<string>();
        
        
        const findOrCreateFolder = (path: string, folders: Folder[]): Folder | null => {
            const parts = path.split('/');
            const folderName = parts[0];
            
            
            let folder = folders.find(f => f.name === folderName);
            
            
            if (!folder) {
                folder = {
                    name: folderName,
                    subfolders: []
                };
                folders.push(folder);
            }
            
            
            if (parts.length === 1) {
                return folder;
            }
            
            
            return findOrCreateFolder(parts.slice(1).join('/'), folder.subfolders);
        };
        
        
        Object.keys(folderMap).forEach(path => {
            if (!processedFolders.has(path)) {
                const folder = folderMap[path];
                const parent = folderHierarchy[path];
                
                if (!parent) {
                    
                    rootFolders.push(folder);
                } else {
                    
                    const parentFolder = findOrCreateFolder(parent, rootFolders);
                    if (parentFolder) {
                        parentFolder.subfolders.push(folder);
                    }
                }
                
                processedFolders.add(path);
            }
        });
        
        return { feeds: newFeeds, folders: rootFolders };
    }
    
    static parseOpmlMetadata(opmlContent: string): { feeds: FeedMetadata[], folders: Folder[] } {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(opmlContent, "text/xml");
        
        const newFeeds: FeedMetadata[] = [];
        const folderMap: { [key: string]: Folder } = {};
        const folderHierarchy: { [key: string]: string } = {}; 
        
        const processOutlines = (outlines: NodeListOf<Element>, currentPath = '') => {
            for (let i = 0; i < outlines.length; i++) {
                const outline = outlines[i];
                const type = outline.getAttribute("type");
                
                if (!type && outline.hasChildNodes()) {
                    const folderName = outline.getAttribute("title") || 
                                      outline.getAttribute("text") || 
                                      "Unnamed Folder";
                    
                    const folderPath = currentPath ? `${currentPath}/${folderName}` : folderName;
                    
                    if (!folderMap[folderPath]) {
                        folderMap[folderPath] = {
                            name: folderName,
                            subfolders: []
                        };
                        
                        if (currentPath) {
                            folderHierarchy[folderPath] = currentPath;
                        }
                    }
                    
                    const childOutlines = outline.querySelectorAll(':scope > outline');
                    processOutlines(childOutlines, folderPath);
                }
                
                else if (type === "rss" || outline.getAttribute("xmlUrl")) {
                    const feedTitle = outline.getAttribute("title") || 
                                     outline.getAttribute("text") || 
                                     "Unnamed Feed";
                    const xmlUrl = outline.getAttribute("xmlUrl") || "";
                    const category = outline.getAttribute("category") || currentPath || "Uncategorized";
                    
                    if (xmlUrl) {
                        newFeeds.push({
                            title: feedTitle,
                            url: xmlUrl,
                            folder: category,
                            lastUpdated: 0,
                            importStatus: 'pending'
                        });
                    }
                }
            }
        };
        
        const outlines = xmlDoc.querySelectorAll('body > outline');
        processOutlines(outlines);
        
        const rootFolders: Folder[] = [];
        const processedFolders = new Set<string>();
        
        const findOrCreateFolder = (path: string, folders: Folder[]): Folder | null => {
            const parts = path.split('/');
            const folderName = parts[0];
            
            let folder = folders.find(f => f.name === folderName);
            
            if (!folder) {
                folder = {
                    name: folderName,
                    subfolders: []
                };
                folders.push(folder);
            }
            
            if (parts.length === 1) {
                return folder;
            }
            
            return findOrCreateFolder(parts.slice(1).join('/'), folder.subfolders);
        };
        
        Object.keys(folderMap).forEach(path => {
            if (!processedFolders.has(path)) {
                const folder = folderMap[path];
                const parent = folderHierarchy[path];
                
                if (!parent) {
                    rootFolders.push(folder);
                } else {
                    const parentFolder = findOrCreateFolder(parent, rootFolders);
                    if (parentFolder) {
                        parentFolder.subfolders.push(folder);
                    }
                }
                
                processedFolders.add(path);
            }
        });
        
        return { feeds: newFeeds, folders: rootFolders };
    }
    
    
    static async importOpml(
        opmlContent: string, 
        existingFeeds: Feed[], 
        existingFolders: Folder[]
    ): Promise<{ feeds: Feed[], folders: Folder[] }> {
        try {
            const { feeds: newFeeds, folders: newFolders } = this.parseOpml(opmlContent);
            
            
            const mergedFeeds = [...existingFeeds];
            
            
            for (const newFeed of newFeeds) {
                if (!mergedFeeds.some(f => f.url === newFeed.url)) {
                    mergedFeeds.push(newFeed);
                }
            }
            
            
            const mergedFolders = this.mergeFolders(existingFolders, newFolders);
            
            return {
                feeds: mergedFeeds,
                folders: mergedFolders
            };
        } catch (error) {
            
            throw new Error("Failed to import OPML: Invalid format");
        }
    }
    
    
    static mergeFolders(existing: Folder[], newFolders: Folder[]): Folder[] {
        const result = [...existing];
        
        
        const mergeFolderRecursive = (target: Folder[], source: Folder[]) => {
            for (const sourceFolder of source) {
                
                const existingFolder = target.find(f => f.name === sourceFolder.name);
                
                if (existingFolder) {
                    
                    mergeFolderRecursive(existingFolder.subfolders, sourceFolder.subfolders);
                } else {
                    
                    target.push({...sourceFolder});
                }
            }
        };
        
        mergeFolderRecursive(result, newFolders);
        return result;
    }
    
    
    static generateOpml(feeds: Feed[], folders: Folder[]): string {
        
        let opmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
        opmlContent += '<opml version="2.0">\n';
        opmlContent += "  <head>\n";
        opmlContent += "    <title>Obsidian RSS Dashboard Feeds</title>\n";
        opmlContent += `    <dateCreated>${new Date().toUTCString()}</dateCreated>\n`;
        opmlContent += "  </head>\n";
        opmlContent += "  <body>\n";
        
        
        const getFeedsInFolder = (folderPath: string): Feed[] => {
            return feeds.filter(feed => feed.folder === folderPath);
        };
        
        
        const buildFolderOpml = (folder: Folder, indent: number, path: string): string => {
            const indentStr = " ".repeat(indent);
            let result = '';
            
            
            const fullPath = path ? `${path}/${folder.name}` : folder.name;
            
            
            result += `${indentStr}<outline text="${escapeXml(folder.name)}" title="${escapeXml(folder.name)}">\n`;
            
            
            const folderFeeds = getFeedsInFolder(fullPath);
            for (const feed of folderFeeds) {
                result += `${indentStr}  <outline text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" type="rss" xmlUrl="${escapeXml(feed.url)}" category="${escapeXml(fullPath)}"/>\n`;
            }
            
            
            for (const subfolder of folder.subfolders) {
                result += buildFolderOpml(subfolder, indent + 2, fullPath);
            }
            
            
            result += `${indentStr}</outline>\n`;
            
            return result;
        };
        
        
        const uncategorizedFeeds = feeds.filter(feed => 
            feed.folder === "Uncategorized" || 
            !feed.folder || 
            !folders.some(f => f.name === feed.folder.split('/')[0])
        );
        
        for (const feed of uncategorizedFeeds) {
            opmlContent += `    <outline text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" type="rss" xmlUrl="${escapeXml(feed.url)}" category="${escapeXml(feed.folder)}"/>\n`;
        }
        
        
        for (const folder of folders) {
            opmlContent += buildFolderOpml(folder, 4, "");
        }
        
        opmlContent += "  </body>\n";
        opmlContent += "</opml>";
        
        return opmlContent;
    }
}
