import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { EntityController } from '../controllers/entityController';

const entityRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(EntityController);

  router.patch('/_bulk', controller.patchEntities);

  return router;
};

export default entityRouterFactory;
