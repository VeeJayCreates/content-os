import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { VisualAssetManifestStatus, VisualAssetProviderCapability, type VisualAssetAcquisitionPlan } from '@content-os/contracts';
import { VisualAssetAcquisitionRepository, VisualAssetRepository } from '@content-os/storage';

import { VisualAssetAcquisitionProviderRegistry, VisualAssetProviderError, type VisualAssetAcquisitionProvider, type VisualAssetProviderFailureCode } from './visual-asset-acquisition-provider.registry';

export const VISUAL_ASSET_ACQUISITION_VERSION = 'visual-asset-acquisition-v1';
export const QUERY_STRATEGY_VERSION = 'visual-asset-query-v1';
export type { VisualAssetAcquisitionProvider } from './visual-asset-acquisition-provider.registry';

const RETRYABLE_EXECUTION_FAILURE_CODES = new Set([
  'provider_unavailable',
  'provider_network_failure',
  'provider_http_rejected',
  'provider_response_malformed',
  'execution_failed',
]);

const normalize = (value: string) => value.replace(/\s+/g, ' ').replace(/[\u2013\u2014]/g, '-').trim();

const additionalNonGlobalCidrs = ['100::/64', '2001:2::/48', '3fff::/20'].map(ipaddr.parseCIDR);
const isGlobalAddress = (host: string) => {
  try {
    const address = ipaddr.parse(host);
    return address.range() === 'unicast' && !additionalNonGlobalCidrs.some(([network, prefix]) => {
      if (address.kind() === 'ipv4' && network.kind() === 'ipv4') return (address as ipaddr.IPv4).match(network as ipaddr.IPv4, prefix);
      if (address.kind() === 'ipv6' && network.kind() === 'ipv6') return (address as ipaddr.IPv6).match(network as ipaddr.IPv6, prefix);
      return false;
    });
  } catch { return false; }
};

