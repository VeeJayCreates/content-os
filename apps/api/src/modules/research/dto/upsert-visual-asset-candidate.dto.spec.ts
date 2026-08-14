import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpsertVisualAssetCandidateDto } from './upsert-visual-asset-candidate.dto';

describe('UpsertVisualAssetCandidateDto', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const validate = (value: unknown) => pipe.transform(value, { type: 'body', metatype: UpsertVisualAssetCandidateDto });
  const valid = { provider: 'wikimedia', providerAssetId: 'asset-1', sourceUrl: 'https://example.test/asset', mediaType: 'image', commercialUseAllowed: true, modificationAllowed: true, width: 1920, height: 1080 };

  it('accepts bounded HTTP candidate metadata', async () => expect(validate(valid)).resolves.toMatchObject(valid));
  it.each([
    [{ ...valid, sourceUrl: 'file:///C:/private.wav' }],
    [{ ...valid, sourceUrl: 'https://example.test/asset', width: -1 }],
    [{ ...valid, mediaType: 'executable' }],
    [{ ...valid, extra: 'unexpected' }],
  ])('rejects unsafe or malformed candidate input', async (value) => await expect(validate(value)).rejects.toBeInstanceOf(BadRequestException));
});
