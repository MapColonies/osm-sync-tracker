import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import { GeometryType } from '../../common/enums';
import { ISyncRepository, syncRepositorySymbol } from '../DAL/syncRepository';
import { FullSyncAlreadyExistsError, SyncAlreadyExistsError, SyncNotFoundError } from './errors';
import { Sync, SyncUpdate } from './sync';

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
      const { isFull, layerId, geometryType } = sync;
      const alreadyExistingFullSync = await this.syncRepository.findSyncs({ layerId, geometryType, isFull });
      if (alreadyExistingFullSync.length > 0) {
        throw new FullSyncAlreadyExistsError(
          `full sync with layer id = ${layerId} and geometry type = ${geometryType} already exists with id ${alreadyExistingFullSync[0].id}`
        );
      }
    }
    await this.syncRepository.createSync(sync);
  }

  public async updateSync(syncId: string, updatedSync: SyncUpdate): Promise<void> {
    const currentSync = await this.syncRepository.findOneSync(syncId);

    if (!currentSync) {
      throw new SyncNotFoundError(`sync = ${syncId} not found`);
    }

    const { isFull } = currentSync;
    const updatedEntity = { isFull, ...updatedSync };
    await this.syncRepository.updateSync(syncId, updatedEntity);
  }
}
