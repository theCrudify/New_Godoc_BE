import express from 'express';

import {
  getAllAuthorizations,
  getAuthorizationById,
  createAuthorization,
  updateAuthorization,
  deleteAuthorization,
  getAllRoles,

} from '../../main-structure/MasterData/MasterDataController/MasterAutorizhation'; // Pastikan path-nya benar

import {
  createDepartment,
  getAllDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,

} from '../../main-structure/MasterData/MasterDataController/MasterDepartment'; // Pastikan path-nya benar

import {
  createSectionDepartment,
  getAllSectionDepartments,
  getSectionDepartmentById,
  updateSectionDepartment,
  deleteSectionDepartment,

} from '../../main-structure/MasterData/MasterDataController/MasterSectionDepartment'; // Pastikan path-nya benar

import {
  createLine,
  getAllLines,
  getLineById,
  updateLine,
  deleteLine,

} from '../../main-structure/MasterData/MasterDataController/MasterLine'; // Pastikan path-nya benar

import {

  createArea,
  getAllAreas,
  getAreaById,
  updateArea,
  deleteArea,

} from '../../main-structure/MasterData/MasterDataController/MasterArea'; // Pastikan path-nya benar

import {
  getAllPlants,
  getPlantById,
} from '../../main-structure/MasterData/MasterDataController/MasterPlant'; // Pastikan path-nya benar


import {

  createDepartmentHead,
  getAllDepartmentHeads,
  getAllDepartmentHeadsbyID,
  updateDepartmentHead,
  softDeleteDepartmentHead,

} from '../../main-structure/MasterData/MasterDataController/MasterHeadDepartments'; // Pastikan path-nya benar


import {

  createSectionHead,
  getAllSectionHeads,
  getAllSectionHeadsbyID,
  updateSectionHead,
  softDeleteSectionHead,

} from '../../main-structure/MasterData/MasterDataController/MasterHeadSection'; // Pastikan path-nya benar


import {
    getAllTemplateApprovals,
    getTemplateApprovalById,
    createTemplateApproval,
    updateTemplateApproval,
    deleteTemplateApproval,
    bulkCreateTemplateApprovals,
    getTemplateApprovalsByTemplateName,
    getTemplateApprovalsByLineCode,
    toggleTemplateApprovalStatus
} from '../../main-structure/MasterData/MasterDataController/MasterApproverProposed';

// Import Template Approval Authorization CRUD functions
import {
    getAllTemplateApprovalAuthorizations,
    getTemplateApprovalAuthorizationById,
    createTemplateApprovalAuthorization,
    updateTemplateApprovalAuthorization,
    deleteTemplateApprovalAuthorization,
    bulkCreateTemplateApprovalAuthorizations,
    getTemplateApprovalAuthorizationsByTemplateName,
    getTemplateApprovalAuthorizationsByLineCode,
    getInsertSteps,
    toggleTemplateApprovalAuthorizationStatus,
    getApprovalFlowByLineCode,
    getUniqueTemplateNames,
    getUniqueLineCodes,
    validateApprovalFlow
} from '../../main-structure/MasterData/MasterDataController/MasterApproverAuthorization';

// Import Template Approval Handover CRUD functions
import {
    getAllTemplateApprovalHandovers,
    getTemplateApprovalHandoverById,
    createTemplateApprovalHandover,
    updateTemplateApprovalHandover,
    deleteTemplateApprovalHandover,
    bulkCreateTemplateApprovalHandovers,
    getTemplateApprovalHandoversByTemplateName,
    getTemplateApprovalHandoversByLineCode
} from '../../main-structure/MasterData/MasterDataController/MasterApproverHandover';

const router = express.Router();

// Routes untuk Area (sesuaikan path-nya)
router.post("/userGodoc", createAuthorization);        // POST /userGodoc
router.get("/userGodoc", getAllAuthorizations);         // GET /userGodoc?page=1&limit=10&search=...&status=true
router.get("/userGodoc/:id", getAuthorizationById);    // GET /userGodoc/123
router.put("/userGodoc/:id", updateAuthorization);    // PUT /userGodoc/123
router.delete("/userGodoc/:id", deleteAuthorization);  // DELETE /areas/123  (Soft Delete)
router.get("/getAllRoles", getAllRoles);         // GET /userGodoc?page=1&limit=10&search=...&status=true

