import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";

// Get all proposed changes with relations
// This function retrieves all proposed changes from the database
// It includes related data such as plant, department, section_department, and documentNumber
// It also fetches related authorization documents and handovers
export const getAllProposedChangesWithRelations = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || "";
        const sortColumn = (req.query.sort as string) || "id";
        const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

        const validSortColumns = [
            "id", "project_name", "document_number_id", "item_changes",
            "line_code", "section_code", "department_id",
            "section_department_id", "plant_id", "change_type",
            "status", "created_date", "planning_start", "planning_end",
            "progress", "need_engineering_approval", "need_production_approval"
        ];

        const orderBy: any = validSortColumns.includes(sortColumn)
            ? { [sortColumn]: sortDirection }
            : { id: "asc" };

        const offset = (page - 1) * limit;

        const whereCondition: any = {
            is_deleted: false
        };

        const andConditions = [];

        if (searchTerm) {
            andConditions.push({
                OR: [
                    { project_name: { contains: searchTerm } },
                    { item_changes: { contains: searchTerm } },
                    { line_code: { contains: searchTerm } },
                    { section_code: { contains: searchTerm } },
                    { change_type: { contains: searchTerm } },
                    { description: { contains: searchTerm } },
                    { status: { contains: searchTerm } }
                ]
            });
        }

        // Add other query conditions (auth_id, status, etc.)
        if (req.query.auth_id) {
            andConditions.push({ auth_id: Number(req.query.auth_id) });
        }

        if (req.query.status) {
            andConditions.push({ status: req.query.status as string });
        }

        // Tambahkan filter berdasarkan department_id
        if (req.query.department_id) {
            andConditions.push({ department_id: Number(req.query.department_id) });
        }

        // Add remaining filter conditions (if needed)
        // ...

        if (andConditions.length > 0) {
            whereCondition.AND = andConditions;
        }

        // Select only the fields we need for the main query
        const [proposedChanges, totalCount] = await prismaDB2.$transaction([
            prismaDB2.tr_proposed_changes.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy,
                select: {
                    id: true,
                    project_name: true,
                    document_number_id: true,
                    line_code: true,
                    section_code: true,
                    department_id: true, // Tambahkan department_id di sini
                    status: true,
                    progress: true,
                    progresssupport: true,
                    created_date: true,
                    documentNumber: {
                        select: {
                            running_number: true
                        }
                    }
                }
            }),
            prismaDB2.tr_proposed_changes.count({
                where: whereCondition
            }),
        ]);

        // Fetch only necessary related data 
        const proposedChangeIds = proposedChanges.map(pc => pc.id);
        
        // Get minimal authorization doc info
        const authDocs = await prismaDB2.tr_authorization_doc.findMany({
            where: {
                proposed_change_id: {
                    in: proposedChangeIds
                }
            },
            select: {
                id: true,
                doc_number: true,
                proposed_change_id: true,
                progress: true
            }
        });
        
        // Get minimal handover info
        const handovers = await prismaDB2.tr_handover.findMany({
            where: {
                proposed_change_id: {
                    in: proposedChangeIds
                }
            },
            select: {
                id: true,
                doc_number: true,
                proposed_change_id: true,
                progress: true,
                is_finished: true,
                star: true,
                status: true
            }
        });

        // Group auth docs and handovers by proposed_change_id
        const authDocsByProposedChangeId: Record<number, typeof authDocs> = {};
        const handoversByProposedChangeId: Record<number, typeof handovers> = {};
        
        authDocs.forEach(doc => {
            if (doc.proposed_change_id) {
                if (!authDocsByProposedChangeId[doc.proposed_change_id]) {
                    authDocsByProposedChangeId[doc.proposed_change_id] = [];
                }
                authDocsByProposedChangeId[doc.proposed_change_id].push(doc);
            }
        });
        
        handovers.forEach(handover => {
            if (handover.proposed_change_id) {
                if (!handoversByProposedChangeId[handover.proposed_change_id]) {
                    handoversByProposedChangeId[handover.proposed_change_id] = [];
                }
                handoversByProposedChangeId[handover.proposed_change_id].push(handover);
            }
        });

        // Format the results with only necessary data
        const formattedProposedChanges = proposedChanges.map(item => {
            const relatedAuthDocs = authDocsByProposedChangeId[item.id] || [];
            const relatedHandovers = handoversByProposedChangeId[item.id] || [];
        
            // Only send minimal handover data needed for UI
            const handoverData = relatedHandovers.length > 0 ? {
                is_finished: relatedHandovers[0].is_finished || false,
                star: relatedHandovers[0].star || 0
            } : null;
        
            return {
                id: item.id,
                project_name: item.project_name,
                documentNumber: item.documentNumber,
                department_id: item.department_id, // Tambahkan department_id di sini
                status: item.status,
                progress: item.progress,
                progresssupport: item.progresssupport,
                created_date: item.created_date,
                
                // Auth doc related info
                authorization_doc_ids: relatedAuthDocs.map(doc => doc.id),
                authorization_doc_progress: relatedAuthDocs.map(doc => ({
                    id: doc.id,
                    progress: doc.progress || "0%"
                })),
                
                // Handover related info
                handover_ids: relatedHandovers.map(handover => handover.id),
                handover_progress: relatedHandovers.map(handover => ({
                    id: handover.id,
                    progress: handover.progress || "0%"
                })),
                
                // Minimal all_handover_data with only what's needed
                all_handover_data: handoverData
            };
        });

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        res.status(200).json({
            data: formattedProposedChanges,
            pagination: {
                totalCount,
                totalPages,
                currentPage: page,
                limit,
                hasNextPage,
                hasPreviousPage
            },
        });
    } catch (error: any) {
        console.error("❌ Error in getAllProposedChangesWithRelations:", error);
        res.status(500).json({
            error: "Internal Server Error",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get a specific proposed change by ID with relations
// This function retrieves a specific proposed change by its ID
// It includes related data such as plant, department, section_department, and documentNumber
// It also fetches related authorization documents and handovers
export const getProposedChangeByIdWithRelations = async (req: Request, res: Response): Promise<void> => {
    try {
        const proposedChangeId = Number(req.params.id);
        
        if (isNaN(proposedChangeId)) {
            res.status(400).json({ error: "Invalid ID format" });
            return;
        }

        // Get the proposed change data
        const proposedChange = await prismaDB2.tr_proposed_changes.findUnique({
            where: {
                id: proposedChangeId,
                is_deleted: false
            },
            include: {
                plant: true,
                department: true,
                section_department: true,
                documentNumber: true
            }
        });

        if (!proposedChange) {
            res.status(404).json({ error: "Proposed change not found" });
            return;
        }

        // Get authorization docs for this proposed change
        const authDocs = await prismaDB2.tr_authorization_doc.findMany({
            where: {
                proposed_change_id: proposedChangeId
            },
            select: {
                id: true,
                doc_number: true,
                proposed_change_id: true,
                progress: true
            }
        });
        
        // Get handovers for this proposed change
        // const handovers = await prismaDB2.tr_handover.findMany({
        //     where: {
        //         proposed_change_id: proposedChangeId
        //     },
        //     select: {
        //         id: true,
        //         doc_number: true,
        //         proposed_change_id: true,
        //         progress: true
        //     }
        // });

        const handovers = await prismaDB2.tr_handover.findMany({
            where: {
                 proposed_change_id: proposedChangeId
                
            }
        });
        
        // Format the result to add the additional information
        const formattedProposedChange = {
            ...proposedChange,
            document_number: (proposedChange.documentNumber as any)?.running_number || "not yet",
            has_authorization_doc: authDocs.length > 0 ? 
                authDocs.map(doc => doc.doc_number).join(", ") : 
                "not yet",
            authorization_doc_ids: authDocs.length > 0 ?
                authDocs.map(doc => doc.id) :
                [],
            authorization_doc_progress: authDocs.length > 0 ?
                authDocs.map(doc => ({
                    id: doc.id,
                    doc_number: doc.doc_number,
                    progress: doc.progress || "not available"
                })) :
                [],
            has_handover: handovers.length > 0 ? 
                handovers.map(handover => handover.doc_number).join(", ") : 
                "not yet",
            handover_ids: handovers.length > 0 ?
                handovers.map(handover => handover.id) :
                [],
            handover_progress: handovers.length > 0 ?
                handovers.map(handover => ({
                    id: handover.id,
                    doc_number: handover.doc_number,
                    progress: handover.progress || "not available"
                })) :
                []
        };

        res.status(200).json({
            data: formattedProposedChange
        });
    } catch (error: any) {
        console.error(`❌ Error in getProposedChangeByIdWithRelations: ${error.message}`);
        res.status(500).json({
            error: "Internal Server Error",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get all proposed changes without relations
// This function is similar to getAllProposedChangesWithRelations but without the relations
// and is used for a different endpoint
// It can be used to get a list of proposed changes without the additional data
// This is useful for performance reasons when you only need the basic information
// and not the related data
export const getAllProposedChanges = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || "";
        const sortColumn = (req.query.sort as string) || "id";
        const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

        const validSortColumns = [
            "id", "project_name", "document_number_id", "item_changes",
            "line_code", "section_code", "department_id",
            "section_department_id", "plant_id", "change_type",
            "status", "created_date", "planning_start", "planning_end",
            "progress", "need_engineering_approval", "need_production_approval"
        ];

        const orderBy: any = validSortColumns.includes(sortColumn)
            ? { [sortColumn]: sortDirection }
            : { id: "asc" };

        const offset = (page - 1) * limit;

        // Ambil semua proposed_change_id yang digunakan di tr_authorization_doc
        const usedProposedChangeIds = (await prismaDB2.tr_authorization_doc.findMany({
            select: { proposed_change_id: true },
            where: {
                proposed_change_id: {
                    not: null
                }
            },
            distinct: ['proposed_change_id']
        })).map((item) => item.proposed_change_id);

        const whereCondition: any = {
            is_deleted: false,
            id: {
                notIn: usedProposedChangeIds
            }
        };

        const andConditions = [];

        if (searchTerm) {
            andConditions.push({
                OR: [
                    { project_name: { contains: searchTerm } },
                    { item_changes: { contains: searchTerm } },
                    { line_code: { contains: searchTerm } },
                    { section_code: { contains: searchTerm } },
                    { change_type: { contains: searchTerm } },
                    { description: { contains: searchTerm } },
                    { status: { contains: searchTerm } }
                ]
            });
        }

        if (req.query.auth_id) {
            andConditions.push({ auth_id: Number(req.query.auth_id) });
        }

        if (req.query.status) {
            andConditions.push({ status: req.query.status as string });
        }

        if (req.query.change_type) {
            andConditions.push({ change_type: req.query.change_type as string });
        }

        if (req.query.plant_id) {
            andConditions.push({ plant_id: Number(req.query.plant_id) });
        }

        if (req.query.department_id) {
            andConditions.push({ department_id: Number(req.query.department_id) });
        }

        if (req.query.section_department_id) {
            andConditions.push({ section_department_id: Number(req.query.section_department_id) });
        }

        if (req.query.line_code) {
            andConditions.push({ line_code: req.query.line_code as string });
        }

        if (req.query.need_engineering_approval !== undefined) {
            andConditions.push({
                need_engineering_approval: req.query.need_engineering_approval === "true"
            });
        }

        if (req.query.need_production_approval !== undefined) {
            andConditions.push({
                need_production_approval: req.query.need_production_approval === "true"
            });
        }

        if (req.query.progress) {
            andConditions.push({ progress: req.query.progress as string });
        }

        if (req.query.created_by) {
            andConditions.push({ created_by: req.query.created_by as string });
        }

        if (andConditions.length > 0) {
            whereCondition.AND = andConditions;
        }

        const [proposedChanges, totalCount] = await prismaDB2.$transaction([
            prismaDB2.tr_proposed_changes.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy,
                include: {
                    plant: true,
                    department: true,
                    section_department: true,
                    documentNumber: {
                        include: {
                            plant: true,
                            category: true,
                            area: {
                                include: {
                                    line: true
                                }
                            },
                            section: true,
                            authorization: true
                        }
                    }
                }
            }),
            prismaDB2.tr_proposed_changes.count({
                where: whereCondition
            }),
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        res.status(200).json({
            data: proposedChanges,
            pagination: {
                totalCount,
                totalPages,
                currentPage: page,
                limit,
                hasNextPage,
                hasPreviousPage
            },
        });
    } catch (error: any) {
        console.error("❌ Error in getAllProposedChanges:", error);
        res.status(500).json({
            error: "Internal Server Error",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Soft delete a proposed change
// This function marks a proposed change as deleted without actually removing it from the database
// This is useful for maintaining data integrity and allowing for potential recovery
// It updates the is_deleted field to true and sets the updated_at timestamp
// It also allows for tracking who performed the deletion by using the updated_by field
export const softDeleteProposedChange = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const updatedBy = req.body.updated_by; // optional: untuk mencatat siapa yang menghapus

    try {
        // Cari dulu datanya
        const existing = await prismaDB2.tr_proposed_changes.findUnique({
            where: { id: Number(id) },
        });

        if (!existing) {
            res.status(404).json({ error: "Proposed change not found" });
            return;
        }

        // Lakukan soft delete
        const deleted = await prismaDB2.tr_proposed_changes.update({
            where: { id: Number(id) },
            data: {
                is_deleted: true,
                updated_at: new Date(),
                ...(updatedBy && { created_by: updatedBy }), // kalau mau catat siapa yang delete
            },
        });

        res.status(200).json({
            message: `Proposed change with ID ${id} has been soft-deleted.`,
            data: deleted,
        });
    } catch (error) {
        console.error("❌ ERROR: Failed to soft delete proposed change:", error);
        res.status(500).json({ error: "Internal Server Error", details: error instanceof Error ? error.message : "Unknown error" });
    }
};

// Create support documents
// This function creates multiple support documents in the database
// It accepts an array of documents in the request body
// Each document must have the required fields: created_by, support_doc_id, proposed_id, and document_type
// It validates the input and returns success or failure messages
// It also handles errors and returns appropriate status codes
export const createSupportDocuments = async (req: Request, res: Response): Promise<void> => {
    try {
        const dataList = req.body;

        if (!Array.isArray(dataList) || dataList.length === 0) {
            res.status(400).json({ error: "Input must be a non-empty array of documents" });
            return;
        }

        const validationErrors: string[] = [];
        const validData = dataList.filter((data, index) => {
            if (!data.created_by) {
                validationErrors.push(`Missing 'created_by' at index ${index}`);
                return false;
            }

            if (typeof data.support_doc_id !== "number") {
                validationErrors.push(`Invalid or missing 'support_doc_id' at index ${index}`);
                return false;
            }

            if (typeof data.proposed_id !== "number") {
                validationErrors.push(`Invalid or missing 'proposed_id' at index ${index}`);
                return false;
            }

            if (typeof data.document_type !== "string") {
                validationErrors.push(`Invalid or missing 'document_type' at index ${index}`);
                return false;
            }

            return true;
        });

        if (validationErrors.length > 0) {
            res.status(400).json({ error: "Validation Error", details: validationErrors });
            return;
        }

        const successes: any[] = [];
        const failures: { index: number, error: string }[] = [];

        for (let i = 0; i < validData.length; i++) {
            const data = validData[i];

            try {
                const result = await prismaDB2.tbl_support_document.create({
                    data: {
                        support_doc_id: data.support_doc_id,
                        proposed_id: data.proposed_id,
                        document_type: data.document_type,
                        status: data.status ?? false,
                        created_by: data.created_by,
                        created_date: data.created_date ? new Date(data.created_date) : new Date(),
                        updated_by: data.updated_by,
                        is_deleted: data.is_deleted ?? false
                    }
                });

                successes.push(result);
            } catch (err) {
                console.error(`❌ Failed to insert at index ${i}`, err);
                failures.push({ index: i, error: err instanceof Error ? err.message : "Unknown error" });
            }
        }

        if (failures.length === 0) {
            res.status(201).json({
                message: `${successes.length} support documents created successfully`,
                data: successes
            });
        } else {
            res.status(207).json({
                message: `${successes.length} documents inserted, ${failures.length} failed`,
                successes,
                failures
            });
        }

    } catch (error) {
        console.error("❌ General ERROR:", error);
        res.status(500).json({ error: "Internal Server Error", details: error instanceof Error ? error.message : "Unknown error" });
    }
};

// Get all proposed changes with relations by approver
// This function is similar to getAllProposedChangesWithRelations but filters the results
// based on the approver_id provided in the request parameters
// It retrieves all handovers associated with the approver and then fetches the proposed changes
// related to those handovers
// It also handles pagination, sorting, and searching
// It returns the results in a paginated format with additional information about the handovers
// and authorization documents
// This function is useful for displaying the proposed changes that require approval
// by a specific approver
// It allows the approver to see all the proposed changes they are responsible for
export const getAllProposedChangesWithRelationsbyApprover = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || "";
        const sortColumn = (req.query.sort as string) || "id";
        const sortDirection = req.query.direction === "desc" ? "desc" : "asc";
        const approver_id = req.params.approver_id ? Number(req.params.approver_id) : undefined;

        const validSortColumns = [
            "id", "project_name", "document_number_id", "item_changes",
            "line_code", "section_code", "department_id",
            "section_department_id", "plant_id", "change_type",
            "status", "created_date", "planning_start", "planning_end",
            "progress", "need_engineering_approval", "need_production_approval"
        ];

        const orderBy: any = validSortColumns.includes(sortColumn)
            ? { [sortColumn]: sortDirection }
            : { id: "asc" };

        const offset = (page - 1) * limit;

        const whereCondition: any = {
            is_deleted: false
        };

        const andConditions = [];

        if (searchTerm) {
            andConditions.push({
                OR: [
                    { project_name: { contains: searchTerm } },
                    { item_changes: { contains: searchTerm } },
                    { line_code: { contains: searchTerm } },
                    { section_code: { contains: searchTerm } },
                    { change_type: { contains: searchTerm } },
                    { description: { contains: searchTerm } },
                    { status: { contains: searchTerm } }
                ]
            });
        }

        // Step 1: If approver_id is provided, find all handovers they're associated with
        let handoverIdsForApprover: number[] = [];
        
        if (approver_id) {
            const approverHandovers = await prismaDB2.tr_handover_approval.findMany({
                where: {
                    auth_id: approver_id
                },
                select: {
                    handover_id: true
                }
            });
            
            handoverIdsForApprover = approverHandovers
                .filter(item => item.handover_id !== null)
                .map(item => item.handover_id as number);
                
            // If the approver has no handovers, return empty result early
            if (handoverIdsForApprover.length === 0) {
                res.status(200).json({
                    data: [],
                    pagination: {
                        totalCount: 0,
                        totalPages: 0,
                        currentPage: page,
                        limit,
                        hasNextPage: false,
                        hasPreviousPage: false
                    },
                });
                return;
            }
            
            // Step 2: Find all proposed changes connected to these handovers that are finished
            const handoversWithPCIds = await prismaDB2.tr_handover.findMany({
                where: {
                    id: {
                        in: handoverIdsForApprover
                    },
                    is_finished: true
                },
                select: {
                    proposed_change_id: true
                }
            });

            
            const proposedChangeIds = handoversWithPCIds
                .filter(item => item.proposed_change_id !== null)
                .map(item => item.proposed_change_id as number);
                
            // If there are no related proposed changes, return empty result
            if (proposedChangeIds.length === 0) {
                res.status(200).json({
                    data: [],
                    pagination: {
                        totalCount: 0,
                        totalPages: 0,
                        currentPage: page,
                        limit,
                        hasNextPage: false,
                        hasPreviousPage: false
                    },
                });
                return;
            }
            
            // Add the proposed change ids to the where condition
            andConditions.push({
                id: {
                    in: proposedChangeIds
                }
            });
        }

        // Combine all conditions
        if (andConditions.length > 0) {
            whereCondition.AND = andConditions;
        }

        // Step 3: Execute the main query to get the proposed changes and related data
        const [proposedChanges, totalCount] = await prismaDB2.$transaction([
            prismaDB2.tr_proposed_changes.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy,
                select: {
                    id: true,
                    project_name: true,
                    document_number_id: true,
                    line_code: true,
                    section_code: true,
                    status: true,
                    progress: true,
                    progresssupport: true,
                    created_date: true,
                    documentNumber: {
                        select: {
                            running_number: true
                        }
                    }
                }
            }),
            prismaDB2.tr_proposed_changes.count({
                where: whereCondition
            }),
        ]);

        // Fetch related authorization docs and handovers for the proposed changes
        const proposedChangeIds = proposedChanges.map(pc => pc.id);
        
        const authDocs = await prismaDB2.tr_authorization_doc.findMany({
            where: {
                proposed_change_id: {
                    in: proposedChangeIds
                }
            },
            select: {
                id: true,
                doc_number: true,
                proposed_change_id: true,
                progress: true
            }
        });

        const handovers = await prismaDB2.tr_handover.findMany({
            where: {
                proposed_change_id: {
                    in: proposedChangeIds
                }
            },
            select: {
                id: true,
                doc_number: true,
                proposed_change_id: true,
                progress: true,
                is_finished: true,
                star: true,
                status: true
            }
        });
        
        // Get all handover IDs to fetch their approvals
        const handoverIds = handovers.map(h => h.id);
        
        // Fetch handover approvals
        const handoverApprovals = await prismaDB2.tr_handover_approval.findMany({
            where: {
                handover_id: {
                    in: handoverIds
                }
            },
            select: {
                id: true,
                handover_id: true,
                auth_id: true,
                step: true,
                actor: true,
                employee_code: true,
                status: true,
                rating: true,
                review: true,
                finished_date: true,
                created_date: true,
                updated_date: true
            }
        });

        // Group authorization docs and handovers by proposed_change_id
        const authDocsByProposedChangeId: Record<number, typeof authDocs> = {};
        const handoversByProposedChangeId: Record<number, typeof handovers> = {};
        const handoverApprovalsByHandoverId: Record<number, typeof handoverApprovals> = {};
        
        authDocs.forEach(doc => {
            if (doc.proposed_change_id) {
                if (!authDocsByProposedChangeId[doc.proposed_change_id]) {
                    authDocsByProposedChangeId[doc.proposed_change_id] = [];
                }
                authDocsByProposedChangeId[doc.proposed_change_id].push(doc);
            }
        });
        
        handovers.forEach(handover => {
            if (handover.proposed_change_id) {
                if (!handoversByProposedChangeId[handover.proposed_change_id]) {
                    handoversByProposedChangeId[handover.proposed_change_id] = [];
                }
                handoversByProposedChangeId[handover.proposed_change_id].push(handover);
            }
        });
        
        // Group handover approvals by handover_id
        handoverApprovals.forEach(approval => {
            if (approval.handover_id) {
                if (!handoverApprovalsByHandoverId[approval.handover_id]) {
                    handoverApprovalsByHandoverId[approval.handover_id] = [];
                }
                handoverApprovalsByHandoverId[approval.handover_id].push(approval);
            }
        });

        // Format the results with only necessary data
        const formattedProposedChanges = proposedChanges.map(item => {
            const relatedAuthDocs = authDocsByProposedChangeId[item.id] || [];
            const relatedHandovers = handoversByProposedChangeId[item.id] || [];
            
            // Process handovers and their approvals
            const handoversWithApprovals = relatedHandovers.map(handover => {
                const approvals = handoverApprovalsByHandoverId[handover.id] || [];
                
                return {
                    id: handover.id,
                    doc_number: handover.doc_number,
                    progress: handover.progress || "0%",
                    status: handover.status,
                    is_finished: handover.is_finished || false,
                    star: handover.star || 0,
                    approvals: approvals.map(approval => ({
                        id: approval.id,
                        auth_id: approval.auth_id,
                        step: approval.step,
                        actor: approval.actor,
                        employee_code: approval.employee_code,
                        status: approval.status,
                        rating: approval.rating,
                        review: approval.review,
                        finished_date: approval.finished_date,
                        created_date: approval.created_date,
                        updated_date: approval.updated_date
                    }))
                };
            });
        
            const handoverData = relatedHandovers.length > 0 ? {
                is_finished: relatedHandovers[0].is_finished || false,
                star: relatedHandovers[0].star || 0
            } : null;
        
            return {
                id: item.id,
                project_name: item.project_name,
                documentNumber: item.documentNumber,
                status: item.status,
                progress: item.progress,
                progresssupport: item.progresssupport,
                created_date: item.created_date,
                
                authorization_doc_ids: relatedAuthDocs.map(doc => doc.id),
                authorization_doc_progress: relatedAuthDocs.map(doc => ({
                    id: doc.id,
                    progress: doc.progress || "0%"
                })),
                
                handover_ids: relatedHandovers.map(handover => handover.id),
                handover_progress: relatedHandovers.map(handover => ({
                    id: handover.id,
                    progress: handover.progress || "0%"
                })),
                
                all_handover_data: handoverData,
                handovers_with_approvals: handoversWithApprovals
            };
        });

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        res.status(200).json({
            data: formattedProposedChanges,
            pagination: {
                totalCount,
                totalPages,
                currentPage: page,
                limit,
                hasNextPage,
                hasPreviousPage
            },
        });
    } catch (error: any) {
        console.error("❌ Error in getAllProposedChangesWithRelations:", error);
        res.status(500).json({
            error: "Internal Server Error",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};