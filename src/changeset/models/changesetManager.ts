import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import { ChangesetRepository, CHANGESET_CUSTOM_REPOSITORY_SYMBOL } from '../DAL/changesetRepository';
import { JobQueueProvider } from '../../queueProvider/interfaces';
import { ClosureJob } from '../../queueProvider/types';
import { CHANGESETS_QUEUE_NAME } from '../../queueProvider/constants';
import { ChangesetAlreadyExistsError, ChangesetNotFoundError } from './errors';
import { Changeset, UpdateChangeset } from './changeset';

@injectable()
export class ChangesetManager {
  public constructor(
    @inject(CHANGESET_CUSTOM_REPOSITORY_SYMBOL) private readonly changesetRepository: ChangesetRepository,
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(CHANGESETS_QUEUE_NAME) private readonly changesetsQueue: JobQueueProvider<ClosureJob>
  ) {}

  public async createChangeset(changeset: Changeset): Promise<void> {
    const { changesetId, osmId } = changeset;
    this.logger.info({ msg: 'creating changeset', changesetId, osmId });

    const changesetEntity = await this.changesetRepository.findOneChangeset(changesetId);
    if (changesetEntity) {
      this.logger.error({ msg: 'could not create changeset, changeset already exists', changesetId, osmId });
      throw new ChangesetAlreadyExistsError(`changeset = ${changesetId} already exists`);
    }

    await this.changesetRepository.createChangeset(changeset);
  }

  public async updateChangeset(changesetId: string, changesetUpdate: UpdateChangeset): Promise<void> {
    this.logger.info({ msg: 'updating changest by setting osmId', changesetId, osmId: changesetUpdate.osmId });

    const changesetEntity = await this.changesetRepository.findOneChangeset(changesetId);
    if (!changesetEntity) {
      this.logger.error({ msg: 'could not update changeset, changeset does not exist', changesetId });
      throw new ChangesetNotFoundError(`changeset = ${changesetId} not found`);
    }

    await this.changesetRepository.updateChangeset(changesetId, changesetUpdate);
  }

  // TODO: should get the edit as variable
  public async updateChangesetEntities(changesetId: string): Promise<void> {
    this.logger.info({ msg: 'updating changeset entities as completed', changesetId });

    const changesetEntity = await this.changesetRepository.findOneChangeset(changesetId);
    if (!changesetEntity) {
      this.logger.error({ msg: 'could not update changeset entities, changeset does not exist', changesetId });
      throw new ChangesetNotFoundError(`changeset = ${changesetId} not found`);
    }

    await this.changesetRepository.updateEntitiesOfChangesetAsCompleted(changesetId);
  }

  public async createClosures(changesetIds: string[]): Promise<void> {
    this.logger.info({ msg: 'creating changeset closures', amount: changesetIds.length, changesetIds });

    const uniqueChangesetIds = Array.from(new Set(changesetIds));

    const jobs: ClosureJob[] = uniqueChangesetIds.map((id) => ({ id, kind: 'changeset' }));

    await this.changesetsQueue.push(jobs);
  }
}