//getAllRoles

// Routes untuk Department (sesuaikan path-nya)
router.post("/departments", createDepartment);        // POST /departments
router.get("/departments", getAllDepartments);         // GET /departments?page=1&limit=10&search=...&status=true
router.get("/departments/:id", getDepartmentById);    // GET /departments/123
router.put("/departments/:id", updateDepartment);    // PUT /departments/123
router.delete("/departments/:id", deleteDepartment);  // DELETE /departments/123  (Soft Delete)

//Section Department
router.post("/sectiondepartments", createSectionDepartment);        // POST /sectiondepartments
router.get("/sectiondepartments", getAllSectionDepartments);         // GET /sectiondepartments?page=1&limit=10&search=...&status=true
router.get("/sectiondepartments/:id", getSectionDepartmentById);    // GET /sectiondepartments/123
router.put("/sectiondepartments/:id", updateSectionDepartment);    // PUT /sectiondepartments/123
router.delete("/sectiondepartments/:id", deleteSectionDepartment);  // DELETE /departments/123  (Soft Delete)

// Routes untuk Line (sesuaikan path-nya)
router.post("/lines", createLine);        // POST /lines
router.get("/lines", getAllLines);         // GET /lines?page=1&limit=10&search=...&status=true
router.get("/lines/:id", getLineById);    // GET /lines/123
router.put("/lines/:id", updateLine);    // PUT /lines/123
router.delete("/lines/:id", deleteLine);  // DELETE /lines/123  (Soft Delete)

// Routes untuk Area (sesuaikan path-nya)
router.post("/areas", createArea);        // POST /areas
router.get("/areas", getAllAreas);         // GET /areas?page=1&limit=10&search=...&status=true
router.get("/areas/:id", getAreaById);    // GET /areas/123
router.put("/areas/:id", updateArea);    // PUT /areas/123
router.delete("/areas/:id", deleteArea);  // DELETE /areas/123  (Soft Delete)


//getAllPlants
router.get("/plants", getAllPlants);         // GET /departments?page=1&limit=10&search=...&status=true
router.get("/plants/:id", getPlantById);


// Routes untuk Area (sesuaikan path-nya)
router.post("/headDepartments", createDepartmentHead);        // POST /headDepartments
router.get("/headDepartments", getAllDepartmentHeads);         // GET /headDepartments?page=1&limit=10&search=...&status=true
router.get("/headDepartments/:id", getAllDepartmentHeadsbyID);    // GET /headDepartments/123
router.put("/headDepartments/:id", updateDepartmentHead);    // PUT /headDepartments/123
router.delete("/headDepartments/:id", softDeleteDepartmentHead);  // DELETE /headDepartments/123  (Soft Delete)

// // Routes untuk Area (sesuaikan path-nya)
router.post("/headSection", createSectionHead);        // POST /headSection
router.get("/headSection", getAllSectionHeads);         // GET /headSection?page=1&limit=10&search=...&status=true
router.get("/headSection/:id", getAllSectionHeadsbyID);    // GET /headSection/123
router.put("/headSection/:id", updateSectionHead);    // PUT /headSection/123
router.delete("/headSection/:id", softDeleteSectionHead);  // DELETE /areas/123  (Soft Delete)

// =====================================================
// 📋 Template Approval Proposed Changes CRUD Operations
// =====================================================

// GET All template approvals with pagination, search, and filters
// Query parameters:
// - page: number (default: 1)
// - limit: number (default: 10)
// - search: string (searches in template_name, line_code, actor_name, model_type, description, created_by)
// - is_active: boolean (true/false)
// - line_code: string (filter by line code)
// - model_type: string (filter by model type)
// - sort: string (id, template_name, line_code, step_order, actor_name, model_type, priority, created_date, updated_date)
// - direction: asc/desc (default: asc)
// Example: /api/approverproposed?page=1&limit=10&search=template&is_active=true&sort=step_order&direction=asc
router.get('/approverproposed', getAllTemplateApprovals);

// GET Template approval by ID
// Example: /api/approverproposed/1
router.get('/approverproposed/:id', getTemplateApprovalById);

// POST Create new template approval
// Body: TemplateApprovalData object
// Required fields: template_name, step_order, actor_name, model_type, created_by
router.post('/approverproposed', createTemplateApproval);

