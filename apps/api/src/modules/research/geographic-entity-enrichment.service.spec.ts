jest.mock('./geographic-reference-resolver', () => ({
  GeographicReferenceResolver: class GeographicReferenceResolver {},
}));

import { GeographicEntityEnrichmentService } from './geographic-entity-enrichment.service';

describe('GeographicEntityEnrichmentService', () => {
  const references = { extractExactFromVerifiedFact: jest.fn() };
  const service = () =>
    new GeographicEntityEnrichmentService(references as never);

  beforeEach(() => jest.resetAllMocks());

  it('enriches only supported facts through the reviewed-reference resolver', async () => {
    references.extractExactFromVerifiedFact.mockResolvedValue([
      {
        id: 'geographic-entity:strait-1',
        canonicalName: 'Strait of Example',
        aliases: [],
        entityType: 'strait',
        sourceFactIds: ['fact-1'],
        sourceSignalIds: ['signal-a', 'signal-b'],
      },
    ]);

    await expect(
      service().enrich(
        {
          id: 'fact-1',
          claim: 'The Strait of Example is a strategic waterway.',
          status: 'supported',
        },
        ['signal-b', 'signal-a'],
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        sourceFactIds: ['fact-1'],
        sourceSignalIds: ['signal-a', 'signal-b'],
      }),
    ]);
    expect(references.extractExactFromVerifiedFact).toHaveBeenCalledTimes(1);
  });

  it('fails closed for unverified facts without querying geographic references', async () => {
    await expect(
      service().enrich(
        { id: 'fact-1', claim: 'Example claim', status: 'unverified' },
        ['signal-a'],
      ),
    ).resolves.toEqual([]);
    expect(references.extractExactFromVerifiedFact).not.toHaveBeenCalled();
  });
});
