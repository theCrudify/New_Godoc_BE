import { Request, Response } from "express";
import { prismaDB2 } from "../../../config/database";

interface SubDocumentWhereCondition {
    id?: number;
    desc?: { contains: string };
    code?: { contains: string };
    AND?: any[];
    OR?: any[];
}

// Get all subdocuments
export const getAllSubDocuments = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || "";
        const sortColumn = (req.query.sort as string) || "id";
        const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

        const validSortColumns = ["id", "desc", "code"];
        const orderBy: any = validSortColumns.includes(sortColumn)
            ? { [sortColumn]: sortDirection }
            : { id: "asc" };

        const offset = (page - 1) * limit;

        const whereCondition: SubDocumentWhereCondition = {
            AND: []
        };

        if (searchTerm) {
            whereCondition.OR = [
                { desc: { contains: searchTerm.toLowerCase() } },
                { code: { contains: searchTerm.toLowerCase() } },

            ];
        }

        const [subdocuments, totalCount] = await prismaDB2.$transaction([
            prismaDB2.mst_sub_document.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy,
            }),
            prismaDB2.mst_sub_document.count({ where: whereCondition }),
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        res.status(200).json({
            data: subdocuments,
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

// Get subdocument by id
export const getSubDocumentById = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        const subdocument = await prismaDB2.mst_sub_document.findUnique({
            where: {
                id: id,
            },
        });

        if (!subdocument) {
            res.status(404).json({ error: "Subdocument not found" });
            return;
        }

        res.status(200).json({ data: subdocument });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Create a new subdocument
export const createSubDocument = async (req: Request, res: Response): Promise<void> => {
    try {
        const { desc, code } = req.body;

        const newSubDocument = await prismaDB2.mst_sub_document.create({
            data: {
                desc,
                code,
            },
        });

        res.status(201).json({ data: newSubDocument });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Update an existing subdocument
export const updateSubDocument = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { desc, code } = req.body;

        if (!id) {
            res.status(400).json({ error: "ID is required" });
            return;
        }

        const existingSubDocument = await prismaDB2.mst_sub_document.findUnique({
            where: { id: Number(id) },
        });

        if (!existingSubDocument) {
            res.status(404).json({ error: "SubDocument not found" });
            return;
        }

        const updatedSubDocument = await prismaDB2.mst_sub_document.update({
            where: { id: Number(id) },
            data: { desc, code },
        });

        res.status(200).json({
            message: "SubDocument updated successfully",
            data: updatedSubDocument,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


// Delete a subdocument
export const deleteSubDocument = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);

        await prismaDB2.mst_sub_document.delete({
            where: {
                id: id,
            },
        });

        res.status(204).send(); // 204 No Content untuk sukses penghapusan
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};