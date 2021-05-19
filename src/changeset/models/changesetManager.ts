import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { Services } from '../../common/constants';
import { ChangesetRepository, changesetRepositorySymbol } from '../DAL/changsetRepository';
import { Changeset, UpdateChangeset } from './changeset';

@injectable()
export class ChangesetManager {
  public constructor(
    @inject(changesetRepositorySymbol) private readonly changesetRepository: ChangesetRepository,
    @inject(Services.LOGGER) private readonly logger: Logger
  ) {}

  public async createChangeset(changeset: Changeset): Promise<void> {
    await this.changesetRepository.createChangeset(changeset);
  }

  public async updateChangeset(changesetId: string, changeset: UpdateChangeset): Promise<void> {
    await this.changesetRepository.updateChangeset(changesetId, changeset);
  }

  public async closeChangeset(changesetId: string): Promise<void> {
    await this.changesetRepository.closeChangeset(changesetId);
  }
}
