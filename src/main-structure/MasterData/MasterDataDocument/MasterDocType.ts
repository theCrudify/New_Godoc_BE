import { Request, Response } from "express";
import { prismaDB2 } from "../../../config/database";

// Interface untuk kondisi pencarian
interface DevelopmentWhereCondition {
    AND?: Array<Record<string, any>>;
    OR?: Array<Record<string, any>>;
    is_deleted?: boolean;
    status?: boolean;
}

// Ambil semua data development
export const getAllDoctype = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || "";
        const status = req.query.status === "true";
        const sortColumn = (req.query.sort as string) || "id";
        const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

        const validSortColumns = ["id", "document_type", "document_code", "status", "updated_at", "updated_by"];
        const orderBy: any = validSortColumns.includes(sortColumn)
            ? { [sortColumn]: sortDirection }
            : { id: "asc" };

        const offset = (page - 1) * limit;

        const whereCondition: DevelopmentWhereCondition = {
            is_deleted: false, // Hanya ambil data yang tidak dihapus
            AND: []
        };

        if (searchTerm) {
            whereCondition.OR = [
                { document_type: { contains: searchTerm.toLowerCase() } },
                { document_code: { contains: searchTerm.toLowerCase() } },
                { updated_by: { contains: searchTerm.toLowerCase() } } // Tambahkan ini

            ];
        }

        if (req.query.status !== undefined) {
            whereCondition.status = status;
        }

        const [developments, totalCount] = await prismaDB2.$transaction([
            prismaDB2.mst_doc_type.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy,
            }),
            prismaDB2.mst_doc_type.count({ where: whereCondition }),
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        res.status(200).json({
            data: developments,
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

// Ambil data development berdasarkan ID
export const getDoctypeByID = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        const development = await prismaDB2.mst_doc_type.findUnique({
            where: {
                id: id,
                is_deleted: false,
            },
        });

        if (!development) {
            res.status(404).json({ error: "Document type not found" });
            return;
        }

        res.status(200).json({ data: development });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Buat data development baru
export const createDoctype = async (req: Request, res: Response): Promise<void> => {
    try {
        const development = await prismaDB2.mst_doc_type.create({
            data: {
                document_type: req.body.document_type,
                document_code: req.body.document_code.toUpperCase(), // Pastikan kode selalu kapital
                status: req.body.status,
                updated_by: req.body.updated_by,
            },
        });

        res.status(201).json({ data: development });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Update data development
export const updateDoctype = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);

        const updatedDevelopment = await prismaDB2.mst_doc_type.update({
            where: { id: id },
            data: {
                document_type: req.body.document_type,
                document_code: req.body.document_code.toUpperCase(), // Pastikan kode selalu kapital
                status: req.body.status,
                updated_by: req.body.updated_by,
                updated_at: new Date(),
            },
        });

        res.status(200).json({ data: updatedDevelopment });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Soft delete data development
export const deleteDoctype = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);

        await prismaDB2.mst_doc_type.update({
            where: { id: id },
            data: {
                is_deleted: true,
            },
        });

        res.status(200).json({ message: "Development soft deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
