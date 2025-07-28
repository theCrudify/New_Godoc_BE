import express from 'express';

// Controller Imports (Pastikan semua path sudah benar)
import { createAuthDoc } from '../../main-structure/Activity/Document/4_Authorization_DOC/Authorization_Add';
import { getAllAuthDoc, getAuthDocById } from '../../main-structure/Activity/Document/4_Authorization_DOC/Authorization_List';
import { getHistoryAuthDoc } from '../../main-structure/Activity/Document/4_Authorization_DOC/Authorization_History';
import { getApprovalListAuthDoc } from '../../main-structure/Activity/Document/4_Authorization_DOC/Authorization_Approvallist';
import { getAuthDocByIdApprover, updateAuthApprovalStatus } from '../../main-structure/Activity/Document/4_Authorization_DOC/Authorization_Approver';
import { updateAuthDocById } from '../../main-structure/Activity/Document/4_Authorization_DOC/Authorization_Update';
import { getAuthDocByAuthId } from '../../main-structure/Activity/Document/4_Authorization_DOC/filterAuthorization';

// NEW: Approver Management Controller Imports
import { 
  getApprovalRequestsByAuthdocId,
  requestApproverChangeAuthdoc,
  getPendingApproverChangeRequestsAuthdoc,
  processApproverChangeRequestAuthdoc,
  getAllApproverChangeRequestsAuthdoc,
  getApproverChangeRequestStatsAuthdoc,
  getApprovalRequestDetailAuthdoc
} from '../../main-structure/Activity/Document/4_Authorization_DOC/ApproverSetup/ApproverAuthdocController';

import {
  
    adminBypassApprovalAuthdoc
} from '../../main-structure/Activity/Document/4_Authorization_DOC/ApproverSetup/BypassApprovalbyAdmin';


const router = express.Router();

// ==========================================
// EXISTING AUTHORIZATION DOCUMENT ROUTES
// ==========================================

/**
 * @route   POST /authdoc
 * @desc    Create a new Authorization Document
 */
router.post("/authdoc", createAuthDoc);

/**
 * @route   GET /authdoc
 * @desc    Get list of all Authorization Documents
 */
router.get("/authdoc", getAllAuthDoc);

/**
 * @route   GET /authdoc/:id
 * @desc    Get Authorization Document by ID
 */
router.get("/authdoc/:id", getAuthDocById);

/**
 * @route   PUT /authdoc/:id
 * @desc    Update Authorization Document by ID
 */
router.put("/authdoc/:id", updateAuthDocById);

/**
 * @route   GET /history-byID-authdoc/:id
 * @desc    Get history of a specific Authorization Document
 */
router.get("/history-byID-authdoc/:id", getHistoryAuthDoc);

/**
 * @route   GET /approval-byID-authdoc/:id
 * @desc    Get approval list of a specific Authorization Document
 */
router.get("/approval-byID-authdoc/:id", getApprovalListAuthDoc);

/**
 * @route   GET /authdocongoing
 * @desc    Get Authorization Documents that are currently pending for the approver
 */
router.get("/authdocongoing", getAuthDocByIdApprover);

/**
 * @route   POST /authstatus
 * @desc    Update the approval status of an Authorization Document
 */
router.post("/authstatus", updateAuthApprovalStatus);

/**
 * @route   GET /authdoc/by-auth/:id
 * @desc    Get Authorization Document(s) by authorization ID
 */
router.get("/authdoc/by-auth/:id", getAuthDocByAuthId);

// ==========================================
// NEW: APPROVER MANAGEMENT ROUTES
// ==========================================

/**
 * @route   GET /approver-change-authdoc/by-authdoc/:authorization_doc_id
 * @desc    Get approval change requests by Authorization Document ID (Admin Only)
 * @query   ?status=pending|approved|rejected
 */
router.get("/approver-change-authdoc/by-authdoc/:authorization_doc_id", getApprovalRequestsByAuthdocId);