export const safeHttpsUrl = (value: string | null | undefined) => {
  if (!value) return false;
  try {
    const url = new URL(value); const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const ipVersion = isIP(host);
    return url.protocol === 'https:' && !url.username && !url.password && host !== 'localhost' &&
      (ipVersion === 0 || isGlobalAddress(host));
  } catch { return false; }
};
type AddressResolver = (hostname: string) => Promise<Array<{ address: string }>>;
export const safeResolvedHttpsUrl = async (value: string | null | undefined, resolver: AddressResolver = (hostname) => lookup(hostname, { all: true, verbatim: true })) => {
  if (!safeHttpsUrl(value)) return false;
  const host = new URL(value!).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(host)) return isGlobalAddress(host);
  try {
    const addresses = await resolver(host);
    return addresses.length > 0 && addresses.every(({ address }) => isGlobalAddress(address));
  } catch { return false; }
};
export const normalizeQueries = (primary: string | null, alternates: string[], max = 4) => [...new Set([primary, ...alternates].filter((item): item is string => Boolean(item)).map(normalize).filter((item) => item.length > 0 && item.length <= 300))].slice(0, max);
export const planRequirement = (requirement: any, limit = 10): VisualAssetAcquisitionPlan => {
  const search = ['provider_search', 'source_reference', 'reusable_template'].includes(requirement.acquisitionStrategy);
  const queries = requirement.manualReviewRequired ? [] : normalizeQueries(requirement.primarySearchQuery, requirement.alternateSearchQueries);
  const capability = requirement.expectedMediaType === 'video' ? VisualAssetProviderCapability.VIDEO_SEARCH : VisualAssetProviderCapability.IMAGE_SEARCH;
  const automaticAcquisitionAllowed = search && queries.length > 0 && !requirement.manualReviewRequired && ['image', 'video'].includes(requirement.expectedMediaType);
  return { requirementId: requirement.id, plannedSceneId: requirement.plannedSceneId, requirementType: requirement.requirementType, acquisitionStrategy: requirement.acquisitionStrategy, capability: automaticAcquisitionAllowed ? capability : null, providerIds: [], queries, expectedMediaType: requirement.expectedMediaType, targetAspectRatio: requirement.targetAspectRatio, preferredOrientation: requirement.preferredOrientation, licenceRequirements: requirement.licenceRequirements, resultLimit: Math.min(Math.max(limit, 1), 25), automaticAcquisitionAllowed, skipReason: automaticAcquisitionAllowed ? null : requirement.manualReviewRequired ? 'manual_review_required' : search ? 'missing_safe_query' : 'internal_or_manual_strategy', manualReviewReasons: requirement.reviewReasons };
};
export const normalizeProviderCandidate = async (requirement: any, result: any, resolver?: AddressResolver) => {
  const boundedText = (value: unknown, max: number) => value == null || (typeof value === 'string' && value.length <= max);
  if (!result || typeof result.provider !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(result.provider) || typeof result.providerAssetId !== 'string' || result.providerAssetId.length < 1 || result.providerAssetId.length > 300 || !await safeResolvedHttpsUrl(result.sourceUrl, resolver) || !['image', 'video'].includes(result.mediaType) || result.mediaType !== requirement.expectedMediaType) return null;
  if (typeof result.mimeType !== 'string' || !result.mimeType.toLowerCase().startsWith(`${result.mediaType}/`)) return null;
  if (![result.title, result.licenceType, result.attributionText].every((value) => boundedText(value, 1_000))) return null;
  if (![result.commercialUseAllowed, result.modificationAllowed].every((value) => value == null || typeof value === 'boolean')) return null;
  if (![result.width, result.height, result.durationMs].every((value) => value == null || (Number.isFinite(value) && value > 0))) return null;
  const rejectionReasons: string[] = [];
  const licence = requirement.licenceRequirements ?? {};
  if (licence.commercialUseRequired && result.commercialUseAllowed === false) rejectionReasons.push('commercial_use_not_allowed');
  if (licence.modificationAllowed && result.modificationAllowed === false) rejectionReasons.push('modification_not_allowed');
  const rightsUnknown = (licence.commercialUseRequired && result.commercialUseAllowed == null) || (licence.modificationAllowed && result.modificationAllowed == null);
  if (licence.attributionRequired && !result.attributionText) rejectionReasons.push('attribution_missing');
  const previewUrl = await safeResolvedHttpsUrl(result.previewUrl, resolver) ? result.previewUrl : null;
  const licenceUrl = await safeResolvedHttpsUrl(result.licenceUrl, resolver) ? result.licenceUrl : null;
  if (licence.provenanceRequired && !result.licenceType && !licenceUrl) rejectionReasons.push('provenance_review_required');
  if (licence.unknownLicenceRequiresManualReview && rightsUnknown) rejectionReasons.push('licence_review_required');
  return { provider: result.provider, providerAssetId: result.providerAssetId, sourceUrl: result.sourceUrl, previewUrl, mediaType: result.mediaType, mimeType: result.mimeType, width: result.width ?? null, height: result.height ?? null, durationMs: result.durationMs ?? null, title: result.title ?? null, licenceType: result.licenceType ?? null, licenceUrl, attributionText: result.attributionText ?? null, commercialUseAllowed: result.commercialUseAllowed ?? null, modificationAllowed: result.modificationAllowed ?? null, provenanceScore: Number.isFinite(result.providerScore) ? result.providerScore : null, overallScore: null, rejectionReasons, status: 'discovered' };
};

@Injectable()
export class VisualAssetAcquisitionService {
  private readonly inFlight = new Set<string>();
  private readonly executionInFlight = new Set<string>();
  constructor(private readonly manifests: VisualAssetRepository, private readonly runs: VisualAssetAcquisitionRepository, private readonly registry: VisualAssetAcquisitionProviderRegistry) {}

