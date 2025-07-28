// src/main-structure/Activity/Document/0_DashboardSummary/RoutesDahsboard.ts

import express from 'express';
import { 
    getDocumentStatusMapping
} from './DocumentLevelling';
import {
    getDepartmentInvolvement,
    
} from './DepartmentInvolve';

import {
    getDocumentTimeStatistics,
    getDocumentTrends
} from './DocStatistic';

import {
    getTopHandoverSubmitters,
    getTopHandoverApprovers
} from './TopEmployee';

import {
    getLineCodeStatistics,
    getLineCodeStatusFlow
} from './LineStatistics';

const router = express.Router();


// Dashboard API routes
router.get('/documentmapping', getDocumentStatusMapping);

// Department involvement routes - sederhana
router.get('/dashboarddepartments', getDepartmentInvolvement);
// router.get('/dashboarddepartments/:id', getDepartmentInvolvementDetail);

// Document time statistics routes
router.get('/docstatistics/time', getDocumentTimeStatistics);
router.get('/docstatistics/trends', getDocumentTrends);

// Top performers routes
router.get('/top-performers/submitters', getTopHandoverSubmitters);
router.get('/top-performers/approvers', getTopHandoverApprovers);

// Line code statistics routes
router.get('/line-codes', getLineCodeStatistics);
router.get('/line-codes/flow', getLineCodeStatusFlow);
export default router;