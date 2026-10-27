import { Router } from 'express';
import { userId } from '../../utils/http.js';
import { dashboard } from './stats.service.js';

export const progressRouter = Router();

progressRouter.get('/dashboard', async (req, res) => {
  res.json(await dashboard(userId(req)));
});
