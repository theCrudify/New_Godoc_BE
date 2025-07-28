import { Request, Response } from "express";
import { prismaDB2 } from "../../../config/database";

// --- Helper Functions ---

//Tambahkan fungsi validateSectionDepartmentData
function validateSectionDepartmentData(data: any): string[] {
    const errors: string[] = [];

    if (!data.section_name) {
        errors.push("Section name is required.");
    } else if (data.section_name.length > 255) {
        errors.push("Section name cannot exceed 255 characters.");
    }

    if (data.department_id == null) { // department_id wajib (required)
        errors.push("Department ID is required.");
    } else if (typeof data.department_id !== 'number') { // Periksa apakah number
        errors.push("Department ID must be a number.");
    }

    return errors;
}

interface SectionDepartmentWhereCondition {
    AND?: Array<Record<string, any>>;
    OR?: Array<Record<string, any>>;
    is_deleted?: boolean;
    status?: boolean;
}

// --- CRUD Functions ---

export const getAllSectionDepartments = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || "";
        const status = req.query.status === "true";
        const sortColumn = (req.query.sort as string) || "id";
        const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

        const validSortColumns = [
            "id", "section_name", "status", "created_at", "updated_at",
            "department_name", "department_code", "plant_name"
        ];

        const orderBy: any = validSortColumns.includes(sortColumn)
            ? sortColumn === "department_name" || sortColumn === "department_code"
                ? { department: { [sortColumn]: sortDirection } }
                : sortColumn === "plant_name"
                    ? { department: { plant: { plant_name: sortDirection } } }
                    : { [sortColumn]: sortDirection }
            : { id: "asc" };

        const offset = (page - 1) * limit;

        const whereCondition: SectionDepartmentWhereCondition = {
            is_deleted: false,
            AND: []
        };

        if (searchTerm) {
            whereCondition.OR = [
                { section_name: { contains: searchTerm.toLowerCase() } },
                { department: { department_name: { contains: searchTerm.toLowerCase() } } },
                { department: { department_code: { contains: searchTerm.toLowerCase() } } },
                { department: { plant: { plant_name: { contains: searchTerm.toLowerCase() } } } }
            ];
        }

        if (req.query.status !== undefined) {
            whereCondition.status = status;
        }

        const [sections, totalCount] = await prismaDB2.$transaction([
            prismaDB2.mst_section_department.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy,
                include: {
                    department: {
                        select: {
                            department_name: true,
                            department_code: true,
                            plant: {
                                select: {
                                    plant_name: true,
                                    id: true, // Include plant ID
                                }
                            }
                        }
                    }
                }
            }),
            prismaDB2.mst_section_department.count({ where: whereCondition }),
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        res.status(200).json({
            data: sections.map(section => ({
                id: section.id,
                department_id: section.department_id,
                section_name: section.section_name,
                status: section.status,
                created_by: section.created_by,
                created_at: section.created_at,
                updated_by: section.updated_by,
                updated_at: section.updated_at,
                is_deleted: section.is_deleted,
                plant_name: section.department?.plant?.plant_name ?? null,
                plant_id: section.department?.plant?.id ?? null, // Return plant ID
                department_name: section.department?.department_name ?? null,
                department_code: section.department?.department_code ?? null
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

export const getSectionDepartmentById = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        const section = await prismaDB2.mst_section_department.findUnique({
            where: {
                id,
                is_deleted: false,
            },
            include: {
                department: true
            }
        });

        if (!section) {
            res.status(404).json({ error: "Section Department not found" });
            return;
        }

        res.status(200).json(section);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const createSectionDepartment = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = req.body;

        const errors = validateSectionDepartmentData(data); // Pastikan fungsi ini ada dan memvalidasi dengan benar.
        if (errors.length > 0) {
            res.status(400).json({ error: "Validation Error", details: errors });
            return;
        }

        // Cek apakah department_id valid
        if (data.department_id !== undefined && data.department_id !== null) { // Lebih baik cek undefined dan null
            console.log("department_id yang diterima:", data.department_id); // LOG yang benar
            const department = await prismaDB2.mst_department.findUnique({ // Query ke mst_department
                where: { id: data.department_id },
            });

            console.log("Hasil pencarian department:", department); // LOG yang benar

            if (!department) {
                res.status(400).json({ error: "Invalid department_id", details: "Department with provided ID does not exist." }); // Pesan error yang benar
                return;
            }
        }
        //Validasi jika section name di department yang sama sudah ada
        if (data.section_name) {
            const existingSectionName = await prismaDB2.mst_section_department.findFirst({
                where: {
                    section_name: data.section_name,
                    department_id: data.department_id
                },
            });
            if (existingSectionName) {
                res.status(409).json({ error: "Duplicate section_name", details: `Section with name ${data.section_name} already exist in this department` });
                return;
            }
        }

        const newSection = await prismaDB2.mst_section_department.create({
            data: {
                section_name: data.section_name,
                department_id: data.department_id,
                status: data.status !== undefined ? data.status : true, // Lebih aman
                created_by: data.created_by,
                // updated_by tidak di-set saat create
            },
        });

        res.status(201).json({ message: "Section Department created successfully", data: newSection });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const updateSectionDepartment = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id);
        const data = req.body;

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        const errors = validateSectionDepartmentData(data);
        if (errors.length > 0) {
            res.status(400).json({ error: "Validation Error", details: errors });
            return;
        }

        const updatedSection = await prismaDB2.mst_section_department.update({
            where: { id },
            data: {
                section_name: data.section_name,
                department_id: data.department_id,
                status: data.status,
                updated_by: data.updated_by,
                updated_at: new Date(),
            },
        });

        res.status(200).json({ message: "Section Department updated successfully", data: updatedSection });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const deleteSectionDepartment = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        await prismaDB2.mst_section_department.update({
            where: { id },
            data: { is_deleted: true },
        });

        res.status(200).json({ message: "Section Department soft-deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};