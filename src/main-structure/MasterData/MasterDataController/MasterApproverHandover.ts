import { Request, Response } from "express";
import { prismaDB2 } from "../../../config/database";

// --- Helper Functions ---

// Interface untuk validasi input
interface TemplateApprovalHandoverData {
    template_name: string;
    line_code?: string;
    step_order: number;
    actor_name: string;
    model_type: string;
    section_id?: number;
    use_dynamic_section?: boolean;
    use_line_section?: boolean;
    is_insert_step?: boolean;
    insert_after_step?: number;
    applies_to_lines?: string[] | string;
    is_active?: boolean;
    priority?: number;
    description?: string;
    created_by: string;
    updated_by?: string;
}

// Interface untuk WHERE condition
interface TemplateHandoverWhereCondition {
    AND?: Array<Record<string, any>>;
    OR?: Array<Record<string, any>>;
    is_deleted?: boolean;
    is_active?: boolean;
}

// Helper function untuk parse applies_to_lines
function parseAppliesToLines(data: string[] | string | null | undefined): any {
    if (!data) return null;
    
    if (Array.isArray(data)) {
        return JSON.stringify(data);
    }
    
    if (typeof data === 'string') {
        try {
            // If it's already a JSON string, validate it
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
                return data;
            }
            // If it's a single string, convert to array
            return JSON.stringify([data]);
        } catch {
            // If it's not JSON, treat as single string
            return JSON.stringify([data]);
        }
    }
    
    return null;
}

// Helper function untuk format applies_to_lines untuk response
function formatAppliesToLines(data: any): string[] | null {
    if (!data) return null;
    
    try {
        if (typeof data === 'string') {
            return JSON.parse(data);
        }
        if (Array.isArray(data)) {
            return data;
        }
        return null;
    } catch {
        return null;
    }
}

// Fungsi validasi input untuk mst_template_approval_handover
function validateTemplateApprovalHandoverData(data: any): string[] {
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
    } else if (!["section", "department"].includes(data.model_type)) {
        errors.push("Model type must be either 'section' or 'department'.");
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

    if (data.insert_after_step !== undefined && data.insert_after_step !== null && (!Number.isInteger(data.insert_after_step) || data.insert_after_step < 0)) {
        errors.push("Insert after step must be a non-negative integer.");
    }

    // Boolean validation
    if (data.use_dynamic_section !== undefined && typeof data.use_dynamic_section !== "boolean") {
        errors.push("Use dynamic section must be a boolean.");
    }

    if (data.use_line_section !== undefined && typeof data.use_line_section !== "boolean") {
        errors.push("Use line section must be a boolean.");
    }

    if (data.is_insert_step !== undefined && typeof data.is_insert_step !== "boolean") {
        errors.push("Is insert step must be a boolean.");
    }

    if (data.is_active !== undefined && typeof data.is_active !== "boolean") {
        errors.push("Is active must be a boolean.");
    }

    // Validation for insert step logic
    if (data.is_insert_step === true) {
        if (data.insert_after_step === undefined || data.insert_after_step === null) {
            errors.push("Insert after step is required when is_insert_step is true.");
        }
        
        if (!data.applies_to_lines || (Array.isArray(data.applies_to_lines) && data.applies_to_lines.length === 0)) {
            errors.push("Applies to lines is required when is_insert_step is true.");
        }
    }

    // Validation for applies_to_lines format
    if (data.applies_to_lines) {
        if (typeof data.applies_to_lines === 'string') {
            try {
                const parsed = JSON.parse(data.applies_to_lines);
                if (!Array.isArray(parsed)) {
                    errors.push("Applies to lines must be an array of strings.");
                }
            } catch {
                // If it's not JSON, treat as single string - this is valid
            }
        } else if (!Array.isArray(data.applies_to_lines)) {
            errors.push("Applies to lines must be an array of strings or a JSON string.");
        }
    }

    return errors;
}

// --- CRUD Functions ---

