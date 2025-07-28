import express from 'express';

import {

    getAllSupportDocuments,
    getAllSupportDocumentsbyID,
    CreateSupportDocuments,
    UpdateSupportDocuments,
    DeleteSupportDocuments,
    getAllInstantSupdoc

} from '../../main-structure/MasterData/MasterDataDocument/MasterSupportDocument'; // Pastikan path-nya benar

import {
    getAllSubDocuments,
    getSubDocumentById,
    createSubDocument,
    updateSubDocument,
    deleteSubDocument,

} from '../../main-structure/MasterData/MasterDataDocument/MasterSubDocuments'; // Pastikan path-nya benar


import {
    getAllDevelopments,
    getDevelopmentByID,
    createDevelopment,
    updateDevelopment,
    deleteDevelopment,

} from '../../main-structure/MasterData/MasterDataDocument/MasterDevelopment'; // Pastikan path-nya benar


import {
    getAllDoctype,
    getDoctypeByID,
    createDoctype,
    updateDoctype,
    deleteDoctype,


} from '../../main-structure/MasterData/MasterDataDocument/MasterDocType'; // Pastikan path-nya benar

import {
    getAllCategoriesDocuments,
    getAllCategoriesDocumentsbyID,
    CreateCategoriesDocuments,
    UpdateCategoriesDocuments,
    DeleteCategoriesDocuments,


} from '../../main-structure/MasterData/MasterDataDocument/MasterCategoriesDocuments'; // Pastikan path-nya benar






const router = express.Router();

//Master Support Doc 
router.post("/mastersupportdoc", CreateSupportDocuments);        // POST /headSection
router.get("/mastersupportdoc", getAllSupportDocuments);         // GET /headSection?page=1&limit=10&search=...&status=true
router.get("/mastersupportdoc/:id", getAllSupportDocumentsbyID);    // GET /headSection/123
router.put("/mastersupportdoc/:id", UpdateSupportDocuments);    // PUT /headSection/123
router.delete("/mastersupportdoc/:id", DeleteSupportDocuments);  // DELETE /areas/123  (Soft Delete)
router.get("/instantsupportdoc", getAllInstantSupdoc);        // POST /headSection


//Master Sub Document
router.post("/subdocument", createSubDocument);        // POST /headSection
router.get("/subdocument", getAllSubDocuments);         // GET /headSection?page=1&limit=10&search=...&status=true
router.get("/subdocument/:id", getSubDocumentById);    // GET /headSection/123
router.put("/subdocument/:id", updateSubDocument);    // PUT /headSection/123
router.delete("/subdocument/:id", deleteSubDocument);  // DELETE /areas/123  (Soft Delete)

//Master Development
router.post("/development", createDevelopment);        // POST /headSection
router.get("/development", getAllDevelopments);         // GET /headSection?page=1&limit=10&search=...&status=true
router.get("/development/:id", getDevelopmentByID);    // GET /headSection/123
router.put("/development/:id", updateDevelopment);    // PUT /headSection/123
router.delete("/development/:id", deleteDevelopment);  // DELETE /areas/123  (Soft Delete)


//Master Development
router.post("/doctype", createDoctype);
router.get("/doctype", getAllDoctype);
router.get("/doctype/:id", getDoctypeByID);
router.put("/doctype/:id", updateDoctype);
router.delete("/doctype/:id", deleteDoctype);

//Master Categories
router.post("/categories", CreateCategoriesDocuments);
router.get("/categories", getAllCategoriesDocuments);
router.get("/categories/:id", getAllCategoriesDocumentsbyID);
router.put("/categories/:id", UpdateCategoriesDocuments);
router.delete("/categories/:id", DeleteCategoriesDocuments);





export default router;