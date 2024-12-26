import { In, DataSource, EntityManager } from 'typeorm';
import { FactoryFunction } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { Entity, UpdateEntities, UpdateEntity } from '../models/entity';
import { Status } from '../../common/enums';
import { FileId } from '../../file/DAL/fileRepository';
import { DATA_SOURCE_PROVIDER } from '../../common/db';
import { ILogger } from '../../common/interfaces';
import { TransactionFailureError } from '../../common/errors';
import { SERVICES } from '../../common/constants';
import { isTransactionFailure, TransactionFn, TransactionParams } from '../../common/db/transactions';
import { Entity as EntityDb } from './entity';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const createEntityRepository = (dataSource: DataSource) => {
  return dataSource.getRepository(EntityDb).extend({
    async transactionify<T>(params: TransactionParams, fn: TransactionFn<T>): Promise<T> {
      logger.info({ msg: 'attempting to run transaction', ...params });

      try {
        const result = await this.manager.connection.transaction(params.isolationLevel, fn);

        logger.info({ msg: 'transaction completed', ...params });

        return result;
      } catch (error) {
        logger.error({ msg: 'failure occurred while running transaction', ...params, err: error });

        if (isTransactionFailure(error)) {
          throw new TransactionFailureError(`running transaction has failed due to read/write dependencies among transactions.`);
        }

        throw error;
      }
    },

    async createEntity(entity: Entity): Promise<void> {
      await this.insert(entity);
    },

    async createEntities(entities: Entity[]): Promise<void> {
      await this.insert(entities);
    },

    async updateEntity(entityId: string, fileId: string, entity: UpdateEntity): Promise<void> {
      await this.update({ entityId, fileId }, entity);
    },

    async updateEntities(entities: UpdateEntities): Promise<void> {
      await this.save(entities);
    },

    async findOneEntity(entityId: string, fileId: string): Promise<EntityDb | undefined> {
      const entityEntity = await this.findOne({ where: { entityId, fileId } });
      if (entityEntity === null) {
        return undefined;
      }
      return entityEntity;
    },

    async findManyEntitiesByIds(entities: Entity[]): Promise<EntityDb[] | undefined> {
      // due to both entityId and fileId being unique uuids this operation is valid
      const entityEntities = await this.findBy({ entityId: In(entities.map((e) => e.entityId)), fileId: In(entities.map((e) => e.fileId)) });
      if (entityEntities.length === 0) {
        return undefined;
      }
      return entityEntities;
    },

    /**
     * Returns the fileIds that have entities under them that also belong to one of the given changesets,
     * the files should also match one of the statuses in the given fileStatuses array.
     *
     * @param changesetIds - The changeset ids
     * @param fileStatuses - Any returned fileId will have one of the given statuses
     * @param transactionManager - Optional transaction manager
     * @returns A distinct fileIds array matching the parameters
     *
     */
    async findFilesByChangesets(changesetIds: string[], fileStatuses: Status[], transactionManager?: EntityManager): Promise<FileId[]> {
      const scopedManager = transactionManager ?? this.manager;

      const result = await scopedManager
        .createQueryBuilder(EntityDb, 'entity')
        .select(`entity.fileId`)
        .leftJoin('entity.file', 'file')
        .where('entity.changeset_id = ANY(:changesetIds)', { changesetIds })
        .andWhere('file.status IN(:...fileStatuses)', { fileStatuses })
        .distinctOn(['entity.fileId'])
        .getMany();

      return result as FileId[];
    },

    async countEntitiesByIds(ids: Pick<Entity, 'entityId' | 'fileId'>[]): Promise<number> {
      return this.createQueryBuilder().whereInIds(ids).getCount();
    },
  });
};

let logger: ILogger;

export type EntityRepository = ReturnType<typeof createEntityRepository>;

export const entityRepositoryFactory: FactoryFunction<EntityRepository> = (depContainer) => {
  const baseLogger = depContainer.resolve<Logger>(SERVICES.LOGGER);
  logger = baseLogger.child({ component: 'entityRepository' });

  return createEntityRepository(depContainer.resolve<DataSource>(DATA_SOURCE_PROVIDER));
};

export const ENTITY_CUSTOM_REPOSITORY_SYMBOL = Symbol('ENTITY_CUSTOM_REPOSITORY_SYMBOL');
