import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import { IApplication, IConfig, TransactionRetryPolicy } from '../../common/interfaces';
import { retryFunctionWrapper } from '../../common/utils/retryFunctionWrapper';
import { ChangesetRepository, CHANGESET_CUSTOM_REPOSITORY_SYMBOL } from '../DAL/changesetRepository';
import { Changeset, UpdateChangeset } from './changeset';
import { ChangesetAlreadyExistsError, ChangesetNotFoundError, TransactionFailureError } from './errors';

@injectable()
export class ChangesetManager {
  private readonly dbSchema: string;
  private readonly transactionRetryPolicy: TransactionRetryPolicy;

  public constructor(
    @inject(CHANGESET_CUSTOM_REPOSITORY_SYMBOL) private readonly changesetRepository: ChangesetRepository,
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.APPLICATION) private readonly appConfig: IApplication
  ) {
    this.dbSchema = this.config.get('db.schema');
    this.transactionRetryPolicy = this.appConfig.transactionRetryPolicy;
  }

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

  public async updateChangesetEntities(changesetId: string): Promise<void> {
    this.logger.info({ msg: 'updating changeset entities as completed', changesetId });

    const changesetEntity = await this.changesetRepository.findOneChangeset(changesetId);
    if (!changesetEntity) {
      this.logger.error({ msg: 'could not update changeset entities, changeset does not exist', changesetId });
      throw new ChangesetNotFoundError(`changeset = ${changesetId} not found`);
    }

    await this.changesetRepository.updateEntitiesOfChangesetAsCompleted(changesetId);
  }

  public async closeChangesets(changesetIds: string[]): Promise<string[]> {
    this.logger.info({ msg: 'closing changesets', count: changesetIds.length, changesetIds, transactionRetryPolicy: this.transactionRetryPolicy });

    if (!this.transactionRetryPolicy.enabled) {
      return this.changesetRepository.tryClosingChangesets(changesetIds, this.dbSchema);
    }
    const retryOptions = { retryErrorType: TransactionFailureError, numberOfRetries: this.transactionRetryPolicy.numRetries as number };
    const functionRef = this.changesetRepository.tryClosingChangesets.bind(this.changesetRepository);
    const completedSyncIds = await retryFunctionWrapper(retryOptions, functionRef, changesetIds, this.dbSchema);

    this.logger.debug({
      msg: 'closing changesets resulted in the complition of following syncs',
      changesetIds,
      changesetsCount: changesetIds.length,
      closedSyncs: completedSyncIds,
      closedSyncsCount: completedSyncIds.length,
    });

    return completedSyncIds;
  }

  public async closeChangeset(changesetId: string): Promise<void> {
    this.logger.info({ msg: 'closing changeset', changesetId, transactionRetryPolicy: this.transactionRetryPolicy });

    const changesetEntity = await this.changesetRepository.findOneChangeset(changesetId);
    if (!changesetEntity) {
      this.logger.error({ msg: 'could not close changeset, changeset does not exist', changesetId });
      throw new ChangesetNotFoundError(`changeset = ${changesetId} not found`);
    }

    if (!this.transactionRetryPolicy.enabled) {
      return this.changesetRepository.tryClosingChangeset(changesetId, this.dbSchema);
    }

    const retryOptions = { retryErrorType: TransactionFailureError, numberOfRetries: this.transactionRetryPolicy.numRetries as number };
    const functionRef = this.changesetRepository.tryClosingChangeset.bind(this.changesetRepository);
    await retryFunctionWrapper(retryOptions, functionRef, changesetId, this.dbSchema);
  }
}
