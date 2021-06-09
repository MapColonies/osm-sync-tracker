import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { EntityController } from '../../entity/controllers/entityController';

const fileRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(EntityController);

  router.post('/:fileId/entity', controller.postEntity);
  router.post('/:fileId/entity/_bulk', controller.postEntities);
  router.patch('/:fileId/entity/:entityId', controller.patchEntity);

  return router;
};

export default fileRouterFactory;
