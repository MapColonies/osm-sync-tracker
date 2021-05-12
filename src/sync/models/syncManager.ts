import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { Services } from '../../common/constants';
import { SyncRepository, syncRepositorySymbol } from '../DAL/syncRepository';
import { Sync } from './sync';

@injectable()
export class SyncManager {
  public constructor(
    @inject(syncRepositorySymbol) private readonly syncRepository: SyncRepository,
    @inject(Services.LOGGER) private readonly logger: Logger
  ) {}
  public async createSync(sync: Sync): Promise<void> {
    await this.syncRepository.createSync(sync);
  }

  public async getLatestSync(layerId: number): Promise<Sync> {
    return this.syncRepository.getLatestSync(layerId);
  }
  public async updateSync(sync: Sync): Promise<void> {
    await this.syncRepository.updateSync(sync);
  }
}
