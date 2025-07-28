import { Request, Response } from "express";
import { prismaDB2 } from "../../../config/database";

interface LineWhereCondition {
  AND?: Array<Record<string, any>>;
  OR?: Array<Record<string, any>>;
  is_deleted?: boolean;
  status?: boolean;
}

function validateLineData(data: any): string[] {
  const errors: string[] = [];

  if (!data.line) {
    errors.push("Line name is required.");
  } else if (data.line.length > 255) {
    errors.push("Line name cannot exceed 255 characters.");
  }

  if (data.id_section_manufacture == null) {
    errors.push("Section Manufacture ID is required.");
  } else if (typeof data.id_section_manufacture !== 'number') {
    errors.push("Section Manufacture ID must be a number.");
  }

  return errors;
}

export const getAllLines = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const searchTerm = (req.query.search as string) || "";
    const status = req.query.status === "true";
    const sortColumn = (req.query.sort as string) || "id";
    const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

    const validSortColumns = [
      "id", "line", "code_line", "status", "created_at", "updated_at",
      "section_name", "department_name", "plant_name", "plant_code"
    ];

    const orderBy: any = validSortColumns.includes(sortColumn)
      ? sortColumn === "section_name"
        ? { section_manufacture: { section_name: sortDirection } }
        : sortColumn === "department_name"
          ? { section_manufacture: { department: { department_name: sortDirection } } }
          : sortColumn === "plant_name" || sortColumn === "plant_code"
            ? { section_manufacture: { department: { plant: { [sortColumn]: sortDirection } } } }
            : { [sortColumn]: sortDirection }
      : { id: "asc" };

    const offset = (page - 1) * limit;

    const whereCondition: LineWhereCondition = {
      is_deleted: false,
      AND: []
    };

    if (searchTerm) {
      whereCondition.OR = [
        { line: { contains: searchTerm.toLowerCase() } },
        { code_line: { contains: searchTerm.toLowerCase() } },
        { section_manufacture: { section_name: { contains: searchTerm.toLowerCase() } } },
        { section_manufacture: { department: { department_name: { contains: searchTerm.toLowerCase() } } } },
        { section_manufacture: { department: { plant: { plant_name: { contains: searchTerm.toLowerCase() } } } } },
        { section_manufacture: { department: { plant: { plant_code: { contains: searchTerm.toLowerCase() } } } } }
      ];
    }

    if (req.query.status !== undefined) {
      whereCondition.status = status;
    }

    const [lines, totalCount] = await prismaDB2.$transaction([
      prismaDB2.mst_line.findMany({
        where: whereCondition,
        skip: offset,
        take: limit,
        orderBy,
        include: {
          section_manufacture: {
            select: {
              section_name: true,
              department: {
                select: {
                  department_name: true,
                  plant: {
                    select: {
                      plant_name: true,
                      plant_code: true
                    }
                  }
                }
              }
            }
          }
        }
      }),
      prismaDB2.mst_line.count({ where: whereCondition }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    res.status(200).json({
      data: lines.map(line => ({
        id: line.id,
        line: line.line,
        code_line: line.code_line,
        status: line.status,
        created_by: line.created_by,
        created_at: line.created_at,
        updated_by: line.updated_by,
        updated_at: line.updated_at,
        section_name: line.section_manufacture?.section_name ?? null,
        department_name: line.section_manufacture?.department?.department_name ?? null,
        plant_name: line.section_manufacture?.department?.plant?.plant_name ?? null,
        plant_code: line.section_manufacture?.department?.plant?.plant_code ?? null
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


// --- CRUD Functions ---

export const getLineById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const line = await prismaDB2.mst_line.findUnique({
      where: {
        id,
        is_deleted: false,
      },
      include: {
        section_manufacture: true
      }
    });

    if (!line) {
      res.status(404).json({ error: "Line not found" });
      return;
    }

    res.status(200).json(line);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const createLine = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = req.body;
    const errors = validateLineData(data);

    if (errors.length > 0) {
      res.status(400).json({ error: "Validation Error", details: errors });
      return;
    }

    const section = await prismaDB2.mst_section_department.findUnique({
      where: { id: data.id_section_manufacture },
    });

    if (!section) {
      res.status(400).json({ error: "Invalid id_section_manufacture", details: "Section with provided ID does not exist." });
      return;
    }

    const existingLine = await prismaDB2.mst_line.findFirst({
      where: {
        line: data.line,
        id_section_manufacture: data.id_section_manufacture
      },
    });

    if (existingLine) {
      res.status(409).json({ error: "Duplicate line", details: `Line with name ${data.line} already exists in this section` });
      return;
    }

    const newLine = await prismaDB2.mst_line.create({
      data: {
        line: data.line,
        id_section_manufacture: data.id_section_manufacture,
        code_line: data.code_line,
        status: data.status ?? true,
        created_by: data.created_by,
      },
    });

    res.status(201).json({ message: "Line created successfully", data: newLine });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const updateLine = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const errors = validateLineData(data);
    if (errors.length > 0) {
      res.status(400).json({ error: "Validation Error", details: errors });
      return;
    }

    const updatedLine = await prismaDB2.mst_line.update({
      where: { id },
      data: {
        line: data.line,
        id_section_manufacture: data.id_section_manufacture,
        code_line: data.code_line,
        status: data.status,
        updated_by: data.updated_by,
        updated_at: new Date(),
      },
    });

    res.status(200).json({ message: "Line updated successfully", data: updatedLine });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const deleteLine = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    await prismaDB2.mst_line.update({
      where: { id },
      data: { is_deleted: true },
    });

    res.status(200).json({ message: "Line soft-deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
