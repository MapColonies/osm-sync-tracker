import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { Services } from '../../common/constants';
import { IChangesetRepository, changesetRepositorySymbol } from '../DAL/changsetRepository';
import { IApplication, IConfig, TransactionRetryPolicy } from '../../common/interfaces';
import { retryFunctionWrapper } from '../../common/utils/retryFunctionWrapper';
import { Changeset, UpdateChangeset } from './changeset';
import { ChangesetAlreadyExistsError, ChangesetNotFoundError, TransactionFailureError } from './errors';

@injectable()
export class ChangesetManager {
  private readonly dbSchema: string;
  private readonly transactionRetryPolicy: TransactionRetryPolicy;

  public constructor(
    @inject(changesetRepositorySymbol) private readonly changesetRepository: IChangesetRepository,
    @inject(Services.LOGGER) private readonly logger: Logger,
    @inject(Services.CONFIG) private readonly config: IConfig,
    @inject(Services.APPLICATION) private readonly appConfig: IApplication
  ) {
    this.dbSchema = this.config.get('db.schema');
    this.transactionRetryPolicy = this.appConfig.transactionRetryPolicy;
  }

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

  public async updateChangesetEntities(changesetId: string): Promise<void> {
    const changesetEntity = await this.changesetRepository.findOneChangeset(changesetId);
    if (!changesetEntity) {
      throw new ChangesetNotFoundError(`changeset = ${changesetId} not found`);
    }
    await this.changesetRepository.updateEntitiesOfChangesetAsCompleted(changesetId);
  }

  public async closeChangesets(changesetIds: string[]): Promise<string[]> {
    if (!this.transactionRetryPolicy.enabled) {
      return this.changesetRepository.tryClosingChangesets(changesetIds, this.dbSchema);
    }
    const retryOptions = { retryErrorType: TransactionFailureError, numberOfRetries: this.transactionRetryPolicy.numRetries as number };
    const functionRef = this.changesetRepository.tryClosingChangesets.bind(this.changesetRepository);
    return retryFunctionWrapper(retryOptions, functionRef, changesetIds, this.dbSchema);
  }

  public async closeChangeset(changesetId: string): Promise<void> {
    const changesetEntity = await this.changesetRepository.findOneChangeset(changesetId);
    if (!changesetEntity) {
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
