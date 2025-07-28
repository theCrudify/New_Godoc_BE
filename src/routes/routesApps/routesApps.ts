import express from 'express';
import { loginUserGodoc } from '../../main-structure/AuthenticationApps/AuthLoginApps';

const router = express.Router();

// Routes untuk pengguna

router.post("/loginUserGodoc", loginUserGodoc); 

export default router;
