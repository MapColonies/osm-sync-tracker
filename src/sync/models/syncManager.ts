import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import { GeometryType, Status } from '../../common/enums';
import { IRerunRepository, rerunRepositorySymbol } from '../DAL/rerunRepository';
import { ISyncRepository, syncRepositorySymbol } from '../DAL/syncRepository';
import { FullSyncAlreadyExistsError, InvalidSyncForRerunError, RerunAlreadyExistsError, SyncAlreadyExistsError, SyncNotFoundError } from './errors';
import { Rerun } from './rerun';
import { Sync, SyncUpdate } from './sync';

@injectable()
export class SyncManager {
  public constructor(
    @inject(syncRepositorySymbol) private readonly syncRepository: ISyncRepository,
    @inject(rerunRepositorySymbol) private readonly rerunRepository: IRerunRepository,
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

  public async rerunSync(syncId: string, rerunId: string, startDate: Date): Promise<void> {
    const rerunEntity = await this.rerunRepository.findOneRerun(rerunId);
    if (rerunEntity) {
      throw new RerunAlreadyExistsError(`rerun = ${rerunId} already exists`);
    }

    const referenceSync = await this.syncRepository.findOneSyncWithReruns(syncId);
    if (!referenceSync) {
      throw new SyncNotFoundError(`sync = ${syncId} not found`);
    }

    if (referenceSync.isFull || referenceSync.isRerun || referenceSync.status != Status.FAILED) {
      throw new InvalidSyncForRerunError(`could not rerun sync = ${syncId} due to it not being a failed diff original run sync`);
    }

    let rerunNumber = 1;
    const { reruns, ...referenceSyncBody } = referenceSync;
    const numberOfReruns = reruns.length;
    if (numberOfReruns > 0) {
      const lastRerun = reruns.sort((rerunA, rerunB) => rerunA.number - rerunB.number)[numberOfReruns - 1];
      const lastRerunSync = await this.syncRepository.findOneSync(lastRerun.rerunId);
      if (lastRerunSync && lastRerunSync.status != Status.FAILED) {
        throw new InvalidSyncForRerunError(
          `could not rerun sync = ${syncId} due to an already existing ${lastRerunSync.status} rerun = ${lastRerun.rerunId}`
        );
      }
      rerunNumber = lastRerun.number + 1;
    }

    const rerun: Rerun = { rerunId, referenceId: syncId, number: rerunNumber };
    const rerunAsSync: Sync = { ...referenceSyncBody, id: rerun.rerunId, isRerun: true, status: Status.IN_PROGRESS, startDate, endDate: null };
    await this.rerunRepository.createRerun(rerun, rerunAsSync);
  }
}
