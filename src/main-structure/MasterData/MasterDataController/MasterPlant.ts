// src/main-structure/Plant/PlantController.ts
import { Request, Response } from "express";
import { prismaDB2 } from "../../../config/database";

const buildPlantWhereCondition = (req: Request) => {
    const searchTerm = req.query.search as string;
    const code = req.query.code as string;
    const name = req.query.name as string;

    return {
        AND: [
            ...(code ? [{ plant_code: { equals: code } }] : []),
            ...(name ? [{ plant_name: { equals: name } }] : []),
        ],
        OR: searchTerm ? [
            { plant_code: { contains: searchTerm } },
            { plant_name: { contains: searchTerm } },
            { address: { contains: searchTerm } },
        ] : undefined,
    };
};

export const getAllPlants = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const whereCondition = buildPlantWhereCondition(req);

        const [plants, totalCount] = await prismaDB2.$transaction([
            prismaDB2.mst_plant.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy: { id: "asc" },
                select: {
                    id: true, plant_name: true, plant_code: true, address: true,
                    created_at: true, created_by: true, updated_at: true, updated_by: true,
                },
            }),
            prismaDB2.mst_plant.count({ where: whereCondition }),
        ]);

        res.status(200).json({
            data: plants,
            pagination: {
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
                currentPage: page,
                limit,
                hasNextPage: page * limit < totalCount,
                hasPreviousPage: page > 1,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getPlantById = async (req: Request, res: Response): Promise<void> => {
    try {
        const plantId = Number(req.params.id);
        if (isNaN(plantId)) {
            res.status(400).json({ error: "Invalid Plant ID" });
            return;
        }

        const plant = await prismaDB2.mst_plant.findUnique({
            where: { id: plantId },
            select: {
                id: true, plant_code: true, plant_name: true, address: true,
                created_at: true, created_by: true, updated_at: true, updated_by: true,
                authorizations: { select: { id: true, role_id: true, plant_id: true } },
                departments: { select: { id: true, department_code: true, department_name: true } },
            },
        });

        if (!plant) {
            res.status(404).json({ error: "Plant not found" });
            return;
        }
        res.status(200).json(plant);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};