// PUT Update template approval by ID
// Body: TemplateApprovalData object
// Required fields: template_name, step_order, actor_name, model_type, created_by, updated_by
router.put('/approverproposed/:id', updateTemplateApproval);

// DELETE Soft delete template approval by ID
// Body: { deleted_by: string } (optional)
router.delete('/approverproposed/:id', deleteTemplateApproval);

// ==========================
// 📊 Bulk Operations for Proposed Changes
// ==========================

// POST Bulk create template approvals
// Body: { data: TemplateApprovalData[] }
// Returns success/failure count with detailed results
router.post('/approverproposed/bulk/create', bulkCreateTemplateApprovals);

// ==========================
// 🔍 Specialized Queries for Proposed Changes
// ==========================

// GET Template approvals by template name (ordered by step_order)
// Returns active templates only, ordered by step_order ASC
// Example: /api/approverproposed/template/MyTemplate
router.get('/approverproposed/template/:template_name', getTemplateApprovalsByTemplateName);

// GET Template approvals by line code (ordered by template_name, step_order)
// Returns active templates only
// Example: /api/approverproposed/line/LINE001
router.get('/approverproposed/line/:line_code', getTemplateApprovalsByLineCode);

// ==========================
// Status Management for Proposed Changes
// ==========================

// PATCH Toggle active/inactive status
// Body: { updated_by: string } (optional)
router.patch('/approverproposed/:id/toggle-status', toggleTemplateApprovalStatus);

// =====================================================
// 🔐 Template Approval Authorization CRUD Operations
// =====================================================

// GET All template approval authorizations with pagination, search, and filters
// Query parameters:
// - page: number (default: 1)
// - limit: number (default: 10)
// - search: string (searches in template_name, line_code, actor_name, model_type, description, created_by)
// - is_active: boolean (true/false)
// - line_code: string (filter by line code)
// - model_type: string (section/department filter)
// - template_name: string (filter by template name)
// - is_insert_step: boolean (filter insert steps)
// - sort: string (id, template_name, line_code, step_order, actor_name, model_type, priority, is_insert_step, insert_after_step, created_date, updated_date)
// - direction: asc/desc (default: asc)
// Example: /api/approverauthorization?page=1&limit=10&search=department&is_active=true&model_type=department&sort=step_order&direction=asc
router.get('/approverauthorization', getAllTemplateApprovalAuthorizations);

// GET Template approval authorization by ID
// Example: /api/approverauthorization/1
router.get('/approverauthorization/:id', getTemplateApprovalAuthorizationById);

// POST Create new template approval authorization
// Body: TemplateApprovalAuthData object
// Required fields: template_name, step_order, actor_name, model_type, created_by
// Optional: line_code, section_id, use_dynamic_section, use_line_section, is_insert_step, insert_after_step, applies_to_lines, is_active, priority, description
router.post('/approverauthorization', createTemplateApprovalAuthorization);

// PUT Update template approval authorization by ID
// Body: TemplateApprovalAuthData object
// Required fields: template_name, step_order, actor_name, model_type, created_by, updated_by
router.put('/approverauthorization/:id', updateTemplateApprovalAuthorization);

// DELETE Soft delete template approval authorization by ID
// Body: { deleted_by: string } (optional)
router.delete('/approverauthorization/:id', deleteTemplateApprovalAuthorization);

// =====================================================
// 📊 Bulk Operations for Authorization
// =====================================================

// POST Bulk create template approval authorizations
// Body: { data: TemplateApprovalAuthData[] }
// Returns success/failure count with detailed results
router.post('/approverauthorization/bulk/create', bulkCreateTemplateApprovalAuthorizations);

// =====================================================
// 🔍 Specialized Queries for Authorization
// =====================================================

// GET Template approval authorizations by template name (ordered by is_insert_step, step_order)
// Returns active templates only, default steps first, then insert steps
// Example: /api/approverauthorization/template/Default Authorization Flow
router.get('/approverauthorization/template/:template_name', getTemplateApprovalAuthorizationsByTemplateName);

// GET Template approval authorizations by line code (includes insert step logic)
// Returns default templates + applicable insert steps for the line code
// Example: /api/approverauthorization/line/GBL
router.get('/approverauthorization/line/:line_code', getTemplateApprovalAuthorizationsByLineCode);

