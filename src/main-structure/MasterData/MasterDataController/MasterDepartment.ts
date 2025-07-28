import { Request, Response } from "express";
import { prismaDB2 } from "../../../config/database"; // Ganti jika nama variabel Anda berbeda

// --- Helper Functions (untuk validasi, dll.) ---

function validateDepartmentData(data: any) {
  const errors: string[] = [];

  console.log("Data yang diterima di validasi:", data); // LOG INI

  if (!data.department_name) { //contoh validasi
    errors.push("Department name is required");
  }

  console.log("Errors:", errors); // LOG INI
  return errors;
}

interface DepartmentWhereCondition {
  AND?: Array<Record<string, any>>;
  OR?: Array<Record<string, any>>;
  is_deleted?: boolean;
  status?: boolean;
}

// --- CRUD Functions ---

export const getAllDepartments = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const searchTerm = (req.query.search as string) || "";
    const code = (req.query.code as string) || "";
    const name = (req.query.name as string) || "";
    const status = req.query.status === "true";
    const sortColumn = (req.query.sort as string) || "id"; // Kolom default untuk sorting
    const sortDirection = (req.query.direction === "desc" ? "desc" : "asc"); // Default ke ascending

    const offset = (page - 1) * limit;

    const whereCondition: DepartmentWhereCondition = {
      is_deleted: false,
      AND: []
    };

    if (searchTerm) {
      whereCondition.OR = [
        { department_code: { contains: searchTerm.toLowerCase() } },
        { department_name: { contains: searchTerm.toLowerCase() } }
      ];
    }

    if (code) {
      whereCondition.AND = whereCondition.AND || [];
      whereCondition.AND.push({ department_code: { equals: code.toLowerCase() } });
    }

    if (name) {
      whereCondition.AND = whereCondition.AND || [];
      whereCondition.AND.push({ department_code: { equals: code.toLowerCase() } });
    }

    if (req.query.status !== undefined) {
      whereCondition.status = status;
    }

    const [departments, totalCount] = await prismaDB2.$transaction([
      prismaDB2.mst_department.findMany({
        where: whereCondition,
        skip: offset,
        take: limit,
        orderBy: { [sortColumn]: sortDirection }, // Sorting dinamis
        include: {
          plant: {
            select: { plant_code: true }
          }
        }
      }),
      prismaDB2.mst_department.count({ where: whereCondition }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    res.status(200).json({
      data: departments.map(dept => ({
        id: dept.id,
        department_name: dept.department_name,
        department_code: dept.department_code,
        plant_code: dept.plant?.plant_code ?? null,
        status: dept.status,
        created_by: dept.created_by,
        created_at: dept.created_at,
        updated_by: dept.updated_by,
        updated_at: dept.updated_at
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

// Read (Ambil Satu Department berdasarkan ID)
export const getDepartmentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID", details: "ID must be a valid number." });
      return;
    }

    const department = await prismaDB2.mst_department.findUnique({
      where: {
        id,             // Cari berdasarkan ID
        is_deleted: false, // DAN pastikan is_deleted adalah false
      },
    });

    // Cek apakah departemen ditemukan DAN belum dihapus (is_deleted = false)
    if (!department) {
      res.status(404).json({ error: "Department not found or has been deleted" }); // Pesan yang lebih informatif
      return;
    }


    res.status(200).json(department);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Create (Buat Department Baru)
export const createDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = req.body;

    // Validasi
    const errors = validateDepartmentData(data);
    if (errors.length > 0) {
      res.status(400).json({ error: "Validation Error", details: errors });
      return;
    }

    // Cek apakah plant_id valid (jika ada)
    if (data.plant_id) {
      console.log("plant_id yang diterima:", data.plant_id); // LOG INI
      const plant = await prismaDB2.mst_plant.findUnique({
        where: { id: data.plant_id },
      });

      console.log("Hasil pencarian plant:", plant); // LOG INI

      if (!plant) {
        res.status(400).json({ error: "Invalid plant_id", details: "Plant with provided ID does not exist." });
        return;
      }
    }

    // Cek Duplikat berdasarkan department_code (jika diperlukan, dan department_code di set unique di schema)
    // Cek Duplikat (findFirst)
    if (data.department_code) {
      const existingDepartment = await prismaDB2.mst_department.findFirst({ // Ganti findUnique ke findFirst
        where: { department_code: data.department_code },
      });
      if (existingDepartment) {
        res.status(409).json({ error: "Duplicate department_code", details: "Department with this code already exists." });
        return;
      }
    }

    const newDepartment = await prismaDB2.mst_department.create({
      data: {
        department_name: data.department_name,
        department_code: data.department_code,
        plant_id: data.plant_id,
        status: data.status,
        created_by: data.created_by, // Pastikan ada mekanisme autentikasi untuk mendapatkan user ID
        // updated_by tidak di-set saat create
      },
    });

    res.status(201).json({ message: "Department created successfully", data: newDepartment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Update (Perbarui Department)
export const updateDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID", details: "ID must be a valid number." });
      return;
    }
    // Validasi input
    const errors = validateDepartmentData(data);
    if (errors.length > 0) {
      res.status(400).json({ error: "Validation Error", details: errors });
      return;
    }

    // Cek apakah department ada
    const existingDepartment = await prismaDB2.mst_department.findUnique({
      where: { id },
    });

    if (!existingDepartment) {
      res.status(404).json({ error: "Department not found" });
      return;
    }

    // Cek apakah plant_id valid (jika ada)
    if (data.plant_id) {
      const plant = await prismaDB2.mst_plant.findUnique({
        where: { id: data.plant_id },
      });
      if (!plant) {
        res.status(400).json({ error: "Invalid plant_id", details: "Plant with provided ID does not exist." });
        return;
      }
    }
    // Cek Duplikat berdasarkan department_code (jika diperlukan, dan department_code di set unique di schema)
    // Cek duplikat HANYA jika department_code diubah
    if (data.department_code && data.department_code !== existingDepartment.department_code) {
      const duplicateDepartment = await prismaDB2.mst_department.findFirst({
        where: { department_code: data.department_code },
      });
      if (duplicateDepartment) {
        res.status(409).json({ error: "Duplicate department_code", details: "Department with this code already exists." });
        return;
      }
    }

    // Update data
    const updatedDepartment = await prismaDB2.mst_department.update({
      where: { id },
      data: {
        department_name: data.department_name,
        department_code: data.department_code,
        plant_id: data.plant_id,
        status: data.status,
        updated_by: data.updated_by, // Pastikan ada mekanisme autentikasi
        updated_at: new Date(),      // Selalu update updated_at
      },
    });

    res.status(200).json({ message: "Department updated successfully", data: updatedDepartment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Delete (Hapus Department) - Soft Delete
export const deleteDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID", details: "ID must be a valid number." });
      return;
    }

    // Cek apakah department ada dan belum di-soft delete.  Ini penting!
    const existingDepartment = await prismaDB2.mst_department.findUnique({
      where: { id },
    });

    if (!existingDepartment) {
      res.status(404).json({ error: "Department not found" }); // Atau "Department not found or already deleted"
      return;
    }
    // Cek sudah di soft delete
    if (existingDepartment.is_deleted) {
      res.status(404).json({ error: "Department already deleted" });
      return;
    }

    // *Soft Delete*
    await prismaDB2.mst_department.update({
      where: { id },
      data: { is_deleted: true }, // Set is_deleted menjadi true
    });

    res.status(200).json({ message: "Department soft-deleted successfully" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


