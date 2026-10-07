export type JsonRecord = Record<string, unknown>;

export interface ResponsiveValue<T> {
  desktop?: T;
  tablet?: T;
  mobile?: T;
}

export interface BuilderSeo {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  robots?: string;
  openGraph?: JsonRecord;
  twitter?: JsonRecord;
  faq?: Array<{ id: string; question: string; answer: string; enabled?: boolean; order?: number }>;
}

export interface BuilderBlock {
  id: string;
  type: string;
  enabled?: boolean;
  order?: number;
  props?: JsonRecord;
  content?: JsonRecord;
  style?: JsonRecord;
  responsive?: JsonRecord;
  animation?: JsonRecord;
  dataSource?: JsonRecord;
  visibility?: JsonRecord;
  children?: BuilderBlock[];
}

export interface BuilderPage {
  id: string;
  name?: string;
  slug: string;
  route: string;
  status?: 'draft' | 'published' | 'archived';
  template?: string;
  seo?: BuilderSeo;
  theme?: JsonRecord;
  blocks: BuilderBlock[];
}

export interface BuilderSite {
  id?: string;
  version: number;
  schemaVersion: number;
  releaseId?: string;
  site?: JsonRecord;
  theme?: JsonRecord;
  globals?: {
    header?: BuilderBlock[];
    footer?: BuilderBlock[];
    overlays?: BuilderBlock[];
  };
  pages: BuilderPage[];
}