/**
 * @route   POST /approver-change-authdoc/request
 * @desc    Request approver change for Authorization Document (User)
 * @body    { authorization_doc_id, approval_id, current_auth_id, new_auth_id, reason, urgent? }
 */
router.post("/approver-change-authdoc/request", requestApproverChangeAuthdoc);

/**
 * @route   GET /approver-change-authdoc/pending
 * @desc    Get pending approver change requests (Admin Only)
 * @query   ?page=1&limit=10&priority=urgent&search=term
 */
router.get("/approver-change-authdoc/pending", getPendingApproverChangeRequestsAuthdoc);

/**
 * @route   GET /approver-change-authdoc/all
 * @desc    Get all approver change requests with filtering (Admin Only)
 * @query   ?page=1&limit=10&status=pending&priority=urgent&search=term
 */
router.get("/approver-change-authdoc/all", getAllApproverChangeRequestsAuthdoc);

/**
 * @route   GET /approver-change-authdoc/stats
 * @desc    Get approver change request statistics (Admin Only)
 */
router.get("/approver-change-authdoc/stats", getApproverChangeRequestStatsAuthdoc);

/**
 * @route   GET /approver-change-authdoc/detail/:id
 * @desc    Get detailed approval request with full context
 */
router.get("/approver-change-authdoc/detail/:id", getApprovalRequestDetailAuthdoc);

/**
 * @route   PATCH /approver-change-authdoc/:id/process
 * @desc    Process approver change request - approve/reject (Admin Only)
 * @body    { status: "approved"|"rejected", admin_decision: "reason" }
 */
router.patch("/approver-change-authdoc/:id/process", processApproverChangeRequestAuthdoc);

//bypass by Admin - Admin bypass system (super admin only)
router.post("/approver-change-authdoc/bypass", adminBypassApprovalAuthdoc);

export default router;

// ==========================================
// ROUTE SUMMARY & DOCUMENTATION
// ==========================================

/*
COMPLETE AUTHORIZATION DOCUMENT ROUTES:

BASIC DOCUMENT MANAGEMENT:
✅ POST   /authdoc                                   - Create new document
✅ GET    /authdoc                                   - List all documents  
✅ GET    /authdoc/:id                               - Get document by ID
✅ PUT    /authdoc/:id                               - Update document
✅ GET    /authdoc/by-auth/:id                       - Get documents by auth ID

APPROVAL & WORKFLOW:
✅ GET    /history-byID-authdoc/:id                  - Get document history
✅ GET    /approval-byID-authdoc/:id                 - Get approval list
✅ GET    /authdocongoing                           - Get pending documents for approver
✅ POST   /authstatus                               - Update approval status

APPROVER MANAGEMENT (NEW):
🆕 GET    /approver-change-authdoc/by-authdoc/:id           - Get change requests by doc ID
🆕 POST   /approver-change-authdoc/request                  - Request approver change
🆕 GET    /approver-change-authdoc/pending                  - Get pending requests (Admin)
🆕 GET    /approver-change-authdoc/all                      - Get all requests (Admin)
🆕 GET    /approver-change-authdoc/stats                    - Get statistics (Admin)
🆕 GET    /approver-change-authdoc/detail/:id               - Get request detail
🆕 PATCH  /approver-change-authdoc/:id/process              - Process request (Admin)

ROUTE CONFLICTS CHECKED:
✅ No duplicate routes
✅ All routes are unique
✅ Proper REST conventions followed
✅ Admin-only routes properly marked

FRONTEND USAGE EXAMPLES:
- List requests for doc: GET /approver-change-authdoc/by-authdoc/123?status=pending
- Submit request: POST /approver-change-authdoc/request
- Admin dashboard: GET /approver-change-authdoc/pending?page=1&limit=10
- Process request: PATCH /approver-change-authdoc/456/process
*/