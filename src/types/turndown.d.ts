declare module 'turndown' {
  interface Rule {
    filter: (node: Node) => boolean;
    replacement: (content: string, node: Node) => string;
  }

  export default class TurndownService {
    constructor(options?: unknown);
    turndown(html: string): string;
    addRule(name: string, rule: Rule): void;
  }
} 
