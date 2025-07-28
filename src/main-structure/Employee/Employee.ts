import { Request, Response } from "express";
import { prismaDB1 } from "../../config/database";

export const getEmployees = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = 10;
        const searchTerm = (req.query.search as string) || "";
        const code = (req.query.code as string) || "";
        const name = (req.query.name as string) || "";

        const offset = (page - 1) * limit;

        const whereCondition: any = {
            AND: []
        };

        if (searchTerm) {
            whereCondition.OR = [
                { employee_code: { contains: searchTerm } },
                { employee_name: { contains: searchTerm } }
            ];
        }

        if (code) {
            whereCondition.AND.push({ employee_code: { equals: code } });
        }

        if (name) {
            whereCondition.AND.push({ employee_name: { contains: name } });
        }

        const [employees, totalCount] = await Promise.all([
            prismaDB1.mst_user.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                select: {
                    user_id: true,
                    employee_code: true,
                    employee_name: true,
                    email: true,
                    phone_number: true,
                },
                orderBy: {
                    employee_name: 'asc'
                }
            }),
            prismaDB1.mst_employment.count({ where: whereCondition }),
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        res.json({
            data: employees,
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
