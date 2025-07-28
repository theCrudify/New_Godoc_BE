import express from 'express';

import {
    createHandover,
} from '../../main-structure/Activity/Document/5_Handover_DOC/Add_HAndover';

import {
    updateHandover,
} from '../../main-structure/Activity/Document/5_Handover_DOC/Update_HAndover';

import {
    getHandoverById,
    getAllHandovers,
} from '../../main-structure/Activity/Document/5_Handover_DOC/List_HAndover';

import {
    getHandoverByIdApprover,
    updateHandoverApprovalStatus
} from '../../main-structure/Activity/Document/5_Handover_DOC/Approver_Handover';

import {
    getHandoverApproval
} from '../../main-structure/Activity/Document/5_Handover_DOC/Approvallist_HAndover';

import {
    getHistoryHandover
} from '../../main-structure/Activity/Document/5_Handover_DOC/History_HAndover';

import {
    finishHandover
} from '../../main-structure/Activity/Document/6_Rating/FinishHandover';

import {
    submitRatingByHandover
} from '../../main-structure/Activity/Document/6_Rating/SubmitRating';

const router = express.Router();

// Basic handover routes
router.post("/handover", createHandover);
router.put("/handover/:id", updateHandover);
router.get("/handover", getAllHandovers);
router.get("/handover/:id", getHandoverById);

// Approval routes
router.get("/ongoinghandover", getHandoverByIdApprover);
router.post("/approvalhandover", updateHandoverApprovalStatus);

// History and approval list routes
router.get("/history-byID-handover/:id", getHistoryHandover);
router.get("/approval-byID-handover/:id", getHandoverApproval);

// New Rating System routes
router.put("/handover/:id/finish", finishHandover);           // Mark handover as finished
router.post("/handover/:handover_id/rate", submitRatingByHandover); // Submit a rating for an approval

export default router;