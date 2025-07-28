import { Request, Response } from "express";
import { prismaDB2 } from "../../../config/database";

// --- Helper Functions ---

// Fungsi validasi input untuk mst_document_categories
function validateDocumentData(data: any): string[] {
    const errors: string[] = [];

    if (!data.category) {
        errors.push("Categories Doc is required.");
    } else if (data.category.length > 255) {
        errors.push("Categories Doc cannot exceed 255 characters.");
    }

    if (data.status !== undefined && typeof data.status !== "boolean") {
        errors.push("Status must be a boolean.");
    }

    return errors;
}

// --- CRUD Functions ---


interface DocumentWhereCondition {
    AND?: Array<Record<string, any>>;
    OR?: Array<Record<string, any>>;
    is_deleted?: number;
    status?: boolean;
}

// --- CRUD Functions ---

// Get all documents
export const getAllCategoriesDocuments = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || "";
        const status = req.query.status === "true";
        const sortColumn = (req.query.sort as string) || "id";
        const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

        const validSortColumns = ["id", "category", "status", "updated_at", "updated_by"];
        const orderBy: any = validSortColumns.includes(sortColumn)
            ? { [sortColumn]: sortDirection }
            : { id: "asc" };

        const offset = (page - 1) * limit;

        const whereCondition: DocumentWhereCondition = {
            is_deleted: 0, // Pastikan is_deleted selalu 0
            AND: []
        };

        if (searchTerm) {
            whereCondition.OR = [
                { category: { contains: searchTerm.toLowerCase() } },
                { updated_by: { contains: searchTerm.toLowerCase() } } // Tambahkan ini

            ];
        }

        if (req.query.status !== undefined) {
            whereCondition.status = status;
        }

        const [documents, totalCount] = await prismaDB2.$transaction([
            prismaDB2.mst_document_categories.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy,
            }),
            prismaDB2.mst_document_categories.count({ where: whereCondition }),
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        res.status(200).json({
            data: documents,
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


// Get document by id
export const getAllCategoriesDocumentsbyID = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        const document = await prismaDB2.mst_document_categories.findUnique({
            where: {
                id: id,
                is_deleted: 0, // Tambahkan kondisi is_deleted: 0
            },
        });

        if (!document) {
            res.status(404).json({ error: "Document not found" });
            return;
        }

        res.status(200).json({ data: document });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Create document
export const CreateCategoriesDocuments = async (req: Request, res: Response): Promise<void> => {
    try {
        const errors = validateDocumentData(req.body);
        if (errors.length > 0) {
            res.status(400).json({ errors: errors });
            return;
        }

        const existingDocument = await prismaDB2.mst_document_categories.findFirst({
            where: {
                category: req.body.category,
            },
        });

        if (existingDocument) {
            res.status(409).json({ error: "Duplicate Categories" }); // 409 Conflict
            return;
        }

        const document = await prismaDB2.mst_document_categories.create({
            data: {
                category: req.body.category,
                status: req.body.status,
            },
        });

        res.status(201).json({ data: document });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Update document
export const UpdateCategoriesDocuments = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);
        const errors = validateDocumentData(req.body);
        if (errors.length > 0) {
            res.status(400).json({ errors: errors });
            return;
        }

        const updatedDocument = await prismaDB2.mst_document_categories.update({
            where: { id: id },
            data: {
                category: req.body.category,
                status: req.body.status,
                updated_by: req.body.updated_by,

                updated_at: new Date(),
            },
        });

        res.status(200).json({ data: updatedDocument });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Soft delete document
export const DeleteCategoriesDocuments = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);

        const updatedDocument = await prismaDB2.mst_document_categories.update({
            where: { id: id },
            data: {
                is_deleted: 1,
            },
        });

        res.status(200).json({ message: "Document soft deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};