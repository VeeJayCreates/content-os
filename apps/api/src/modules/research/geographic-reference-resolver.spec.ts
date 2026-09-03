jest.mock('@content-os/storage', () => ({ GeographicReferenceRepository: class {} }));
import { GeographicReferenceResolver } from './geographic-reference-resolver';

describe('GeographicReferenceResolver', () => {
  const repository = { findReadyByNames: jest.fn() };
  const resolver = () => new GeographicReferenceResolver(repository as never);

  beforeEach(() => jest.resetAllMocks());

  it('resolves one exact ready canonical or alias match with provenance', async () => {
    repository.findReadyByNames.mockResolvedValue([{ id: 'geo-1', canonicalName: 'Verified place', aliases: ['Alias'], entityType: 'strait', point: { latitude: 10, longitude: 20 }, bounds: null, geometryReference: null, provenanceSourceId: 'source-1', provenanceReference: 'record-1', version: 'geo-v1', revision: 2 }]);
    await expect(resolver().resolve([' Alias '])).resolves.toEqual([expect.objectContaining({ id: 'geo-1', geometryStatus: 'verified_point', provenance: { sourceId: 'source-1', reference: 'record-1', version: 'geo-v1', revision: 2 } })]);
  });

  it('fails closed for ambiguous and absent names', async () => {
    repository.findReadyByNames.mockResolvedValue([{ id: 'one', canonicalName: 'Same', aliases: [], entityType: 'region' }, { id: 'two', canonicalName: 'Same', aliases: [], entityType: 'region' }]);
    await expect(resolver().resolve(['Same', 'Unknown'])).resolves.toEqual([]);
  });

  it('does not query storage for an empty reference set', async () => {
    await expect(resolver().resolve([])).resolves.toEqual([]);
    expect(repository.findReadyByNames).not.toHaveBeenCalled();
  });
});