  async prepare(contentScriptId: string, providers: VisualAssetAcquisitionProvider[]) {
    if (this.inFlight.has(contentScriptId)) throw new ConflictException('Visual Asset acquisition preparation is already in progress');
    this.inFlight.add(contentScriptId);
    let runData: any;
    try {
      const manifest = await this.manifests.findByContentScriptId(contentScriptId);
      if (!manifest) throw new NotFoundException('Visual asset manifest not found');
      if (manifest.status === VisualAssetManifestStatus.STALE) throw new ConflictException('Stale visual asset manifest cannot be prepared');
      const allConfigured = this.registry.validate(providers);
      const configured = this.registry.enabled(allConfigured);
      const plans = manifest.requirements.map((requirement: any) => {
        const base = planRequirement(requirement);
        const routes = this.registry.route(base, configured);
        return routes.length ? { ...base, providerIds: routes.map((route) => route.id), resultLimit: Math.min(base.resultLimit, ...routes.map((route) => route.resultLimit)) } : base.automaticAcquisitionAllowed ? { ...base, automaticAcquisitionAllowed: false, providerIds: [], skipReason: 'no_compatible_provider' } : base;
      });
      const providerPlan = allConfigured.map(({ id, enabled, priority, capabilities, strategies, resultLimit, version, configurationIdentity }) => ({ id, enabled, priority, capabilities, strategies, resultLimit, version, configurationIdentity }));
      const inputHash = createHash('sha256').update(JSON.stringify({ version: VISUAL_ASSET_ACQUISITION_VERSION, queryStrategy: QUERY_STRATEGY_VERSION, manifestId: manifest.id, manifestInputHash: manifest.inputHash, plans, providers: providerPlan })).digest('hex');
      const compatible = await this.runs.findCompatible(manifest.id, inputHash);
      if (compatible) return compatible;
      runData = { projectId: manifest.projectId, contentScriptId, manifestId: manifest.id, manifestInputHash: manifest.inputHash, version: VISUAL_ASSET_ACQUISITION_VERSION, inputHash, requestedRequirementIds: plans.map((plan) => plan.requirementId), providerPlan, preparedQueryCount: plans.reduce((count, plan) => count + plan.queries.length, 0), providerRequestCount: 0, candidatesDiscovered: 0, candidatesAccepted: 0, candidatesRejected: 0 };
      return await this.runs.upsertPrepared(runData, plans);
    } catch (error) {
      if (runData) await this.runs.persistFailure(runData, 'preparation_failed');
      throw error;
    } finally { this.inFlight.delete(contentScriptId); }
  }


