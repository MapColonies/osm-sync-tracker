import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import { GeometryType } from '../../common/enums';
import { ISyncRepository, syncRepositorySymbol } from '../DAL/syncRepository';
import { FullSyncAlreadyExistsError, SyncAlreadyExistsError, SyncNotFoundError } from './errors';
import { Sync } from './sync';

@injectable()
export class SyncManager {
  public constructor(
    @inject(syncRepositorySymbol) private readonly syncRepository: ISyncRepository,
    @inject(SERVICES.LOGGER) private readonly logger: Logger
  ) {}
  public async getLatestSync(layerId: number, geometryType: GeometryType): Promise<Sync> {
    const lastSync = await this.syncRepository.getLatestSync(layerId, geometryType);
    if (lastSync === undefined) {
      throw new SyncNotFoundError(`sync with layer id = ${layerId}, geometry type = ${geometryType} not found`);
    }
    return lastSync;
  }

  public async createSync(sync: Sync): Promise<void> {
    const syncEntity = await this.syncRepository.findOneSync(sync.id);
    if (syncEntity) {
      throw new SyncAlreadyExistsError(`sync = ${syncEntity.id} already exists`);
    }
    if (sync.isFull) {
      const { layerId, geometryType } = sync;
      const alreadyExistsFullSync = await this.syncRepository.findFullSyncByLayerAndGeometry(layerId, geometryType);
      if (alreadyExistsFullSync) {
        throw new FullSyncAlreadyExistsError(
          `full sync with layer id = ${layerId} and geometry type = ${geometryType} already exists with id ${alreadyExistsFullSync.id}`
        );
      }
    }
    await this.syncRepository.createSync(sync);
  }

  public async updateSync(syncId: string, updatedSync: Omit<Sync, 'id'>): Promise<void> {
    const syncEntity = await this.syncRepository.findOneSync(syncId);

    if (!syncEntity) {
      throw new SyncNotFoundError(`sync = ${syncId} not found`);
    }

    const { layerId, geometryType } = updatedSync;
    if (updatedSync.isFull && (layerId != syncEntity.layerId || geometryType != syncEntity.geometryType)) {
      const alreadyExistsFullSync = await this.syncRepository.findFullSyncByLayerAndGeometry(layerId, geometryType);
      if (alreadyExistsFullSync) {
        throw new FullSyncAlreadyExistsError(
          `full sync with layer id = ${layerId} and geometry type = ${geometryType} already exists with id ${alreadyExistsFullSync.id}`
        );
      }
    }

    const syncEntityWithId = { id: syncId, ...updatedSync };
    await this.syncRepository.updateSync(syncEntityWithId);
  }
}
