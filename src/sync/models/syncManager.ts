import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import { GeometryType, Status } from '../../common/enums';
import { IConfig } from '../../common/interfaces';
import { ISyncRepository, syncRepositorySymbol } from '../DAL/syncRepository';
import { FullSyncAlreadyExistsError, InvalidSyncForRerunError, RerunAlreadyExistsError, SyncAlreadyExistsError, SyncNotFoundError } from './errors';
import { BaseSync, Sync, SyncUpdate } from './sync';

@injectable()
export class SyncManager {
  private readonly dbSchema: string;

  public constructor(
    @inject(syncRepositorySymbol) private readonly syncRepository: ISyncRepository,
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig
  ) {
    this.dbSchema = this.config.get('db.schema');
  }
  public async getLatestSync(layerId: number, geometryType: GeometryType): Promise<BaseSync> {
    const latestSync = await this.syncRepository.getLatestSync(layerId, geometryType);
    if (latestSync === undefined) {
      throw new SyncNotFoundError(`sync with layer id = ${layerId}, geometry type = ${geometryType} not found`);
    }
    return latestSync;
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

  public async rerunSync(syncId: string, rerunId: string, startDate: Date): Promise<void> {
    const rerunEntity = await this.syncRepository.findOneSync(rerunId);
    if (rerunEntity) {
      throw new RerunAlreadyExistsError(`rerun = ${rerunId} already exists`);
    }

    const baseSync = await this.syncRepository.findOneSyncWithReruns(syncId);
    if (!baseSync) {
      throw new SyncNotFoundError(`sync = ${syncId} not found`);
    }

    if (baseSync.isFull || baseSync.runNumber != 0 || baseSync.status != Status.FAILED) {
      throw new InvalidSyncForRerunError(`could not rerun sync = ${syncId} due to it not being a failed diff base sync`);
    }

    let runNumber = 1;
    const { reruns, ...baseSyncBody } = baseSync;
    if (reruns.length > 0) {
      const latestRerun = reruns[reruns.length - 1];
      if (latestRerun.status != Status.FAILED) {
        throw new InvalidSyncForRerunError(
          `could not rerun sync = ${syncId} due to an already existing ${latestRerun.status} rerun = ${latestRerun.id}`
        );
      }
      runNumber = latestRerun.runNumber + 1;
    }

    const rerunSyncForCreation: Sync = {
      ...baseSyncBody,
      id: rerunId,
      baseSyncId: baseSync.id,
      runNumber,
      status: Status.IN_PROGRESS,
      startDate,
      endDate: null,
    };
    await this.syncRepository.createRerun(rerunSyncForCreation, this.dbSchema);
  }
}
