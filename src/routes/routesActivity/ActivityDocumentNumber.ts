import express from 'express';


import { getAllDocumentNumbers, getDocumentNumberById, createDocumentNumber, deleteDocumentNumberById } from '../../main-structure/Activity/Document/1_DocumentNumber/ActivityDocumentNumber'; // Pastikan path-nya benar



const router = express.Router();

// Routes untuk pengguna getDocumentNumberById

router.get("/documentnumbers", getAllDocumentNumbers);
router.get("/documentnumbers/:id", getDocumentNumberById);
router.post("/documentnumbers", createDocumentNumber);
router.delete("/documentnumbers/:id", deleteDocumentNumberById);






export default router;
