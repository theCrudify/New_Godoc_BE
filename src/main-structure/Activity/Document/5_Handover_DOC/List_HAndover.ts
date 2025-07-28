import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";

// Get All Handovers
export const getAllHandovers = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || "";
        const sortColumn = (req.query.sort as string) || "id";
        const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

        const validSortColumns = [
            "id", "doc_number", "progress", "status", "material", "remark",
            "created_date", "created_by", "plant_id", "department_id", "section_department_id"
        ];

        // Handle sorting
        let orderBy: any = { id: "asc" };
        if (validSortColumns.includes(sortColumn)) {
            orderBy = { [sortColumn]: sortDirection };
        }

        const offset = (page - 1) * limit;
        const andConditions: any[] = [{ is_deleted: false }];

        // Search condition
        if (searchTerm) {
            andConditions.push({
                OR: [
                    { doc_number: { contains: searchTerm } },
                    { progress: { contains: searchTerm } },
                    { status: { contains: searchTerm } },
                    { material: { contains: searchTerm } },
                    { remark: { contains: searchTerm } },
                    { created_by: { contains: searchTerm } }
                    // Project name search removed as it might not be properly accessible
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
        if (req.query.auth_id) {
            andConditions.push({
              tr_proposed_changes: {
                auth_id: Number(req.query.auth_id)
              }
            });
          }
          
        const whereCondition = andConditions.length > 0 ? { AND: andConditions } : {};

        const [data, totalCount] = await prismaDB2.$transaction([
            prismaDB2.tr_handover.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy,
                include: {
                    mst_plant: true,
                    mst_department: true,
                    mst_section_department: true,
                    // Include proposed changes relation
                    tr_proposed_changes: true
                }
            }),
            prismaDB2.tr_handover.count({
                where: whereCondition
            })
        ]);

        // Process data to add project name where available
        const processedData = data.map(handover => {
            return {
                ...handover,
                project_name: handover.tr_proposed_changes ? handover.tr_proposed_changes.project_name : null
            };
        });

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        res.status(200).json({
            data: processedData,
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
        console.error("❌ Error in getAllHandovers:", error);
        res.status(500).json({
            error: "Internal Server Error",
            details: process.env.NODE_ENV === "development" ? error.message : undefined
        });
    }
};

// Get Handover by ID with related data
export const getHandoverById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const handoverId = parseInt(id, 10);
        
        if (isNaN(handoverId)) {
            console.warn("❌ Invalid ID format:", id);
            res.status(400).json({
                error: "Validation Error",
                details: "ID must be a valid number"
            });
            return;
        }
        
        console.log(`🔍 Fetching handover with ID: ${handoverId}`);
        
        const handover = await prismaDB2.tr_handover.findUnique({
            where: {
                id: handoverId,
                is_deleted: false
            },
            include: {
                tr_proposed_changes: true,
                // tr_handover_approval: {
                //     include: {
                //         mst_authorization: true
                //     }
                // },
                mst_plant: true,
                mst_department: true,
                mst_section_department: true,
                mst_authorization_tr_handover_auth_idTomst_authorization: true,
                mst_authorization_tr_handover_auth_id2Tomst_authorization: true,
                mst_authorization_tr_handover_auth_id3Tomst_authorization: true,
                mst_authorization_tr_handover_auth_id4Tomst_authorization: true,
                tr_authorization_doc: true
            }
        });
        
        if (!handover) {
            console.warn(`❌ No handover found with ID: ${handoverId}`);
            res.status(404).json({
                error: "Not Found",
                details: `Handover with ID ${handoverId} not found`
            });
            return;
        }
        
        console.log(`✅ Successfully retrieved handover with ID: ${handoverId}`);
        
        // if (handover.tr_handover_approval) {
        //     console.log(`👥 Found ${handover.tr_handover_approval.length} approval entries for this handover`);
        // }

        // Extract document line code
        const line_code = handover.doc_number?.split("/")?.[1] || null;

        // Destructure long relation keys for aliasing
        const {
            mst_authorization_tr_handover_auth_idTomst_authorization,
            mst_authorization_tr_handover_auth_id2Tomst_authorization,
            mst_authorization_tr_handover_auth_id3Tomst_authorization,
            mst_authorization_tr_handover_auth_id4Tomst_authorization,
            ...rest
        } = handover;

        // Build the final object with short alias
        const handoverData = {
            ...rest,
            line_code,
            project_name: handover.tr_proposed_changes?.project_name ?? null,
            uth0: mst_authorization_tr_handover_auth_idTomst_authorization ?? null,
            uth1: mst_authorization_tr_handover_auth_id2Tomst_authorization ?? null,
            uth2: mst_authorization_tr_handover_auth_id3Tomst_authorization ?? null,
            uth3: mst_authorization_tr_handover_auth_id4Tomst_authorization ?? null
        };

        res.status(200).json({
            status: "success",
            data: [handoverData]
        });

    } catch (error) {
        console.error("❌ Error fetching handover:", error);
        res.status(500).json({
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    } finally {
        await prismaDB2.$disconnect();
        console.log("🔌 Database connection closed");
    }
};
