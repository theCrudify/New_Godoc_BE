import { Request, Response } from "express";
import { prismaDB2 } from "../../../config/database";

// --- Helper Functions ---

// Fungsi validasi input untuk mst_area
function validateAreaData(data: any): string[] {
    const errors: string[] = [];

    if (!data.area) {
        errors.push("Area name is required.");
    } else if (data.area.length > 255) {
        errors.push("Area name cannot exceed 255 characters.");
    }

    if (!data.code_area) {
        errors.push("Code Area is required.");
    } else if (data.code_area.length > 255) {
        errors.push("Code Area cannot exceed 255 characters.");
    }

    if (data.id_line !== undefined && data.id_line !== null && typeof data.id_line !== "number") {
        errors.push("Line ID must be a number.");
    }

    return errors;
}


interface AreaWhereCondition {
    AND?: Array<Record<string, any>>;
    OR?: Array<Record<string, any>>;
    is_deleted?: boolean;
    status?: boolean;
}

// --- CRUD Functions ---

// Get all areas
export const getAllAreas = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || "";
        const status = req.query.status === "true";
        const sortColumn = (req.query.sort as string) || "id";
        const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

        const validSortColumns = ["id", "area", "code_area", "status", "created_at", "updated_at", "line.code_line"];

        const orderBy: any = validSortColumns.includes(sortColumn)
            ? { [sortColumn]: sortDirection }
            : { id: "asc" };

        const offset = (page - 1) * limit;

        const whereCondition: any = {
            is_deleted: false,
            AND: []
        };

        if (searchTerm) {
            whereCondition.OR = [
                { area: { contains: searchTerm.toLowerCase() } },
                { code_area: { contains: searchTerm.toLowerCase() } },
                { line: { line: { contains: searchTerm.toLowerCase() } } },
                { line: { code_line: { contains: searchTerm.toLowerCase() } } }, // Pencarian berdasarkan code_line
            ];
        }

        if (req.query.status !== undefined) {
            whereCondition.status = status;
        }

        const [areas, totalCount] = await prismaDB2.$transaction([
            prismaDB2.mst_area.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy,
                include: {
                    line: true
                }
            }),
            prismaDB2.mst_area.count({ where: whereCondition }),
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        res.status(200).json({
            data: areas.map(area => ({
                id: area.id,
                id_line: area.id_line,
                area: area.area,
                code_area: area.code_area,
                status: area.status,
                created_by: area.created_by,
                created_at: area.created_at,
                updated_by: area.updated_by,
                updated_at: area.updated_at,
                line_details: area.line ?? null
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


// Get Area by ID
export const getAreaById = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        const area = await prismaDB2.mst_area.findUnique({
            where: { id },
            include: {
                line: true // Mengambil data relasi dengan mst_line
            }
        });

        if (!area) {
            res.status(404).json({ error: "Area not found" });
            return;
        }

        res.status(200).json(area);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Create Area
export const createArea = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = req.body;

        const errors = validateAreaData(data);
        if (errors.length > 0) {
            res.status(400).json({ error: "Validation Error", details: errors });
            return;
        }

        // Cek apakah id_line valid (jika diisi)
        if (data.id_line !== undefined && data.id_line !== null) {
            const line = await prismaDB2.mst_line.findUnique({ where: { id: data.id_line } });
            if (!line) {
                res.status(400).json({ error: "Invalid id_line", details: "Line with provided ID does not exist." });
                return;
            }
        }

        const newArea = await prismaDB2.mst_area.create({
            data: {
                area: data.area,
                code_area: data.code_area,
                id_line: data.id_line,
                status: data.status !== undefined ? data.status : true,
                created_by: data.created_by,
            },
        });

        res.status(201).json({ message: "Area created successfully", data: newArea });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Update Area
export const updateArea = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id);
        const data = req.body;

        console.log("Received request to update area with ID:", id);
        console.log("Request body:", data);

        if (isNaN(id)) {
            console.log("Invalid ID received:", req.params.id);
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        // // Validasi data yang dikirim
        // const errors = validateAreaData(data);
        // if (errors.length > 0) {
        //     console.log("Validation errors:", errors);
        //     res.status(400).json({ error: "Validation Error", details: errors });
        //     return;
        // }

        // Cek apakah area dengan ID tersebut ada
        const existingArea = await prismaDB2.mst_area.findUnique({ where: { id } });
        if (!existingArea) {
            console.log("Area not found for ID:", id);
            res.status(404).json({ error: "Area not found" });
            return;
        }

        console.log("Existing area found:", existingArea);

        // Validasi jika code_area sudah digunakan oleh area lain
        // if (data.code_area) {
        //     console.log("Checking for duplicate code_area:", data.code_area);
        //     const duplicateCodeArea = await prismaDB2.mst_area.findFirst({
        //         where: {
        //             code_area: data.code_area,
        //             id: { not: id } // Pastikan bukan area yang sedang di-update
        //         }
        //     });

        //     if (duplicateCodeArea) {
        //         console.log("Duplicate code_area found:", duplicateCodeArea);
        //         res.status(409).json({ error: "Duplicate code_area", details: `Code area ${data.code_area} already exists.` });
        //         return;
        //     }
        // }

        // Cek apakah id_line valid (jika diisi)
        if (data.id_line !== undefined && data.id_line !== null) {
            console.log("Checking if id_line is valid:", data.id_line);
            const line = await prismaDB2.mst_line.findUnique({ where: { id: data.id_line } });
            if (!line) {
                console.log("Invalid id_line:", data.id_line);
                res.status(400).json({ error: "Invalid id_line", details: "Line with provided ID does not exist." });
                return;
            }
        }

        console.log("Updating area with new data...");
        const updatedArea = await prismaDB2.mst_area.update({
            where: { id },
            data: {
                area: data.area,
                code_area: data.code_area,
                id_line: data.id_line,
                status: data.status,
                updated_by: data.updated_by,
                updated_at: new Date(),
            },
        });

        console.log("Area updated successfully:", updatedArea);
        res.status(200).json({ message: "Area updated successfully", data: updatedArea });
    } catch (error) {
        console.error("Error in updateArea:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


// Soft Delete Area
export const deleteArea = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        // Cek apakah area dengan ID tersebut ada
        const existingArea = await prismaDB2.mst_area.findUnique({ where: { id } });
        if (!existingArea) {
            res.status(404).json({ error: "Area not found" });
            return;
        }

        await prismaDB2.mst_area.update({
            where: { id },
            data: { is_deleted: true },
        });

        res.status(200).json({ message: "Area soft-deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
