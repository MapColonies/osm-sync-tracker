import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import { GeometryType, Status } from '../../common/enums';
import { IConfig } from '../../common/interfaces';
import { SYNC_CUSTOM_REPOSITORY_SYMBOL, SyncRepository } from '../DAL/syncRepository';
import { FullSyncAlreadyExistsError, InvalidSyncForRerunError, RerunAlreadyExistsError, SyncAlreadyExistsError, SyncNotFoundError } from './errors';
import { BaseSync, CreateRerunRequest, Sync, SyncsFilter, SyncUpdate } from './sync';

@injectable()
export class SyncManager {
  private readonly dbSchema: string;

  public constructor(
    @inject(SYNC_CUSTOM_REPOSITORY_SYMBOL) private readonly syncRepository: SyncRepository,
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig
  ) {
    this.dbSchema = this.config.get('db.schema');
  }

  public async getSyncs(filter: SyncsFilter): Promise<BaseSync[]> {
    this.logger.info({ msg: 'getting syncs by filter', filter });

    return this.syncRepository.filterSyncs(filter);
  }

  public async getLatestSync(layerId: number, geometryType: GeometryType): Promise<BaseSync> {
    this.logger.info({ msg: 'getting latest sync', layerId, geometryType });

    const latestSync = await this.syncRepository.getLatestSync(layerId, geometryType);
    if (latestSync === null) {
      this.logger.error({ msg: 'latest sync not found', layerId, geometryType });
      throw new SyncNotFoundError(`sync with layer id = ${layerId}, geometry type = ${geometryType} not found`);
    }
    return latestSync;
  }

  public async createSync(sync: Sync): Promise<void> {
    this.logger.info({ msg: 'attempting to create sync', sync });

    const syncEntity = await this.syncRepository.findOneSync(sync.id);
    if (syncEntity) {
      this.logger.error({ msg: 'could not create sync due to sync with the same id already existing', syncId: syncEntity.id });
      throw new SyncAlreadyExistsError(`sync = ${syncEntity.id} already exists`);
    }

    if (sync.isFull) {
      const { isFull, layerId, geometryType } = sync;
      const alreadyExistingFullSync = await this.syncRepository.findSyncs({ layerId, geometryType, isFull });
      if (alreadyExistingFullSync.length > 0) {
        const existingFullSyncId = alreadyExistingFullSync[0].id;
        this.logger.error({
          msg: 'could not create full sync due to already existing full sync on this layer id and geometry type',
          layerId,
          geometryType,
          existingFullSyncId,
        });

        throw new FullSyncAlreadyExistsError(
          `full sync with layer id = ${layerId} and geometry type = ${geometryType} already exists with id ${existingFullSyncId}`
        );
      }
    }
    await this.syncRepository.createSync(sync);
  }

  public async updateSync(syncId: string, updatedSync: SyncUpdate): Promise<void> {
    this.logger.info({ msg: 'updating sync', syncId, updatedSync });
    const currentSync = await this.syncRepository.findOneSync(syncId);

    if (!currentSync) {
      this.logger.error({ msg: 'could not update sync due to sync not existing', syncId });
      throw new SyncNotFoundError(`sync = ${syncId} not found`);
    }

    await this.syncRepository.updateSync(syncId, { ...updatedSync, metadata: { ...currentSync.metadata, ...updatedSync.metadata } });
  }

  public async rerunSyncIfNeeded(syncId: string, rerunId: string, startDate: Date, shouldRerunNotSynced?: boolean): Promise<boolean> {
    this.logger.info({ msg: 'attempting to create rerun sync', rerunId, baseSyncId: syncId, startDate });

    const rerunEntity = await this.syncRepository.findOneSync(rerunId);
    if (rerunEntity) {
      this.logger.error({ msg: 'could not create rerun due to rerun with the same id already existing', rerunId, baseSyncId: syncId });
      throw new RerunAlreadyExistsError(`rerun = ${rerunId} already exists`);
    }

    const baseSyncWithLastRerun = await this.syncRepository.findOneSyncWithLastRerun(syncId);
    if (!baseSyncWithLastRerun) {
      this.logger.error({ msg: 'could not create rerun due to base sync not existing' });
      throw new SyncNotFoundError(`sync = ${syncId} not found`);
    }

    if (baseSyncWithLastRerun.runNumber != 0 || baseSyncWithLastRerun.status != Status.FAILED) {
      this.logger.error({
        msg: 'could not create rerun due to given base sync id not being a failed base sync',
        rerunId,
        baseSyncId: syncId,
        baseSyncRunNumber: baseSyncWithLastRerun.runNumber,
        baseSyncStatus: baseSyncWithLastRerun.status,
      });
      throw new InvalidSyncForRerunError(`could not rerun sync = ${syncId} due to it not being a failed base sync`);
    }

    let runNumber = 1;
    const { reruns, ...baseSyncBody } = baseSyncWithLastRerun;
    if (reruns.length > 0) {
      const latestRerun = reruns[0];
      if (latestRerun.status != Status.FAILED) {
        this.logger.error({
          msg: 'could not create rerun due to latest sync rerun not having failed status',
          rerunId,
          baseSyncId: syncId,
          latestRerunId: latestRerun.id,
          latestRerunStatus: latestRerun.status,
          latestRerunRunNumber: latestRerun.runNumber,
        });
        throw new InvalidSyncForRerunError(
          `could not rerun sync = ${syncId} due to an already existing ${latestRerun.status} rerun = ${latestRerun.id}`
        );
      }
      runNumber = latestRerun.runNumber + 1;
    }

    const rerunSyncForCreation: CreateRerunRequest = {
      ...baseSyncBody,
      id: rerunId,
      baseSyncId: baseSyncWithLastRerun.id,
      runNumber,
      status: Status.IN_PROGRESS,
      startDate,
      endDate: null,
      shouldRerunNotSynced: shouldRerunNotSynced ?? false,
    };

    return this.syncRepository.createRerun(rerunSyncForCreation, this.dbSchema);
  }
}