  async execute(runId: string, providers: VisualAssetAcquisitionProvider[], expectedContentScriptId?: string) {
    if (this.executionInFlight.has(runId)) throw new ConflictException('Visual Asset acquisition execution is already in progress');
    this.executionInFlight.add(runId);
    let claimed = false;
    try {
      const run: any = await this.runs.findById(runId);
      if (!run) throw new NotFoundException('Visual asset acquisition run not found');
      if (expectedContentScriptId && run.contentScriptId !== expectedContentScriptId) throw new NotFoundException('Visual asset acquisition run not found');
      const retryableFailure = run.status === 'failed' && RETRYABLE_EXECUTION_FAILURE_CODES.has(run.failureCode);
      if (run.status !== 'prepared' && !retryableFailure) throw new ConflictException('Visual asset acquisition run is not eligible for execution');
      const manifest: any = await this.manifests.findByContentScriptId(run.contentScriptId);
      if (!manifest || manifest.id !== run.manifestId || manifest.inputHash !== run.manifestInputHash || manifest.status === VisualAssetManifestStatus.STALE) throw new ConflictException('Visual asset acquisition inputs are stale');
      const configured = new Map(this.registry.validate(providers).map((provider) => [provider.id, provider]));
      const preparedProviders = new Map((Array.isArray(run.providerPlan) ? run.providerPlan : []).map((provider: any) => [provider.id, provider]));
      for (const plan of run.plans) {
        const requirement = manifest.requirements.find((item: any) => item.id === plan.requirementId && item.plannedSceneId === plan.plannedSceneId);
        const validQueries = Array.isArray(plan.queries) && plan.queries.length > 0 && plan.queries.length <= 4 && plan.queries.every((query: unknown) => typeof query === 'string' && query.length <= 300 && normalize(query) === query);
        const validProviders = Array.isArray(plan.providerIds) && plan.providerIds.length > 0 && plan.providerIds.every((id: unknown) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id));
        const guidanceQueries = requirement ? normalizeQueries(requirement.primarySearchQuery, requirement.alternateSearchQueries) : [];
        const queriesMatchGuidance = validQueries && plan.queries.every((query: string) => guidanceQueries.includes(query));
        const expectedCapability = plan.expectedMediaType === 'video' ? VisualAssetProviderCapability.VIDEO_SEARCH : VisualAssetProviderCapability.IMAGE_SEARCH;
        const identityMatches = requirement && plan.requirementType === requirement.requirementType && plan.acquisitionStrategy === requirement.acquisitionStrategy && plan.expectedMediaType === requirement.expectedMediaType;
        const providersCompatible = validProviders && plan.providerIds.length === 1 && plan.providerIds.every((id: string) => { const provider = configured.get(id); const prepared: any = preparedProviders.get(id); return Boolean(provider && prepared && provider.version === prepared.version && provider.configurationIdentity === prepared.configurationIdentity && provider.capabilities.includes(expectedCapability) && provider.strategies.includes(plan.acquisitionStrategy)); });
        if (!identityMatches || (plan.automaticAcquisitionAllowed && (plan.capability !== expectedCapability || !queriesMatchGuidance || !providersCompatible || !Number.isInteger(plan.resultLimit) || plan.resultLimit < 1 || plan.resultLimit > 25 || !['provider_search', 'source_reference', 'reusable_template'].includes(plan.acquisitionStrategy)))) throw new ConflictException('Persisted visual asset acquisition plan is invalid');
      }
      if (!await this.runs.claimExecution(run.id)) throw new ConflictException('Visual asset acquisition run is not eligible for execution');
      claimed = true;
      let providerRequestCount = 0; let successfulProviderRequests = 0; let candidatesDiscovered = 0; let candidatesAccepted = 0; let candidatesRejected = 0;
      const providerFailures = new Set<VisualAssetProviderFailureCode>();
      for (const plan of run.plans) {
        if (!plan.automaticAcquisitionAllowed || !plan.providerIds.length || !plan.queries.length) continue;
        const requirement = manifest.requirements.find((item: any) => item.id === plan.requirementId && item.plannedSceneId === plan.plannedSceneId);
        if (!requirement) continue;
        for (const providerId of plan.providerIds) {
          const provider = configured.get(providerId);
          if (!provider) continue;
          for (const query of plan.queries) {
            providerRequestCount++;
            let results: unknown[];
            try { results = await provider.search({ query, mediaType: plan.expectedMediaType, orientation: plan.preferredOrientation, limit: plan.resultLimit }); }
            catch (error) { providerFailures.add(error instanceof VisualAssetProviderError ? error.code : 'provider_network_failure'); continue; }
            if (!Array.isArray(results)) { providerFailures.add('provider_response_malformed'); continue; }
            successfulProviderRequests++;
            candidatesDiscovered += results.length;
            for (const result of results) {
              const candidate = await normalizeProviderCandidate(requirement, result);
              if (!candidate || candidate.provider !== provider.id) { candidatesRejected++; continue; }
              try { await this.manifests.upsertCandidate(plan.requirementId, candidate as any); candidatesAccepted++; }
              catch { candidatesRejected++; }
            }
          }
        }
      }
      if (providerRequestCount > 0 && successfulProviderRequests === 0) {
        const failureCode = (['provider_unavailable', 'provider_network_failure', 'provider_http_rejected', 'provider_response_malformed'] as const).find((code) => providerFailures.has(code)) ?? 'provider_network_failure';
        await this.runs.failExecution(run.id, failureCode, { providerRequestCount, candidatesDiscovered, candidatesAccepted, candidatesRejected });
        claimed = false;
        throw new ServiceUnavailableException({ statusCode: 503, error: 'Service Unavailable', code: failureCode, message: 'Visual asset provider request failed' });
      }
      return this.runs.recordExecution(run.id, { providerRequestCount, candidatesDiscovered, candidatesAccepted, candidatesRejected });
    } catch (error) {
      if (claimed) await this.runs.failExecution(runId, 'execution_failed');
      throw error;
    } finally { this.executionInFlight.delete(runId); }
  }
}
