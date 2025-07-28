import { Request, Response } from "express";
import { prismaDB2 } from "../../../config/database";

// --- Helper Functions ---

// Interface untuk validasi input
interface TemplateApprovalData {
    template_name: string;
    line_code?: string;
    need_engineering_approval?: boolean;
    need_production_approval?: boolean;
    step_order: number;
    actor_name: string;
    model_type: string;
    section_id?: number;
    use_dynamic_section?: boolean;
    use_line_section?: boolean;
    is_active?: boolean;
    priority?: number;
    description?: string;
    created_by: string;
    updated_by?: string;
}

// Interface untuk WHERE condition
interface TemplateWhereCondition {
    AND?: Array<Record<string, any>>;
    OR?: Array<Record<string, any>>;
    is_deleted?: boolean;
    is_active?: boolean;
}

// Fungsi validasi input untuk mst_template_approval_proposedchanges
function validateTemplateApprovalData(data: any): string[] {
    const errors: string[] = [];

    // Required fields validation
    if (!data.template_name || data.template_name.trim() === "") {
        errors.push("Template name is required.");
    } else if (data.template_name.length > 255) {
        errors.push("Template name cannot exceed 255 characters.");
    }

    if (!data.actor_name || data.actor_name.trim() === "") {
        errors.push("Actor name is required.");
    } else if (data.actor_name.length > 255) {
        errors.push("Actor name cannot exceed 255 characters.");
    }

    if (!data.created_by || data.created_by.trim() === "") {
        errors.push("Created by is required.");
    } else if (data.created_by.length > 100) {
        errors.push("Created by cannot exceed 100 characters.");
    }

    if (data.step_order === undefined || data.step_order === null) {
        errors.push("Step order is required.");
    } else if (!Number.isInteger(data.step_order) || data.step_order < 0) {
        errors.push("Step order must be a non-negative integer.");
    }

    if (!data.model_type || data.model_type.trim() === "") {
        errors.push("Model type is required.");
    }

    // Optional fields validation
    if (data.line_code && data.line_code.length > 50) {
        errors.push("Line code cannot exceed 50 characters.");
    }

    if (data.updated_by && data.updated_by.length > 100) {
        errors.push("Updated by cannot exceed 100 characters.");
    }

    if (data.section_id !== undefined && data.section_id !== null && !Number.isInteger(data.section_id)) {
        errors.push("Section ID must be an integer.");
    }

    if (data.priority !== undefined && data.priority !== null && (!Number.isInteger(data.priority) || data.priority < 0)) {
        errors.push("Priority must be a non-negative integer.");
    }

    // Boolean validation
    if (data.need_engineering_approval !== undefined && typeof data.need_engineering_approval !== "boolean") {
        errors.push("Need engineering approval must be a boolean.");
    }

    if (data.need_production_approval !== undefined && typeof data.need_production_approval !== "boolean") {
        errors.push("Need production approval must be a boolean.");
    }

    if (data.use_dynamic_section !== undefined && typeof data.use_dynamic_section !== "boolean") {
        errors.push("Use dynamic section must be a boolean.");
    }

    if (data.use_line_section !== undefined && typeof data.use_line_section !== "boolean") {
        errors.push("Use line section must be a boolean.");
    }

    if (data.is_active !== undefined && typeof data.is_active !== "boolean") {
        errors.push("Is active must be a boolean.");
    }

    return errors;
}

// --- CRUD Functions ---

