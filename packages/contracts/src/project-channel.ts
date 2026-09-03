import { ContentChannelStatus } from './enums.js';

export interface ProductProfile {
  projectId: string;
  name: string;
  description: string | null;
  targetAudience: string | null;
  valueProposition: string | null;
  primaryUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentChannel {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  description: string | null;
  niche: string | null;
  status: ContentChannelStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectChannelHierarchy {
  productProfile: ProductProfile | null;
  channels: ContentChannel[];
}
