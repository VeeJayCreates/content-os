import { BadRequestException, Injectable } from '@nestjs/common';
import { VisualAssetProviderCapability } from '@content-os/contracts';

export interface VisualAssetAcquisitionProvider {
  id: string;
  enabled: boolean;
  priority: number;
  capabilities: VisualAssetProviderCapability[];
  strategies: string[];
  resultLimit: number;
  version: string;
  configurationIdentity: string;
  search(request: VisualAssetProviderSearchRequest): Promise<unknown[]>;
}

export interface VisualAssetProviderSearchRequest {
  query: string;
  mediaType: 'image' | 'video';
  orientation: string;
  limit: number;
}

export const VISUAL_ASSET_PROVIDER_FAILURE_CODES = [
  'provider_unavailable',
  'provider_network_failure',
  'provider_http_rejected',
  'provider_response_malformed',
] as const;
export type VisualAssetProviderFailureCode = typeof VISUAL_ASSET_PROVIDER_FAILURE_CODES[number];

export class VisualAssetProviderError extends Error {
  constructor(readonly code: VisualAssetProviderFailureCode) {
    super(code);
    this.name = 'VisualAssetProviderError';
  }
}

@Injectable()
export class VisualAssetAcquisitionProviderRegistry {
  validate(providers: VisualAssetAcquisitionProvider[]) {
    const ids = new Set<string>();
    return providers.map((provider) => {
      if (!provider.id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(provider.id)) throw new BadRequestException('Invalid visual asset provider configuration');
      if (ids.has(provider.id)) throw new BadRequestException('Duplicate visual asset provider ID');
      ids.add(provider.id);
      const validCapabilities = new Set(Object.values(VisualAssetProviderCapability));
      const validStrategies = new Set(['provider_search', 'source_reference', 'reusable_template']);
      if (!Number.isInteger(provider.priority) || provider.priority < 0 || provider.priority > 1000 || !Number.isInteger(provider.resultLimit) || provider.resultLimit < 1 || provider.resultLimit > 50 || !provider.version || !provider.configurationIdentity || !Array.isArray(provider.capabilities) || !Array.isArray(provider.strategies) || provider.capabilities.some((capability) => !validCapabilities.has(capability)) || provider.strategies.some((strategy) => !validStrategies.has(strategy))) throw new BadRequestException('Invalid visual asset provider configuration');
      if (typeof provider.search !== 'function') throw new BadRequestException('Invalid visual asset provider configuration');
      return { ...provider, search: provider.search.bind(provider), capabilities: [...new Set(provider.capabilities)].sort(), strategies: [...new Set(provider.strategies)].sort() };
    }).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  }

  enabled(providers: VisualAssetAcquisitionProvider[]) {
    return providers.filter((provider) => provider.enabled);
  }

  route(plan: { automaticAcquisitionAllowed: boolean; capability: VisualAssetProviderCapability | null; acquisitionStrategy: string; resultLimit: number }, providers: VisualAssetAcquisitionProvider[]) {
    if (!plan.automaticAcquisitionAllowed || !plan.capability) return [];
    return providers.filter((provider) => provider.capabilities.includes(plan.capability!) && provider.strategies.includes(plan.acquisitionStrategy)).slice(0, 1).map((provider) => ({
      id: provider.id,
      resultLimit: Math.min(plan.resultLimit, provider.resultLimit),
    }));
  }
}
