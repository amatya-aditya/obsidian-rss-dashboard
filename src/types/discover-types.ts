export type FeedType = 
  | "Blog" | "News" | "Podcast" | "Newsletter" | "Journal" | "Magazine" 
  | "YouTube" | "Webcomic" | "Video Series" | "Documentation" | "Release Notes" 
  | "Whitepaper" | "Preprint Server" | "Conference" | "Alert Feed" | "Funding Updates" 
  | "Job Board" | "Forum" | "Tutorial Series" | "Book Releases" | "Event Listing" 
  | "Open Access Feed" | "Research Digest" | "Developer Diary" | "Opinion Column" 
  | "Interview Series" | "Vlog" | "MOOC" | "Dataset Feed" | "API Updates";

export interface FeedMetadata {
  id: string;
  title: string;
  url: string;
  imageUrl: string;
  domain: string[];        
  subdomain: string[];     
  area: string[];          
  topic: string[];         
  tags: string[];          
  type: FeedType;          
  createdAt?: string;
  summary?: string;
  rating?: number;         
}

export interface CategoryPath {
  domain: string;
  subdomain?: string;
  area?: string;
  topic?: string;
}

export interface FilterState {
  query: string;
  selectedTypes: string[];
  selectedPaths: CategoryPath[];
  selectedTags: string[];
}

export interface CheckboxTreeItem {
  id: string;
  label: string;
  children?: CheckboxTreeItem[];
  checked: boolean;
  indeterminate: boolean;
}

export interface DiscoverFilters {
  query: string;
  selectedTypes: string[];
  selectedPaths: CategoryPath[];
  selectedTags: string[];
} 