// GET Insert steps only (with optional line code filter)
// Query parameter: line_code (optional)
// Example: /api/approverauthorization/insert-steps?line_code=GBL
router.get('/approverauthorization/insert-steps', getInsertSteps);

// =====================================================
// 🌊 Approval Flow Management
// =====================================================

// GET Complete approval flow for specific line code (simulates getAuthApprovalTemplates)
// Returns the final approval flow with default + insert steps properly ordered
// Example: /api/approverauthorization/flow/GBL
router.get('/approverauthorization/flow/:line_code', getApprovalFlowByLineCode);

// POST Validate approval flow for line code
// Body: { line_code: string }
// Returns validation results with warnings and errors
// Example: POST /api/approverauthorization/validate-flow
router.post('/approverauthorization/validate-flow', validateApprovalFlow);

// =====================================================
// 📊 Utility Endpoints
// =====================================================

// GET Unique template names (for dropdowns)
// Returns array of unique template names from active records
// Example: /api/approverauthorization/template-names
router.get('/approverauthorization/template-names', getUniqueTemplateNames);

// GET Unique line codes (for dropdowns)
// Returns array of unique line codes from applies_to_lines field
// Example: /api/approverauthorization/line-codes
router.get('/approverauthorization/line-codes', getUniqueLineCodes);

// =====================================================
// ⚙️ Status Management for Authorization
// =====================================================

// PATCH Toggle active/inactive status
// Body: { updated_by: string } (optional)
router.patch('/approverauthorization/:id/toggle-status', toggleTemplateApprovalAuthorizationStatus);

// =====================================================
// 🏢 Template Approval Handover CRUD Operations
// =====================================================

// GET All template approval handovers with pagination, search, and filters
// Query parameters:
// - page: number (default: 1)
// - limit: number (default: 10)
// - search: string (searches in template_name, line_code, actor_name, model_type, description, created_by)
// - is_active: boolean (true/false)
// - line_code: string (filter by line code)
// - model_type: string (section/department filter)
// - template_name: string (filter by template name)
// - is_insert_step: boolean (filter insert steps)
// - sort: string (id, template_name, line_code, step_order, actor_name, model_type, priority, is_insert_step, insert_after_step, created_date, updated_date)
// - direction: asc/desc (default: asc)
// Example: /api/approverhandover?page=1&limit=10&search=handover&is_active=true&model_type=section&sort=step_order&direction=asc
router.get('/approverhandover', getAllTemplateApprovalHandovers);

// GET Template approval handover by ID
// Example: /api/approverhandover/1
router.get('/approverhandover/:id', getTemplateApprovalHandoverById);

// POST Create new template approval handover
// Body: TemplateApprovalHandoverData object
// Required fields: template_name, step_order, actor_name, model_type, created_by
// Optional: line_code, section_id, use_dynamic_section, use_line_section, is_insert_step, insert_after_step, applies_to_lines, is_active, priority, description
router.post('/approverhandover', createTemplateApprovalHandover);

// PUT Update template approval handover by ID
// Body: TemplateApprovalHandoverData object
// Required fields: template_name, step_order, actor_name, model_type, created_by, updated_by
router.put('/approverhandover/:id', updateTemplateApprovalHandover);

// DELETE Soft delete template approval handover by ID
// Body: { deleted_by: string } (optional)
router.delete('/approverhandover/:id', deleteTemplateApprovalHandover);

// =====================================================
// 📊 Bulk Operations for Handover
// =====================================================

// POST Bulk create template approval handovers
// Body: { data: TemplateApprovalHandoverData[] }
// Returns success/failure count with detailed results
router.post('/approverhandover/bulk/create', bulkCreateTemplateApprovalHandovers);

// =====================================================
// 🔍 Specialized Queries for Handover
// =====================================================

// GET Template approval handovers by template name (ordered by is_insert_step, step_order)
// Returns active templates only, default steps first, then insert steps
// Example: /api/approverhandover/template/Default Handover Flow
router.get('/approverhandover/template/:template_name', getTemplateApprovalHandoversByTemplateName);

// GET Template approval handovers by line code (includes insert step logic)
// Returns default templates + applicable insert steps for the line code
// Example: /api/approverhandover/line/GBL
router.get('/approverhandover/line/:line_code', getTemplateApprovalHandoversByLineCode);

export default router;