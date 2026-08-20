export type MediaAssetType = 'image' | 'video' | 'audio';
/** Stable registry identifier; implementations register their own value (V1 uses `local`). */
export type MediaAssetStorageProvider = string;
export type MediaAssetLifecycleStatus = 'ready' | 'failed';

export interface MediaAsset {
  id: string;
  mediaType: MediaAssetType;
  mimeType: string;
  checksum: string;
  sizeBytes: number;
  sourceType: 'visual_asset_candidate';
  sourceId: string;
  requirementId: string;
  sourceIdentity: string;
  storageProvider: MediaAssetStorageProvider;
  storageKey: string;
  status: MediaAssetLifecycleStatus;
  createdAt: string;
}
