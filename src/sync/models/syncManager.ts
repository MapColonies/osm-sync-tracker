import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { Services } from '../../common/constants';
import { SyncRepository, syncRepositorySymbol } from '../DAL/syncRepository';
import { SyncAlreadyExistsError, SyncNotFoundError } from './errors';
import { Sync } from './sync';

@injectable()
export class SyncManager {
  public constructor(
    @inject(syncRepositorySymbol) private readonly syncRepository: SyncRepository,
    @inject(Services.LOGGER) private readonly logger: Logger
  ) {}
  public async getLatestSync(layerId: number): Promise<Sync> {
    const lastSync = await this.syncRepository.getLatestSync(layerId);
    if (lastSync === undefined) {
      throw new SyncNotFoundError(`sync with layer id = ${layerId} not found`);
    }
    return lastSync;
  }

  public async createSync(sync: Sync): Promise<void> {
    const syncEntity = await this.syncRepository.findOneSync(sync.id);
    if (syncEntity) {
      throw new SyncAlreadyExistsError(`sync = ${syncEntity.id} already exists`);
    }
    await this.syncRepository.createSync(sync);
  }

  public async updateSync(sync: Sync): Promise<void> {
    const syncEntity = await this.syncRepository.findOneSync(sync.id);
    if (!syncEntity) {
      throw new SyncNotFoundError(`sync = ${sync.id} not found`);
    }
    await this.syncRepository.updateSync(sync);
  }
}
