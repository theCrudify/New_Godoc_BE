import { Request, Response } from "express";
import { prismaDB2 } from "../../../config/database"; // Ganti jika nama variabel Anda berbeda

interface AuthorizationWhereCondition {
    AND?: Array<Record<string, any>>;
    OR?: Array<Record<string, any>>;
    status?: boolean;
}

// Helper function untuk validasi input
const validateAuthorizationData = (data: any) => {
    const errors: string[] = [];
    if (!data.employee_code) {
        errors.push("Employee code is required");
    }
    if (!data.employee_name) {
        errors.push("Employee name is required");
    }
    return errors;
};



// Ambil Authorization berdasarkan ID
export const getAuthorizationById = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        const authorization = await prismaDB2.mst_authorization.findFirst({
            where: {
                id,
                is_deleted: false,
            },
            include: {
                department: true,
                section: true,
                plant: true,
                role: true,
            },
        });

        if (!authorization) {
            res.status(404).json({ error: "Authorization not found" });
            return;
        }

        res.status(200).json(authorization);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Ambil semua Authorization dengan filter pagination dan search
export const getAllAuthorizations = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || "";
        const status = req.query.status === "true";
        const sortColumn = (req.query.sort as string) || "id";
        const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

        const offset = (page - 1) * limit;

        const whereCondition: any = {
            is_deleted: false,
            AND: []
        };

        if (searchTerm) {
            whereCondition.OR = [
                { employee_code: { contains: searchTerm } },
                { employee_name: { contains: searchTerm } }
            ];
        }

        if (req.query.status !== undefined) {
            whereCondition.status = status;
        }

        const [authorizations, totalCount] = await prismaDB2.$transaction([
            prismaDB2.mst_authorization.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy: { [sortColumn]: sortDirection },
                include: {
                    department: { select: { department_name: true } },
                    section: { select: { section_name: true } },
                    plant: { select: { plant_code: true } },
                    role: { select: { role_name: true } }
                }
            }),
            prismaDB2.mst_authorization.count({ where: whereCondition }),
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

       
        // Modify this return statement in the getAllAuthorizations function:
        res.status(200).json({
            data: authorizations.map(auth => ({
                id: auth.id,
                employee_code: auth.employee_code,
                employee_name: auth.employee_name,
                department_name: auth.department?.department_name ?? null,
                section_name: auth.section?.section_name ?? null,
                plant_code: auth.plant?.plant_code ?? null,
                role_name: auth.role?.role_name ?? null,
                // Add these fields for the edit form
                department_id: auth.department_id,
                section_id: auth.section_id,
                plant_id: auth.plant_id,
                role_id: auth.role_id,
                // Include these additional fields
                email: auth.email,
                number_phone: auth.number_phone,
                gender: auth.gender,
                status: auth.status,
                created_by: auth.created_by,
                created_at: auth.created_at,
                updated_by: auth.updated_by,
                updated_at: auth.updated_at
            })),
            pagination: {
                totalCount,
                totalPages,
                currentPage: page,
                limit,
                hasNextPage,
                hasPreviousPage
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Soft Delete Authorization
export const deleteAuthorization = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        await prismaDB2.mst_authorization.update({
            where: { id },
            data: { is_deleted: true },
        });

        res.status(200).json({ message: "Authorization soft-deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


// Update Authorization
export const updateAuthorization = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id);
        const data = req.body;
        
        console.log("🔍 Update Authorization ID:", id);
        console.log("📝 Update Data:", data);

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        const authorization = await prismaDB2.mst_authorization.findFirst({
            where: { id, is_deleted: false },
        });

        if (!authorization) {
            res.status(404).json({ error: "Authorization not found or has been deleted" });
            return;
        }

        // Pastikan semua field yang diperlukan ada dalam permintaan update
        const updatedAuthorization = await prismaDB2.mst_authorization.update({
            where: { id },
            data: {
                employee_code: data.employee_code,
                employee_name: data.employee_name,
                department_id: data.department_id,
                section_id: data.section_id,
                plant_id: data.plant_id,
                role_id: data.role_id,
                status: data.status,
                // Tambahkan field-field ini
                email: data.email,
                number_phone: data.number_phone,
                gender: data.gender || 'M',
                updated_by: data.updated_by,
                updated_at: new Date(),
            },
        });
        
        console.log("✅ Updated Authorization:", updatedAuthorization);

        res.status(200).json({ message: "Authorization updated successfully", data: updatedAuthorization });
    } catch (error: any) {
        console.error("❌ Error Updating Authorization:", error);
        console.error("Stack:", error.stack);
        
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};

export const createAuthorization = async (req: Request, res: Response): Promise<void> => {
    try {
        console.log("🔍 Incoming POST:", req.body);

        const data = req.body;

        console.log("✅ Data Passed Validation:", data);

        // Cek apakah employee_code sudah ada dengan is_deleted === false
        const existingAuthorization = await prismaDB2.mst_authorization.findFirst({
            where: {
                employee_code: data.employee_code,
                is_deleted: false
            },
        });

        if (existingAuthorization) {
            console.warn("⚠️ Duplicate Employee Code:", data.employee_code);
            res.status(400).json({
                error: "Duplicate Employee Code",
                message: "Employee authorization already exists and is active."
            });
            return;
        }

        // Buat entri baru dengan field email, number_phone, dan gender
        const newAuthorization = await prismaDB2.mst_authorization.create({
            data: {
                employee_code: data.employee_code,
                employee_name: data.employee_name,
                department_id: data.department_id,
                section_id: data.section_id,
                plant_id: data.plant_id,
                role_id: data.role_id,
                status: data.status ?? true,
                // Tambahkan field-field ini
                email: data.email,
                number_phone: data.number_phone,
                gender: data.gender || 'M',
                created_by: data.created_by,
                created_at: new Date(),
                updated_at: new Date()
            },
        });

        console.log("🎉 Successfully Created Authorization:", newAuthorization);

        res.status(201).json({ message: "Authorization created successfully", data: newAuthorization });
    } catch (error: any) {
        console.error("❌ Error Creating Authorization:", error);
        // Log stack trace untuk debugging lebih detail
        console.error("Stack:", error.stack);

        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};


interface RoleWhereCondition {
    role_name?: { contains: string; };
    description?: { contains: string; };
    created_by?: number;
    updated_by?: number;
}

export const getAllRoles = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || '';
        const sortColumn = (req.query.sort as string) || 'id';
        const sortDirection = (req.query.direction === 'desc') ? 'desc' : 'asc';

        const validSortColumns = ['id', 'role_name', 'description', 'created_at', 'updated_at', 'created_by', 'updated_by'];

        // Validate sortColumn
        if (!validSortColumns.includes(sortColumn)) {
            res.status(400).json({ error: 'Invalid sort column' });
            return;
        }

        const orderBy: Record<string, 'asc' | 'desc'> = {
            [sortColumn]: sortDirection,
        };

        const offset = (page - 1) * limit;

        const whereCondition: RoleWhereCondition = {};  // Simplified where condition

        if (searchTerm) {
            whereCondition.role_name = { contains: searchTerm.toLowerCase() }; // Search by role_name
            //Optionally search also by description
            whereCondition.description = { contains: searchTerm.toLowerCase() };
        }


        const [roles, totalCount] = await prismaDB2.$transaction([
            prismaDB2.mst_role.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy: orderBy,
            }),
            prismaDB2.mst_role.count({ where: whereCondition }),
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        res.status(200).json({
            data: roles,  // Send the roles directly
            pagination: {
                totalCount,
                totalPages,
                currentPage: page,
                limit,
                hasNextPage,
                hasPreviousPage,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};