import express from 'express';
import { upload } from "../../middleware/uploadMiddleware"; // naik satu folder karena kamu ada di routesActivity

import {
    getAllProposedChanges,
    createSupportDocuments,
    softDeleteProposedChange,
    getAllProposedChangesWithRelations,
    getProposedChangeByIdWithRelations,
    getAllProposedChangesWithRelationsbyApprover
}
    from '../../main-structure/Activity/Document/2_ProposedChanges/ActivityProposedChanges'; // Pastikan path-nya benar

import {
    getAllProposedChangesHistory,
    getProposedChangesHistoryById,
    GethistoryProposedChanges
}
    from '../../main-structure/Activity/Document/2_ProposedChanges/ActivityProposedChangesHistory'; // Pastikan path-nya benar

import {
    GetApprovalProposedChanges
}
    from '../../main-structure/Activity/Document/2_ProposedChanges/ActivityProposedChangesApproval'; // Pastikan path-nya benar

import {
    createProposedChange
}
    from '../../main-structure/Activity/Document/2_ProposedChanges/CreateActivityProposedChanges'; // Pastikan path-nya benar

import {
    getSupportDocumentByProposedId,
    getProposedChangeById,
    updateSupportDocumentTitle,
    createSupportDocumentNote,
    createSupportDocumentFile,
    getSupportDocumentFiles,
    getSingleSupportDocumentFile,
    viewSupportDocumentFile,
    downloadSupportDocumentFile,
    downloadWithWatermark,
    getSupportDocNotes,



}
    from '../../main-structure/Activity/Document/2_ProposedChanges/DetailProposedChanges'; // Pastikan path-nya benar

import {
    updateProposedChange,
    updateSupportDocumentsStatus
} from '../../main-structure/Activity/Document/2_ProposedChanges/UpdateActivityProposedChanges ';


import {
    getAllOngoingApprovals,
    getOngoingApprovalsByAuthId,
    updateApprovalStatus
} from '../../main-structure/Activity/Document/2_ProposedChanges/ApprovalProposedChanges';

// Import approver change controllers
import {
    requestApproverChange,
    getPendingApproverChangeRequests,
    processApproverChangeRequest,
    getAllApproverChangeRequests,
    getApproverChangeRequestStats,
    getApprovalRequestsByProposedId,  // New import
    getApprovalRequestDetail          // New import
    
} from '../../main-structure/Activity/Document/2_ProposedChanges/ApproverSetup/ApproverProposedChangesController';

import {

    adminBypassApproval
} from '../../main-structure/Activity/Document/2_ProposedChanges/ApproverSetup/BypassApprovalbyAdmin';


const router = express.Router();


//Submit ProposedChanges jalan berbrengan dengan kirim support documents
router.post("/proposedchanges", createProposedChange);
router.post("/proposedchanges-support", createSupportDocuments);

router.get("/proposedchanges", getAllProposedChanges);
//Delete Proposed Changes
router.delete("/proposedchanges/:id", softDeleteProposedChange);

//Update Proposed Changes dan Update Support Documents sekalian
router.put("/proposedchanges/:id", updateProposedChange);
router.put("/supportdocuments/:proposed_id/status", updateSupportDocumentsStatus);

//Detailing by ID updateSupportDocumentTitlesByProposedId
router.get("/proposedchanges/:id", getProposedChangeById);

// Router untuk proposed changes history getProposedChangesHistoryById
router.get("/proposedchangeshistory", getAllProposedChangesHistory);
router.get("/proposedchangeshistory/:id", getProposedChangesHistoryById);
router.get("/history-byID-proposed-changes/:id", GethistoryProposedChanges);

//Approval Getting Main
router.get("/approval-byID-proposed-changes/:id", GetApprovalProposedChanges);



router.get("/supportproposed/:id", getSupportDocumentByProposedId);
router.put("/supportproposed/:id", updateSupportDocumentTitle);
router.post("/supportproposednoted/", createSupportDocumentNote);
router.get("/support-docs-noted/:support_doc_id/notes/", getSupportDocNotes);


//Document Upload
router.post("/uploadsupport/", upload.single("file"), createSupportDocumentFile);

//Document Get by Support Doc
router.get("/uploadsupport/:support_doc_id", getSupportDocumentFiles);

//Document Support by ID
router.get("/uploadsupport/file/:id", getSingleSupportDocumentFile);




//Donwload getSupportDocNotes
// View file (GET)
router.get("/support-docs/file/:id/view", viewSupportDocumentFile);

// Download file (GET)
router.get("/support-docs/file/:id/download", downloadSupportDocumentFile);

// Download file with watermark (GET)
router.get("/support-docs/file/:id/download-watermark", downloadWithWatermark);



// Endpoint untuk mendapatkan approval dengan status on_going berdasarkan auth_id
router.get('/ongoing', getOngoingApprovalsByAuthId);
router.post('/status', updateApprovalStatus);

// Endpoint untuk mendapatkan semua approval dengan status on_going
// router.get("/ongoing", getAllOngoingApprovals);


router.get("/completion", getAllProposedChangesWithRelations);
router.get("/completion/:id", getProposedChangeByIdWithRelations);
router.get("/completionapprover/:approver_id", getAllProposedChangesWithRelationsbyApprover);


// ==========================================
// APPROVER CHANGE MANAGEMENT ROUTES
// ==========================================

// 1. Request perubahan approver oleh user
router.post("/approver-change/request", requestApproverChange);

// 2. Get pending requests untuk admin
router.get("/approver-change/pending", getPendingApproverChangeRequests);

// 3. Process request oleh admin (approve/reject)
router.patch("/approver-change/:id/process", processApproverChangeRequest);

// 4. Admin bypass system (super admin only)
router.post("/approver-change/bypass", adminBypassApproval);

// 5. Get all requests untuk admin (dengan filter status)
router.get("/approver-change/all", getAllApproverChangeRequests);

// 6. Get statistics untuk admin dashboard
router.get("/approver-change/stats", getApproverChangeRequestStats);

// 7. Get approval requests by proposed changes ID (NEW)
router.get("/approver-change/by-proposed/:proposed_changes_id", getApprovalRequestsByProposedId);

// 8. Get detailed approval request (NEW)
router.get("/approver-change/detail/:id", getApprovalRequestDetail);

export default router;