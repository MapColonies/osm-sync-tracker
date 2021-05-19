import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { EntityController } from '../controllers/entityController';

const entityRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(EntityController);

  router.post('/file/:fileId/entity', controller.postEntity);
  router.post('/file/:fileId/entity/_bulk', controller.postEntities);
  router.post('/file/:fileId/entity/:entityId', controller.patchEntity);

  return router;
};

export default entityRouterFactory;
