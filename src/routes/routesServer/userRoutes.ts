import express from 'express';
import * as userController from '../../main-structure/controllersAuthUser/userController';
import * as loginAuthController from '../../main-structure/controllersAuthUser/loginAuthController';
import * as employee from '../../main-structure/Employee/Employee';

import { validateUserInput } from '../../middleware/validationMiddleware';
const router = express.Router();


//Employee
router.get('/employees', employee.getEmployees); // /api/users/employees
router.post('/testing', userController.createUsersFromEmployment); // /api/users

// Routes untuk pengguna
router.get('/', userController.getUsers); // /api/users
router.get('/:id', userController.getUser); // /api/users/:id
router.post('/', validateUserInput, userController.createUser); // /api/users
router.put('/:id', validateUserInput, userController.updateUser); // /api/users/:id
router.delete('/:id', userController.deleteUser); // /api/users/:id
router.delete('/soft/:id', userController.softDeleteUser); // /api/users/soft/:id
router.post('/login', loginAuthController.loginUser); // /api/users/login

export default router;




//createUsersFromEmployment