import express from 'express';
import { upload } from "../../middleware/uploadMiddleware";

// === Handler untuk Additional DOC (Document Number & Metadata) ===
import {
    SupergetProposedChangeById,
    insertDocumentNumber,
    updateDocumentNumber,
    searchByProposedChangeId
} from '../../main-structure/Activity/Document/3_Additional_DOC/AdditionalAfterProposedChanges';

// === Handler untuk File Operations (upload, view, delete, etc) ===
import {
    getDocumentFilesByDocId,
    uploadDocumentFile,
    downloadDocumentFile,
    viewDocumentFile,
    deleteAdditionalFile,
    updateProgressSupport
} from '../../main-structure/Activity/Document/3_Additional_DOC/AddiotionalDoc_for_file';

const router = express.Router();


// ==========================
// 📂 Additional DOC Metadata
// ==========================

// GET Proposed Change by ID
router.get("/superproposed/:id", SupergetProposedChangeById);

// POST Insert document number
router.post("/superproposed", insertDocumentNumber);

// PUT Update document number
router.put("/superproposed/:id", updateDocumentNumber);

// GET Additional docs by proposed_change_id
// Example: /api/additionalbyid/search?proposed_change_id=1
router.get('/additionalbyid/search', searchByProposedChangeId);


// ============================
// 📂 File Operations (Upload/View/Download/Delete)
// ============================

// GET files by additional_doc_id
// Example: /api/document/files?tr_additional_doc_id=1
router.get('/document/files', getDocumentFilesByDocId);

// GET files by proposed_change_id
// router.get('/additionalbyid/search', getDocumentFilesByProposedChangeId);

// POST Upload new file
router.post('/documents/upload', upload.single('file'), uploadDocumentFile);

// GET Download file
router.get('/document/files/download/:fileId', downloadDocumentFile);

// GET View file
router.get('/document/files/view/:fileId', viewDocumentFile);

// DELETE File (soft delete)
router.delete('/document/files/delete/:fileId', deleteAdditionalFile);


// ============================
// 🔄 Update Progress (Support Percentage)
// ============================

// PUT Update progresssupport percentage by ID
router.put('/transaction/proposed-changes/status/:id', updateProgressSupport);


export default router;