// Get all template approvals with pagination and search
export const getAllTemplateApprovals = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || "";
        const isActive = req.query.is_active === "true" ? true : req.query.is_active === "false" ? false : undefined;
        const sortColumn = (req.query.sort as string) || "id";
        const sortDirection = req.query.direction === "desc" ? "desc" : "asc";
        const lineCode = req.query.line_code as string;
        const modelType = req.query.model_type as string;

        const validSortColumns = [
            "id", "template_name", "line_code", "step_order", "actor_name", 
            "model_type", "priority", "created_date", "updated_date"
        ];

        const orderBy: any = validSortColumns.includes(sortColumn)
            ? { [sortColumn]: sortDirection }
            : { id: "asc" };

        const offset = (page - 1) * limit;

        const whereCondition: TemplateWhereCondition = {
            is_deleted: false
        };

        const andConditions = [];

        // Filter by active status
        if (isActive !== undefined) {
            andConditions.push({ is_active: isActive });
        }

        // Filter by line code
        if (lineCode) {
            andConditions.push({ line_code: lineCode });
        }

        // Filter by model type
        if (modelType) {
            andConditions.push({ model_type: modelType });
        }

        // Search functionality
        if (searchTerm) {
            andConditions.push({
                OR: [
                    { template_name: { contains: searchTerm } },
                    { line_code: { contains: searchTerm } },
                    { actor_name: { contains: searchTerm } },
                    { model_type: { contains: searchTerm } },
                    { description: { contains: searchTerm } },
                    { created_by: { contains: searchTerm } }
                ]
            });
        }

        if (andConditions.length > 0) {
            whereCondition.AND = andConditions;
        }

        const [templateApprovals, totalCount] = await prismaDB2.$transaction([
            prismaDB2.mst_template_approval_proposedchanges.findMany({
                where: whereCondition,
                orderBy,
                skip: offset,
                take: limit
            }),
            prismaDB2.mst_template_approval_proposedchanges.count({
                where: whereCondition
            })
        ]);

        const totalPages = Math.ceil(totalCount / limit);

        res.status(200).json({
            data: templateApprovals,
            pagination: {
                totalCount,
                totalPages,
                currentPage: page,
                limit,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            }
        });

    } catch (error) {
        console.error("❌ Error fetching template approvals:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Get template approval by ID
export const getTemplateApprovalById = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID parameter" });
            return;
        }

        const templateApproval = await prismaDB2.mst_template_approval_proposedchanges.findFirst({
            where: {
                id: id,
                is_deleted: false
            }
        });

        if (!templateApproval) {
            res.status(404).json({ error: "Template approval not found" });
            return;
        }

        res.status(200).json({ data: templateApproval });

    } catch (error) {
        console.error("❌ Error fetching template approval by ID:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Create new template approval
export const createTemplateApproval = async (req: Request, res: Response): Promise<void> => {
    try {
        const validationErrors = validateTemplateApprovalData(req.body);
        if (validationErrors.length > 0) {
            res.status(400).json({ errors: validationErrors });
            return;
        }

        const data: TemplateApprovalData = req.body;

        // Check for duplicate template_name and step_order combination
        const existingTemplate = await prismaDB2.mst_template_approval_proposedchanges.findFirst({
            where: {
                template_name: data.template_name,
                step_order: data.step_order,
                model_type: data.model_type as any,
                is_deleted: false
            }
        });

        if (existingTemplate) {
            res.status(409).json({ 
                error: "Template approval with same name, step order, and model type already exists" 
            });
            return;
        }

        const newTemplateApproval = await prismaDB2.mst_template_approval_proposedchanges.create({
            data: {
                template_name: data.template_name,
                line_code: data.line_code || null,
                need_engineering_approval: data.need_engineering_approval ?? null,
                need_production_approval: data.need_production_approval ?? null,
                step_order: data.step_order,
                actor_name: data.actor_name,
                model_type: data.model_type as any, // Assuming enum type
                section_id: data.section_id ?? null,
                use_dynamic_section: data.use_dynamic_section ?? false,
                use_line_section: data.use_line_section ?? false,
                is_active: data.is_active ?? true,
                priority: data.priority ?? 0,
                description: data.description || null,
                created_by: data.created_by,
                created_date: new Date(),
                updated_by: data.created_by,
                updated_date: new Date(),
                is_deleted: false
            }
        });

        res.status(201).json({
            message: "Template approval created successfully",
            data: newTemplateApproval
        });

    } catch (error) {
        console.error("❌ Error creating template approval:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Update template approval
export const updateTemplateApproval = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID parameter" });
            return;
        }

        const validationErrors = validateTemplateApprovalData(req.body);
        if (validationErrors.length > 0) {
            res.status(400).json({ errors: validationErrors });
            return;
        }

        // Check if template approval exists
        const existingTemplate = await prismaDB2.mst_template_approval_proposedchanges.findFirst({
            where: {
                id: id,
                is_deleted: false
            }
        });

        if (!existingTemplate) {
            res.status(404).json({ error: "Template approval not found" });
            return;
        }

        const data: TemplateApprovalData = req.body;

        // Check for duplicate template_name and step_order combination (excluding current record)
        const duplicateTemplate = await prismaDB2.mst_template_approval_proposedchanges.findFirst({
            where: {
                template_name: data.template_name,
                step_order: data.step_order,
                model_type: data.model_type as any,
                id: { not: id },
                is_deleted: false
            }
        });

        if (duplicateTemplate) {
            res.status(409).json({ 
                error: "Template approval with same name, step order, and model type already exists" 
            });
            return;
        }

        const updatedTemplateApproval = await prismaDB2.mst_template_approval_proposedchanges.update({
            where: { id: id },
            data: {
                template_name: data.template_name,
                line_code: data.line_code || null,
                need_engineering_approval: data.need_engineering_approval ?? null,
                need_production_approval: data.need_production_approval ?? null,
                step_order: data.step_order,
                actor_name: data.actor_name,
                model_type: data.model_type as any,
                section_id: data.section_id ?? null,
                use_dynamic_section: data.use_dynamic_section ?? false,
                use_line_section: data.use_line_section ?? false,
                is_active: data.is_active ?? true,
                priority: data.priority ?? 0,
                description: data.description || null,
                updated_by: data.updated_by || data.created_by,
                updated_date: new Date()
            }
        });

        res.status(200).json({
            message: "Template approval updated successfully",
            data: updatedTemplateApproval
        });

    } catch (error) {
        console.error("❌ Error updating template approval:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Soft delete template approval
export const deleteTemplateApproval = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);
        const deletedBy = req.body.deleted_by || "system";

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID parameter" });
            return;
        }

        // Check if template approval exists
        const existingTemplate = await prismaDB2.mst_template_approval_proposedchanges.findFirst({
            where: {
                id: id,
                is_deleted: false
            }
        });

        if (!existingTemplate) {
            res.status(404).json({ error: "Template approval not found" });
            return;
        }

        // Soft delete
        await prismaDB2.mst_template_approval_proposedchanges.update({
            where: { id: id },
            data: {
                is_deleted: true,
                is_active: false,
                updated_by: deletedBy,
                updated_date: new Date()
            }
        });

        res.status(200).json({
            message: "Template approval deleted successfully"
        });

    } catch (error) {
        console.error("❌ Error deleting template approval:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Bulk create template approvals
export const bulkCreateTemplateApprovals = async (req: Request, res: Response): Promise<void> => {
    try {
        const { data: templateApprovals } = req.body;

        if (!Array.isArray(templateApprovals) || templateApprovals.length === 0) {
            res.status(400).json({ error: "Data must be a non-empty array" });
            return;
        }

        const successes: any[] = [];
        const failures: any[] = [];

        await prismaDB2.$transaction(async (txRaw) => {
            const tx = txRaw as typeof prismaDB2;
            for (let i = 0; i < templateApprovals.length; i++) {
                try {
                    const validationErrors = validateTemplateApprovalData(templateApprovals[i]);
                    if (validationErrors.length > 0) {
                        failures.push({ 
                            index: i, 
                            error: `Validation failed: ${validationErrors.join(", ")}` 
                        });
                        continue;
                    }

                    const data: TemplateApprovalData = templateApprovals[i];

                    // Check for duplicate
                    const existingTemplate = await tx.mst_template_approval_proposedchanges.findFirst({
                        where: {
                            template_name: data.template_name,
                            step_order: data.step_order,
                            model_type: data.model_type as any,
                            is_deleted: false
                        }
                    });

                    if (existingTemplate) {
                        failures.push({ 
                            index: i, 
                            error: "Template approval with same name, step order, and model type already exists" 
                        });
                        continue;
                    }

                    const result = await tx.mst_template_approval_proposedchanges.create({
                        data: {
                            template_name: data.template_name,
                            line_code: data.line_code || null,
                            need_engineering_approval: data.need_engineering_approval ?? null,
                            need_production_approval: data.need_production_approval ?? null,
                            step_order: data.step_order,
                            actor_name: data.actor_name,
                            model_type: data.model_type as any,
                            section_id: data.section_id ?? null,
                            use_dynamic_section: data.use_dynamic_section ?? false,
                            use_line_section: data.use_line_section ?? false,
                            is_active: data.is_active ?? true,
                            priority: data.priority ?? 0,
                            description: data.description || null,
                            created_by: data.created_by,
                            created_date: new Date(),
                            updated_by: data.created_by,
                            updated_date: new Date(),
                            is_deleted: false
                        }
                    });

                    successes.push(result);
                } catch (err) {
                    console.error(`❌ Failed to insert at index ${i}`, err);
                    failures.push({ 
                        index: i, 
                        error: err instanceof Error ? err.message : "Unknown error" 
                    });
                }
            }
        });

        if (failures.length === 0) {
            res.status(201).json({
                message: `${successes.length} template approvals created successfully`,
                data: successes
            });
        } else {
            res.status(207).json({
                message: `${successes.length} template approvals created, ${failures.length} failed`,
                successes,
                failures
            });
        }

    } catch (error) {
        console.error("❌ Error bulk creating template approvals:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Get template approvals by template name
export const getTemplateApprovalsByTemplateName = async (req: Request, res: Response): Promise<void> => {
    try {
        const templateName = req.params.template_name;
        
        if (!templateName) {
            res.status(400).json({ error: "Template name is required" });
            return;
        }

        const templateApprovals = await prismaDB2.mst_template_approval_proposedchanges.findMany({
            where: {
                template_name: templateName,
                is_deleted: false,
                is_active: true
            },
            orderBy: {
                step_order: "asc"
            }
        });

        res.status(200).json({
            data: templateApprovals,
            count: templateApprovals.length
        });

    } catch (error) {
        console.error("❌ Error fetching template approvals by template name:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Get template approvals by line code
export const getTemplateApprovalsByLineCode = async (req: Request, res: Response): Promise<void> => {
    try {
        const lineCode = req.params.line_code;
        
        if (!lineCode) {
            res.status(400).json({ error: "Line code is required" });
            return;
        }

        const templateApprovals = await prismaDB2.mst_template_approval_proposedchanges.findMany({
            where: {
                line_code: lineCode,
                is_deleted: false,
                is_active: true
            },
            orderBy: [
                { template_name: "asc" },
                { step_order: "asc" }
            ]
        });

        res.status(200).json({
            data: templateApprovals,
            count: templateApprovals.length
        });

    } catch (error) {
        console.error("❌ Error fetching template approvals by line code:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Toggle active status
export const toggleTemplateApprovalStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);
        const updatedBy = req.body.updated_by || "system";

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID parameter" });
            return;
        }

        // Check if template approval exists
        const existingTemplate = await prismaDB2.mst_template_approval_proposedchanges.findFirst({
            where: {
                id: id,
                is_deleted: false
            }
        });

        if (!existingTemplate) {
            res.status(404).json({ error: "Template approval not found" });
            return;
        }

        const updatedTemplate = await prismaDB2.mst_template_approval_proposedchanges.update({
            where: { id: id },
            data: {
                is_active: !existingTemplate.is_active,
                updated_by: updatedBy,
                updated_date: new Date()
            }
        });

        res.status(200).json({
            message: `Template approval ${updatedTemplate.is_active ? 'activated' : 'deactivated'} successfully`,
            data: updatedTemplate
        });

    } catch (error) {
        console.error("❌ Error toggling template approval status:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};