import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";

//getALlAuthDoc
export const getAllAuthDoc = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || "";
        const sortColumn = (req.query.sort as string) || "id";
        const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

        const validSortColumns = [
            "id", "doc_number", "implementation_date", "evaluation", "description",
            "conclution", "concept", "standart", "method", "status",
            "created_date", "created_by", "plant_id", "department_id", "section_department_id",
            "project_name"
        ];

        // Handle sorting, including nested sort for project_name
        let orderBy: any = { id: "asc" };
        if (validSortColumns.includes(sortColumn)) {
            if (sortColumn === "project_name") {
                orderBy = {
                    proposedChange: {
                        project_name: sortDirection
                    }
                };
            } else {
                orderBy = { [sortColumn]: sortDirection };
            }
        }

        const offset = (page - 1) * limit;
        const andConditions: any[] = [];

        // Search condition
        if (searchTerm) {
            andConditions.push({
                OR: [
                    { doc_number: { contains: searchTerm } },
                    { evaluation: { contains: searchTerm } },
                    { description: { contains: searchTerm } },
                    { conclution: { contains: searchTerm } },
                    { concept: { contains: searchTerm } },
                    { standart: { contains: searchTerm } },
                    { method: { contains: searchTerm } },
                    { status: { contains: searchTerm } },
                    {
                        proposedChange: {
                            project_name: {
                                contains: searchTerm
                            }
                        }
                    }
                ]
            });
        }

        // Filters
        if (req.query.status) andConditions.push({ status: req.query.status });
        if (req.query.plant_id) andConditions.push({ plant_id: Number(req.query.plant_id) });
        if (req.query.department_id) andConditions.push({ department_id: Number(req.query.department_id) });
        if (req.query.section_department_id) andConditions.push({ section_department_id: Number(req.query.section_department_id) });
        if (req.query.created_by) andConditions.push({ created_by: req.query.created_by });
        if (req.query.progress) andConditions.push({ progress: req.query.progress });
        if (req.query.change_type) andConditions.push({ change_type: req.query.change_type });

        if (req.query.need_engineering_approval !== undefined) {
            andConditions.push({
                need_engineering_approval: req.query.need_engineering_approval === 'true'
            });
        }

        if (req.query.need_production_approval !== undefined) {
            andConditions.push({
                need_production_approval: req.query.need_production_approval === 'true'
            });
        }

        // Filter by auth_id if provided
        if (req.query.auth_id) {
            andConditions.push({ auth_id: Number(req.query.auth_id) });
        }

        // Exclude records where authdoc_id in tr_handover matches the id from tr_authorization_doc
        const excludedAuthDocIds = await prismaDB2.tr_handover.findMany({
            select: {
                authdoc_id: true
            },
            where: {
                authdoc_id: {
                    not: null
                }
            }
        }).then(handoverRecords => handoverRecords.map(record => record.authdoc_id));

        // Final conditions with exclusion
        const whereCondition: any = {
            AND: andConditions,
            NOT: {
                id: {
                    in: excludedAuthDocIds
                }
            }
        };

        const [data, totalCount] = await prismaDB2.$transaction([
            prismaDB2.tr_authorization_doc.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy,
                include: {
                    authorizationPlant: true,
                    department: true,
                    section_department: true,
                    proposedChange: {
                        select: {
                            project_name: true
                        }
                    }
                }
            }),
            prismaDB2.tr_authorization_doc.count({
                where: whereCondition
            })
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        res.status(200).json({
            data,
            pagination: {
                totalCount,
                totalPages,
                currentPage: page,
                limit,
                hasNextPage,
                hasPreviousPage
            }
        });

    } catch (error: any) {
        console.error("❌ Error in getAllAuthDoc:", error);
        res.status(500).json({
            error: "Internal Server Error",
            details: process.env.NODE_ENV === "development" ? error.message : undefined
        });
    }
};


//by ID, complete get Dokumen, ada project name dan untuk Member 
export const getAuthDocById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const authDocId = parseInt(id, 10);
        if (isNaN(authDocId)) {
            console.warn("❌ Invalid ID format:", id);
            res.status(400).json({
                error: "Validation Error",
                details: "ID must be a valid number"
            });
            return;
        }
        console.log(`🔍 Fetching authorization document with ID: ${authDocId}`);
        const authDoc = await prismaDB2.tr_authorization_doc.findUnique({
            where: {
                id: authDocId
            },
            include: {
                // Include proposed change untuk mendapatkan project_name
                proposedChange: {
                    select: {
                        id: true,
                        project_name: true
                    }
                },
                // Include semua anggota tim yang tidak dihapus
                authdocMembers: {
                    where: {
                        is_deleted: false
                    },
                    select: {
                        id: true,
                        employee_code: true,
                        employee_name: true,
                        status: true,
                        created_date: true
                    }
                }
            }
        });
        if (!authDoc) {
            console.warn(`❌ No authorization document found with ID: ${authDocId}`);
            res.status(404).json({
                error: "Not Found",
                details: `Authorization document with ID ${authDocId} not found`
            });
            return;
        }
        console.log(`✅ Successfully retrieved authorization document with ID: ${authDocId}`);
        console.log(`👥 Found ${authDoc.authdocMembers.length} members for this doc`);
        // Extract document line code
        const docNumberParts = authDoc.doc_number?.split("/") || [];
        const line_code = docNumberParts.length >= 2 ? docNumberParts[1] : null;
        
        // Format data dengan menambahkan line_code dan project_name
        const docData = {
            ...authDoc,
            line_code: line_code,
            project_name: authDoc.proposedChange?.project_name || null
        };
        
        // Struktur respons dengan format {status, data: [{}]}
        const response = {
            status: "success",
            data: [docData]  // Data dalam bentuk array untuk format konsisten
        };
        
        res.status(200).json(response);
    } catch (error) {
        console.error("❌ Error fetching authorization document:", error);
        res.status(500).json({
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    } finally {
        await prismaDB2.$disconnect();
        console.log("🔌 Database connection closed");
    }
};

