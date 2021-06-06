import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { Services } from '../../common/constants';
import { IChangesetRepository, changesetRepositorySymbol } from '../DAL/changsetRepository';
import { Changeset, UpdateChangeset } from './changeset';
import { ChangesetAlreadyExistsError, ChangesetNotFoundError } from './errors';

@injectable()
export class ChangesetManager {
  public constructor(
    @inject(changesetRepositorySymbol) private readonly changesetRepository: IChangesetRepository,
    @inject(Services.LOGGER) private readonly logger: Logger
  ) {}

  public async createChangeset(changeset: Changeset): Promise<void> {
    const changesetEntity = await this.changesetRepository.findOneChangeset(changeset.changesetId);
    if (changesetEntity) {
      throw new ChangesetAlreadyExistsError(`changeset = ${changesetEntity.changesetId} already exists`);
    }
    await this.changesetRepository.createChangeset(changeset);
  }

  public async updateChangeset(changesetId: string, changeset: UpdateChangeset): Promise<void> {
    const changesetEntity = await this.changesetRepository.findOneChangeset(changesetId);
    if (!changesetEntity) {
      throw new ChangesetNotFoundError(`changeset = ${changesetId} not found`);
    }
    await this.changesetRepository.updateChangeset(changesetId, changeset);
  }

  public async closeChangeset(changesetId: string, schema: string): Promise<void> {
    const changesetEntity = await this.changesetRepository.findOneChangeset(changesetId);
    if (!changesetEntity) {
      throw new ChangesetNotFoundError(`changeset = ${changesetId} not found`);
    }
    await this.changesetRepository.closeChangeset(changesetId, schema);
  }
}