// Get all template approval handovers with pagination and search
export const getAllTemplateApprovalHandovers = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || "";
        const isActive = req.query.is_active === "true" ? true : req.query.is_active === "false" ? false : undefined;
        const sortColumn = (req.query.sort as string) || "id";
        const sortDirection = req.query.direction === "desc" ? "desc" : "asc";
        const lineCode = req.query.line_code as string;
        const modelType = req.query.model_type as string;
        const templateName = req.query.template_name as string;
        const isInsertStep = req.query.is_insert_step === "true" ? true : req.query.is_insert_step === "false" ? false : undefined;

        const validSortColumns = [
            "id", "template_name", "line_code", "step_order", "actor_name", 
            "model_type", "priority", "is_insert_step", "insert_after_step", "created_date", "updated_date"
        ];

        const orderBy: any = validSortColumns.includes(sortColumn)
            ? { [sortColumn]: sortDirection }
            : { id: "asc" };

        const offset = (page - 1) * limit;

        const whereCondition: TemplateHandoverWhereCondition = {
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

        // Filter by template name
        if (templateName) {
            andConditions.push({ template_name: templateName });
        }

        // Filter by insert step
        if (isInsertStep !== undefined) {
            andConditions.push({ is_insert_step: isInsertStep });
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

        const [templateHandovers, totalCount] = await prismaDB2.$transaction([
            prismaDB2.mst_template_approval_handover.findMany({
                where: whereCondition,
                orderBy,
                skip: offset,
                take: limit,
                include: {
                    section_department: {
                        select: {
                            id: true,
                            section_name: true,
                            department: {
                                select: {
                                    id: true,
                                    department_name: true
                                }
                            }
                        }
                    }
                }
            }),
            prismaDB2.mst_template_approval_handover.count({
                where: whereCondition
            })
        ]);

        // Format the response data
        const formattedData = templateHandovers.map(item => ({
            ...item,
            applies_to_lines: formatAppliesToLines(item.applies_to_lines)
        }));

        const totalPages = Math.ceil(totalCount / limit);

        res.status(200).json({
            data: formattedData,
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
        console.error("❌ Error fetching template approval handovers:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Get template approval handover by ID
export const getTemplateApprovalHandoverById = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID parameter" });
            return;
        }

        const templateHandover = await prismaDB2.mst_template_approval_handover.findFirst({
            where: {
                id: id,
                is_deleted: false
            },
            include: {
                section_department: {
                    select: {
                        id: true,
                        section_name: true,
                        department: {
                            select: {
                                id: true,
                                department_name: true
                            }
                        }
                    }
                }
            }
        });

        if (!templateHandover) {
            res.status(404).json({ error: "Template approval handover not found" });
            return;
        }

        // Format applies_to_lines for response
        const formattedData = {
            ...templateHandover,
            applies_to_lines: formatAppliesToLines(templateHandover.applies_to_lines)
        };

        res.status(200).json({ data: formattedData });

    } catch (error) {
        console.error("❌ Error fetching template approval handover by ID:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Create new template approval handover
export const createTemplateApprovalHandover = async (req: Request, res: Response): Promise<void> => {
    try {
        const validationErrors = validateTemplateApprovalHandoverData(req.body);
        if (validationErrors.length > 0) {
            res.status(400).json({ errors: validationErrors });
            return;
        }

        const data: TemplateApprovalHandoverData = req.body;
        const parsedAppliesToLines = parseAppliesToLines(data.applies_to_lines);

        const newTemplateHandover = await prismaDB2.$transaction(async (tx) => {
            // Check for duplicate
            const existingTemplate = await tx.mst_template_approval_handover.findFirst({
                where: {
                    template_name: data.template_name,
                    step_order: data.step_order,
                    model_type: data.model_type as any,
                    line_code: data.line_code || null,
                    is_deleted: false
                }
            });

            if (existingTemplate) {
                // Throw error to be caught by outer catch block
                throw new Error("DUPLICATE_TEMPLATE");
            }

            // Create new record
            return await tx.mst_template_approval_handover.create({
                data: {
                    template_name: data.template_name,
                    line_code: data.line_code || null,
                    step_order: data.step_order,
                    actor_name: data.actor_name,
                    model_type: data.model_type as any,
                    section_id: data.section_id ?? null,
                    use_dynamic_section: data.use_dynamic_section ?? false,
                    use_line_section: data.use_line_section ?? false,
                    is_insert_step: data.is_insert_step ?? false,
                    insert_after_step: data.insert_after_step ?? null,
                    applies_to_lines: parsedAppliesToLines,
                    is_active: data.is_active ?? true,
                    priority: data.priority ?? 0,
                    description: data.description || null,
                    created_by: data.created_by,
                    created_date: new Date(),
                    updated_by: data.created_by,
                    updated_date: new Date(),
                    is_deleted: false
                },
                include: {
                    section_department: {
                        select: {
                            id: true,
                            section_name: true,
                            department: {
                                select: {
                                    id: true,
                                    department_name: true
                                }
                            }
                        }
                    }
                }
            });
        });

        const formattedData = {
            ...newTemplateHandover,
            applies_to_lines: formatAppliesToLines(newTemplateHandover.applies_to_lines)
        };

        res.status(201).json({
            message: "Template approval handover created successfully",
            data: formattedData
        });

    } catch (error) {
        if (error instanceof Error && error.message === "DUPLICATE_TEMPLATE") {
            res.status(409).json({ 
                error: "Template approval handover with same name, step order, model type, and line code already exists" 
            });
        } else {
            console.error("❌ Error creating template approval handover:", error);
            res.status(500).json({ 
                error: "Internal Server Error", 
                details: error instanceof Error ? error.message : "Unknown error" 
            });
        }
    }
};

// Update template approval handover
export const updateTemplateApprovalHandover = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID parameter" });
            return;
        }

        const validationErrors = validateTemplateApprovalHandoverData(req.body);
        if (validationErrors.length > 0) {
            res.status(400).json({ errors: validationErrors });
            return;
        }

        // Check if template approval handover exists
        const existingTemplate = await prismaDB2.mst_template_approval_handover.findFirst({
            where: {
                id: id,
                is_deleted: false
            }
        });

        if (!existingTemplate) {
            res.status(404).json({ error: "Template approval handover not found" });
            return;
        }

        const data: TemplateApprovalHandoverData = req.body;

        // Check for duplicate template_name, step_order, and model_type combination (excluding current record)
        const duplicateTemplate = await prismaDB2.mst_template_approval_handover.findFirst({
            where: {
                template_name: data.template_name,
                step_order: data.step_order,
                model_type: data.model_type as any,
                line_code: data.line_code || null,
                id: { not: id },
                is_deleted: false
            }
        });

        if (duplicateTemplate) {
            res.status(409).json({ 
                error: "Template approval handover with same name, step order, model type, and line code already exists" 
            });
            return;
        }

        // Parse applies_to_lines
        const parsedAppliesToLines = parseAppliesToLines(data.applies_to_lines);

        const updatedTemplateHandover = await prismaDB2.mst_template_approval_handover.update({
            where: { id: id },
            data: {
                template_name: data.template_name,
                line_code: data.line_code || null,
                step_order: data.step_order,
                actor_name: data.actor_name,
                model_type: data.model_type as any,
                section_id: data.section_id ?? null,
                use_dynamic_section: data.use_dynamic_section ?? false,
                use_line_section: data.use_line_section ?? false,
                is_insert_step: data.is_insert_step ?? false,
                insert_after_step: data.insert_after_step ?? null,
                applies_to_lines: parsedAppliesToLines,
                is_active: data.is_active ?? true,
                priority: data.priority ?? 0,
                description: data.description || null,
                updated_by: data.updated_by || data.created_by,
                updated_date: new Date()
            },
            include: {
                section_department: {
                    select: {
                        id: true,
                        section_name: true,
                        department: {
                            select: {
                                id: true,
                                department_name: true
                            }
                        }
                    }
                }
            }
        });

        // Format response
        const formattedData = {
            ...updatedTemplateHandover,
            applies_to_lines: formatAppliesToLines(updatedTemplateHandover.applies_to_lines)
        };

        res.status(200).json({
            message: "Template approval handover updated successfully",
            data: formattedData
        });

    } catch (error) {
        console.error("❌ Error updating template approval handover:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Soft delete template approval handover
export const deleteTemplateApprovalHandover = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);
        const deletedBy = req.body.deleted_by || "system";

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID parameter" });
            return;
        }

        // Check if template approval handover exists
        const existingTemplate = await prismaDB2.mst_template_approval_handover.findFirst({
            where: {
                id: id,
                is_deleted: false
            }
        });

        if (!existingTemplate) {
            res.status(404).json({ error: "Template approval handover not found" });
            return;
        }

        // Soft delete
        await prismaDB2.mst_template_approval_handover.update({
            where: { id: id },
            data: {
                is_deleted: true,
                is_active: false,
                updated_by: deletedBy,
                updated_date: new Date()
            }
        });

        res.status(200).json({
            message: "Template approval handover deleted successfully"
        });

    } catch (error) {
        console.error("❌ Error deleting template approval handover:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Bulk create template approval handovers
export const bulkCreateTemplateApprovalHandovers = async (req: Request, res: Response): Promise<void> => {
    try {
        const { data: templateHandovers } = req.body;

        if (!Array.isArray(templateHandovers) || templateHandovers.length === 0) {
            res.status(400).json({ error: "Data must be a non-empty array" });
            return;
        }

        const successes: any[] = [];
        const failures: any[] = [];

        await prismaDB2.$transaction(async (txRaw) => {
            const tx = txRaw as typeof prismaDB2;
            for (let i = 0; i < templateHandovers.length; i++) {
                try {
                    const validationErrors = validateTemplateApprovalHandoverData(templateHandovers[i]);
                    if (validationErrors.length > 0) {
                        failures.push({ 
                            index: i, 
                            error: `Validation failed: ${validationErrors.join(", ")}` 
                        });
                        continue;
                    }

                    const data: TemplateApprovalHandoverData = templateHandovers[i];

                    // Check for duplicate
                    const existingTemplate = await tx.mst_template_approval_handover.findFirst({
                        where: {
                            template_name: data.template_name,
                            step_order: data.step_order,
                            model_type: data.model_type as any,
                            line_code: data.line_code || null,
                            is_deleted: false
                        }
                    });

                    if (existingTemplate) {
                        failures.push({ 
                            index: i, 
                            error: "Template approval handover with same name, step order, model type, and line code already exists" 
                        });
                        continue;
                    }

                    // Parse applies_to_lines
                    const parsedAppliesToLines = parseAppliesToLines(data.applies_to_lines);

                    const result = await tx.mst_template_approval_handover.create({
                        data: {
                            template_name: data.template_name,
                            line_code: data.line_code || null,
                            step_order: data.step_order,
                            actor_name: data.actor_name,
                            model_type: data.model_type as any,
                            section_id: data.section_id ?? null,
                            use_dynamic_section: data.use_dynamic_section ?? false,
                            use_line_section: data.use_line_section ?? false,
                            is_insert_step: data.is_insert_step ?? false,
                            insert_after_step: data.insert_after_step ?? null,
                            applies_to_lines: parsedAppliesToLines,
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

                    successes.push({
                        ...result,
                        applies_to_lines: formatAppliesToLines(result.applies_to_lines)
                    });
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
                message: `${successes.length} template approval handovers created successfully`,
                data: successes
            });
        } else {
            res.status(207).json({
                message: `${successes.length} template approval handovers created, ${failures.length} failed`,
                successes,
                failures
            });
        }

    } catch (error) {
        console.error("❌ Error bulk creating template approval handovers:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Get template approval handovers by template name
export const getTemplateApprovalHandoversByTemplateName = async (req: Request, res: Response): Promise<void> => {
    try {
        const templateName = req.params.template_name;
        
        if (!templateName) {
            res.status(400).json({ error: "Template name is required" });
            return;
        }

        const templateHandovers = await prismaDB2.mst_template_approval_handover.findMany({
            where: {
                template_name: templateName,
                is_deleted: false,
                is_active: true
            },
            orderBy: [
                { is_insert_step: "asc" }, // Default steps first, then insert steps
                { step_order: "asc" }
            ],
            include: {
                section_department: {
                    select: {
                        id: true,
                        section_name: true,
                        department: {
                            select: {
                                id: true,
                                department_name: true
                            }
                        }
                    }
                }
            }
        });

        // Format the response data
        const formattedData = templateHandovers.map(item => ({
            ...item,
            applies_to_lines: formatAppliesToLines(item.applies_to_lines)
        }));

        res.status(200).json({
            data: formattedData,
            count: formattedData.length
        });

    } catch (error) {
        console.error("❌ Error fetching template approval handovers by template name:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Get template approval handovers by line code (including insert steps)
export const getTemplateApprovalHandoversByLineCode = async (req: Request, res: Response): Promise<void> => {
    try {
        const lineCode = req.params.line_code;
        
        if (!lineCode) {
            res.status(400).json({ error: "Line code is required" });
            return;
        }

        // Get default templates (base flow)
        const defaultTemplates = await prismaDB2.mst_template_approval_handover.findMany({
            where: {
                line_code: null,
                is_insert_step: false,
                is_active: true,
                is_deleted: false
            },
            orderBy: { step_order: 'asc' },
            include: {
                section_department: {
                    select: {
                        id: true,
                        section_name: true,
                        department: {
                            select: {
                                id: true,
                                department_name: true
                            }
                        }
                    }
                }
            }
        });

        // Get insert steps that apply to this line code
        const insertSteps = await prismaDB2.mst_template_approval_handover.findMany({
            where: {
                is_insert_step: true,
                is_active: true,
                is_deleted: false
            },
            include: {
                section_department: {
                    select: {
                        id: true,
                        section_name: true,
                        department: {
                            select: {
                                id: true,
                                department_name: true
                            }
                        }
                    }
                }
            }
        });

        // Filter insert steps that apply to this line code
        const applicableInsertSteps = insertSteps.filter(step => {
            const appliesToLines = formatAppliesToLines(step.applies_to_lines);
            return appliesToLines && appliesToLines.includes(lineCode);
        });

        // Combine all templates
        const allTemplates = [...defaultTemplates, ...applicableInsertSteps];

        // Format the response data
        const formattedData = allTemplates.map(item => ({
            ...item,
            applies_to_lines: formatAppliesToLines(item.applies_to_lines)
        }));

        res.status(200).json({
            data: formattedData,
            count: formattedData.length,
            default_steps: defaultTemplates.length,
            insert_steps: applicableInsertSteps.length
        });

    } catch (error) {
        console.error("❌ Error fetching template approval handovers by line code:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Get insert steps only
export const getInsertSteps = async (req: Request, res: Response): Promise<void> => {
    try {
        const lineCode = req.query.line_code as string;

        const whereCondition: any = {
            is_insert_step: true,
            is_active: true,
            is_deleted: false
        };

        const insertSteps = await prismaDB2.mst_template_approval_authorization.findMany({
            where: whereCondition,
            orderBy: [
                { insert_after_step: "asc" },
                { priority: "desc" }
            ],
            include: {
                section_department: {
                    select: {
                        id: true,
                        section_name: true,
                        department: {
                            select: {
                                id: true,
                                department_name: true
                            }
                        }
                    }
                }
            }
        });

        // Filter by line code if provided
        let filteredSteps = insertSteps;
        if (lineCode) {
            filteredSteps = insertSteps.filter(step => {
                const appliesToLines = formatAppliesToLines(step.applies_to_lines);
                return appliesToLines && appliesToLines.includes(lineCode);
            });
        }

        // Format the response data
        const formattedData = filteredSteps.map(item => ({
            ...item,
            applies_to_lines: formatAppliesToLines(item.applies_to_lines)
        }));

        res.status(200).json({
            data: formattedData,
            count: formattedData.length
        });

    } catch (error) {
        console.error("❌ Error fetching insert steps:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Toggle active status
export const toggleTemplateApprovalAuthorizationStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);
        const updatedBy = req.body.updated_by || "system";

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID parameter" });
            return;
        }

        // Check if template approval authorization exists
        const existingTemplate = await prismaDB2.mst_template_approval_authorization.findFirst({
            where: {
                id: id,
                is_deleted: false
            }
        });

        if (!existingTemplate) {
            res.status(404).json({ error: "Template approval authorization not found" });
            return;
        }

        const updatedTemplate = await prismaDB2.mst_template_approval_authorization.update({
            where: { id: id },
            data: {
                is_active: !existingTemplate.is_active,
                updated_by: updatedBy,
                updated_date: new Date()
            },
            include: {
                section_department: {
                    select: {
                        id: true,
                        section_name: true,
                        department: {
                            select: {
                                id: true,
                                department_name: true
                            }
                        }
                    }
                }
            }
        });

        // Format response
        const formattedData = {
            ...updatedTemplate,
            applies_to_lines: formatAppliesToLines(updatedTemplate.applies_to_lines)
        };

        res.status(200).json({
            message: `Template approval authorization ${updatedTemplate.is_active ? 'activated' : 'deactivated'} successfully`,
            data: formattedData
        });

    } catch (error) {
        console.error("❌ Error toggling template approval authorization status:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Get template approval flow for specific line (simulates the getAuthApprovalTemplates function)
export const getApprovalFlowByLineCode = async (req: Request, res: Response): Promise<void> => {
    try {
        const lineCode = req.params.line_code;
        
        if (!lineCode) {
            res.status(400).json({ error: "Line code is required" });
            return;
        }

        console.log(`🎯 Getting approval flow for line_code: ${lineCode}`);

        // 1. Get default templates (base flow)
        const defaultTemplates = await prismaDB2.mst_template_approval_authorization.findMany({
            where: {
                line_code: null,
                is_insert_step: false,
                is_active: true,
                is_deleted: false
            },
            orderBy: { step_order: 'asc' },
            include: {
                section_department: {
                    select: {
                        id: true,
                        section_name: true,
                        department: {
                            select: {
                                id: true,
                                department_name: true
                            }
                        }
                    }
                }
            }
        });

        // 2. Get insert steps
        const insertSteps = await prismaDB2.mst_template_approval_authorization.findMany({
            where: {
                is_insert_step: true,
                is_active: true,
                is_deleted: false
            },
            include: {
                section_department: {
                    select: {
                        id: true,
                        section_name: true,
                        department: {
                            select: {
                                id: true,
                                department_name: true
                            }
                        }
                    }
                }
            }
        });

        // 3. Filter insert steps that apply to this line code
        const applicableInsertSteps = insertSteps.filter(step => {
            const appliesToLines = formatAppliesToLines(step.applies_to_lines);
            return appliesToLines && appliesToLines.includes(lineCode);
        });

        console.log(`📋 Found ${defaultTemplates.length} default templates and ${applicableInsertSteps.length} applicable insert steps`);

        // 4. If no insert steps, return default flow
        if (applicableInsertSteps.length === 0) {
            const formattedDefaultData = defaultTemplates.map((template, index) => ({
                ...template,
                step_order: index + 1, // Ensure sequential ordering
                applies_to_lines: formatAppliesToLines(template.applies_to_lines),
                flow_type: 'default'
            }));

            res.status(200).json({
                data: formattedDefaultData,
                flow_info: {
                    line_code: lineCode,
                    total_steps: formattedDefaultData.length,
                    default_steps: formattedDefaultData.length,
                    insert_steps: 0,
                    flow_type: 'default_only'
                }
            });
            return;
        }

        // 5. Build final flow with insert steps at correct positions
        const finalFlow: any[] = [];
        let currentStep = 1;

        // Group insert steps by insert_after_step
        const insertStepMap = new Map<number, any[]>();
        applicableInsertSteps.forEach(step => {
            const afterStep = step.insert_after_step || 0;
            if (!insertStepMap.has(afterStep)) {
                insertStepMap.set(afterStep, []);
            }
            insertStepMap.get(afterStep)!.push(step);
        });

        // Process each default template and insert steps at correct positions
        defaultTemplates.forEach((defaultTemplate, index) => {
            // Add default template
            finalFlow.push({
                ...defaultTemplate,
                step_order: currentStep++,
                applies_to_lines: formatAppliesToLines(defaultTemplate.applies_to_lines),
                flow_type: 'default'
            });

            // Check for insert steps after this step
            const insertsAfterThisStep = insertStepMap.get(defaultTemplate.step_order) || [];
            insertsAfterThisStep.forEach(insertStep => {
                finalFlow.push({
                    ...insertStep,
                    step_order: currentStep++,
                    applies_to_lines: formatAppliesToLines(insertStep.applies_to_lines),
                    flow_type: 'insert'
                });
            });
        });

        res.status(200).json({
            data: finalFlow,
            flow_info: {
                line_code: lineCode,
                total_steps: finalFlow.length,
                default_steps: defaultTemplates.length,
                insert_steps: applicableInsertSteps.length,
                flow_type: 'combined'
            }
        });

    } catch (error) {
        console.error("❌ Error getting approval flow by line code:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Get unique template names
export const getUniqueTemplateNames = async (req: Request, res: Response): Promise<void> => {
    try {
        const templates = await prismaDB2.mst_template_approval_authorization.findMany({
            where: {
                is_deleted: false,
                is_active: true
            },
            select: {
                template_name: true
            },
            distinct: ['template_name'],
            orderBy: {
                template_name: 'asc'
            }
        });

        const templateNames = templates.map(t => t.template_name);

        res.status(200).json({
            data: templateNames,
            count: templateNames.length
        });

    } catch (error) {
        console.error("❌ Error fetching unique template names:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Get unique line codes from applies_to_lines
export const getUniqueLineCodes = async (req: Request, res: Response): Promise<void> => {
    try {
        // Get all templates and filter in JavaScript since Prisma Json filtering can be tricky
        const allTemplates = await prismaDB2.mst_template_approval_authorization.findMany({
            where: {
                is_deleted: false,
                is_active: true
            },
            select: {
                applies_to_lines: true
            }
        });

        // Filter templates that have applies_to_lines data
        const templatesWithLinesCodes = allTemplates.filter(template => 
            template.applies_to_lines !== null && template.applies_to_lines !== undefined
        );

        const allLineCodes = new Set<string>();

        templatesWithLinesCodes.forEach(template => {
            const lineCodes = formatAppliesToLines(template.applies_to_lines);
            if (lineCodes && lineCodes.length > 0) {
                lineCodes.forEach(code => {
                    if (code && code.trim()) {
                        allLineCodes.add(code.trim());
                    }
                });
            }
        });

        const uniqueLineCodes = Array.from(allLineCodes).sort();

        res.status(200).json({
            data: uniqueLineCodes,
            count: uniqueLineCodes.length
        });

    } catch (error) {
        console.error("❌ Error fetching unique line codes:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};

// Validate approval flow for line code
export const validateApprovalFlow = async (req: Request, res: Response): Promise<void> => {
    try {
        const { line_code } = req.body;
        
        if (!line_code) {
            res.status(400).json({ error: "Line code is required" });
            return;
        }

        // Get approval flow
        const defaultTemplates = await prismaDB2.mst_template_approval_authorization.findMany({
            where: {
                line_code: null,
                is_insert_step: false,
                is_active: true,
                is_deleted: false
            },
            orderBy: { step_order: 'asc' }
        });

        const insertSteps = await prismaDB2.mst_template_approval_authorization.findMany({
            where: {
                is_insert_step: true,
                is_active: true,
                is_deleted: false
            }
        });

        const applicableInsertSteps = insertSteps.filter(step => {
            const appliesToLines = formatAppliesToLines(step.applies_to_lines);
            return appliesToLines && appliesToLines.includes(line_code);
        });

        // Validation checks
        const validationResults = {
            is_valid: true,
            warnings: [] as string[],
            errors: [] as string[],
            flow_summary: {
                default_steps: defaultTemplates.length,
                insert_steps: applicableInsertSteps.length,
                total_steps: defaultTemplates.length + applicableInsertSteps.length
            }
        };

        // Check if there are any default templates
        if (defaultTemplates.length === 0) {
            validationResults.errors.push("No default approval templates found");
            validationResults.is_valid = false;
        }

        // Check for step order gaps in default templates
        const defaultStepOrders = defaultTemplates.map(t => t.step_order).sort((a, b) => a - b);
        for (let i = 1; i < defaultStepOrders.length; i++) {
            if (defaultStepOrders[i] !== defaultStepOrders[i-1] + 1) {
                validationResults.warnings.push(`Gap in default template step order between ${defaultStepOrders[i-1]} and ${defaultStepOrders[i]}`);
            }
        }

        // Check insert steps validity
        applicableInsertSteps.forEach(step => {
            if (step.insert_after_step === null || step.insert_after_step === undefined) {
                validationResults.errors.push(`Insert step "${step.actor_name}" has no insert_after_step defined`);
                validationResults.is_valid = false;
            } else if (step.insert_after_step < 0 || step.insert_after_step > defaultTemplates.length) {
                validationResults.errors.push(`Insert step "${step.actor_name}" has invalid insert_after_step: ${step.insert_after_step}`);
                validationResults.is_valid = false;
            }
        });

        res.status(200).json({
            line_code,
            validation: validationResults
        });

    } catch (error) {
        console.error("❌ Error validating approval flow:", error);
        res.status(500).json({ 
            error: "Internal Server Error", 
            details: error instanceof Error ? error.message : "Unknown error" 
        });
    }
};