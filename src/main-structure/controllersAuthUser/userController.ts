import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prismaDB1 } from "../../config/database"; // ✅ Ini benar
import { verifyToken } from "../../middleware/authMiddleware"; // Import middleware JWT

// Fungsi untuk mendapatkan semua pengguna
export const getUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        verifyToken(req, res, async () => { // Gunakan middleware JWT sebelum eksekusi endpoint
            const users = await prismaDB1.mst_user.findMany({
                where: { is_deleted: false }, // Hanya ambil user yang belum dihapus
                select: { user_id: true, username: true, email: true, created_at: true }, // Pilih data yang perlu dikirim
            });

            if (users.length === 0) {
                res.status(404).json({ error: "No users found" });
                return;
            }

            res.json(users);
        });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
};

//User by ID
export const getUser = async (req: Request, res: Response): Promise<void> => {
    try {
        verifyToken(req, res, async () => { // Gunakan middleware JWT sebelum eksekusi endpoint
            const user = await prismaDB1.mst_user.findFirst({
                where: {
                    user_id: Number(req.params.id),
                    is_deleted: false // Hanya ambil user yang belum dihapus
                }
            });

            if (!user) {
                res.status(404).json({ error: "User not found or has been deleted" });
                return;
            }

            res.json(user);
        });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Fungsi untuk membuat pengguna baru
export const createUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { employee_code, employee_name, username, phone_number, email, password } = req.body;

        // Cek field mana saja yang kosong
        const missingFields = [];
        if (!employee_code) missingFields.push("employee_code");
        if (!employee_name) missingFields.push("employee_name");
        if (!username) missingFields.push("username");
        if (!email) missingFields.push("email");
        if (!password) missingFields.push("password");
        if (!phone_number) missingFields.push("phone_number");

        if (missingFields.length > 0) {
            res.status(400).json({ error: "The following fields are required", missingFields });
            return;
        }

        // Validasi kekuatan password
        if (password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
            res.status(400).json({ error: "Password must be at least 8 characters long, with at least one uppercase letter and one number" });
            return;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Cek apakah employee_code, username, email, atau phone_number sudah ada
        const existingUser = await prismaDB1.mst_user.findFirst({
            where: {
                OR: [
                    { employee_code },
                    { username },
                    { email },
                    { phone_number },
                ],
            },
            select: { employee_code: true, username: true, email: true, phone_number: true },
        });

        if (existingUser) {
            const errors: Record<string, string> = {};
            if (existingUser.employee_code === employee_code) errors.employee_code = "Employee code already exists";
            if (existingUser.username === username) errors.username = "Username already exists";
            if (existingUser.email === email) errors.email = "Email already exists";
            if (existingUser.phone_number === phone_number) errors.phone_number = "Phone number already exists";

            res.status(400).json({ error: "Duplicate data found", errors });
            return;
        }

        // Jika tidak ada duplikat, buat user baru
        const newUser = await prismaDB1.mst_user.create({
            data: {
                employee_code,
                employee_name,
                username,
                phone_number,
                email,
                password: hashedPassword,
            },
            select: {
                user_id: true,
                employee_code: true,
                employee_name: true,
                username: true,
                phone_number: true,
                email: true,
                created_at: true,
            },
        });

        res.status(201).json({ message: "User created successfully", user: newUser });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};




export const updateUser = async (req: Request, res: Response): Promise<void> => {
    try {
        verifyToken(req, res, async () => { // Gunakan middleware JWT sebelum eksekusi endpoint
            const userId = Number(req.params.id);
            const { username, email } = req.body;

            // Cek apakah user dengan ID tersebut ada
            const existingUser = await prismaDB1.mst_user.findUnique({ where: { user_id: userId } });

            if (!existingUser) {
                res.status(404).json({ error: "User not found" });
                return;
            }

            // Cek apakah username atau email sudah digunakan oleh user lain
            const userWithSameData = await prismaDB1.mst_user.findFirst({
                where: {
                    OR: [{ username }, { email }],
                    NOT: { user_id: userId }, // Pastikan bukan user yang sedang diupdate
                },
            });

            if (userWithSameData) {
                if (userWithSameData.username === username && userWithSameData.email === email) {
                    res.status(400).json({ error: "Username and email already exist" });
                    return;
                } else if (userWithSameData.username === username) {
                    res.status(400).json({ error: "Username already exists" });
                    return;
                } else if (userWithSameData.email === email) {
                    res.status(400).json({ error: "Email already exists" });
                    return;
                }
            }

            // Update user jika lolos validasi
            const updatedUser = await prismaDB1.mst_user.update({
                where: { user_id: userId },
                data: { username, email },
            });

            res.json({ message: "User updated successfully", updatedUser });
        });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Fungsi untuk menghapus pengguna (Hard Delete)
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
        verifyToken(req, res, async () => { // Gunakan middleware JWT sebelum eksekusi endpoint
            const userId = Number(req.params.id);

            // Cek apakah user dengan ID tersebut ada
            const existingUser = await prismaDB1.mst_user.findUnique({ where: { user_id: userId } });

            if (!existingUser) {
                res.status(404).json({ error: "User not found" });
                return;
            }

            // Hapus user jika ditemukan
            await prismaDB1.mst_user.delete({ where: { user_id: userId } });

            res.json({ message: "User deleted successfully" });
        });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Soft delete user (menandai is_deleted: true)
export const softDeleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
        verifyToken(req, res, async () => { // Gunakan middleware JWT sebelum eksekusi endpoint
            const userId = Number(req.params.id);

            // Langsung coba update user tanpa perlu dua query
            const updatedUser = await prismaDB1.mst_user.updateMany({
                where: { user_id: userId, is_deleted: false },
                data: { is_deleted: true },
            });

            if (updatedUser.count === 0) {
                res.status(404).json({ error: "User not found or already deleted" });
                return;
            }

            res.json({ message: "User soft deleted successfully" });
        });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
};


export const createUsersFromEmployment = async (
    req: Request,
    res: Response
): Promise<void> => {
    const batchSize = 100; // Tentukan ukuran batch (100 data per batch)
    let totalCreated = 0; // Total user yang berhasil dibuat
    let totalSkipped = 0; // Tambahkan counter untuk data yang dilewati

    try {
        // 1. Dapatkan jumlah total data employment (lebih efisien dari findMany)
        const totalEmploymentCount = await prismaDB1.mst_employment.count();


        if (totalEmploymentCount === 0) {
            console.log(`[${new Date().toISOString()}] Tidak ada data employment ditemukan.`);
            res.status(404).json({ error: "No employment data found" });
            return;
        }

        console.log(`[${new Date().toISOString()}] Total data employment ditemukan: ${totalEmploymentCount} baris.`);

        // 2. Loop per batch
        for (let offset = 0; offset < totalEmploymentCount; offset += batchSize) {
            console.log(`[${new Date().toISOString()}] Memproses batch: ${offset + 1} - ${Math.min(offset + batchSize, totalEmploymentCount)}`);

            const employments = await prismaDB1.mst_employment.findMany({
                take: batchSize,  // Ambil data per batch
                skip: offset,    // Lewati data yang sudah diproses
                orderBy: {
                    id: 'asc',
                },
                select: {
                    employee_code: true,
                    employee_name: true,
                    mail_id: true,
                    phone_number: true,
                },
            });

            const usersToCreate = [];
            for (const emp of employments) {
                const username = emp.employee_name.toLowerCase().replace(/[\s.]+/g, "");
                const hashedPassword = await bcrypt.hash("jidan", 10);

                usersToCreate.push({
                    employee_code: emp.employee_code,
                    employee_name: emp.employee_name,
                    username: username,
                    email: emp.mail_id || "",
                    password: hashedPassword,
                    phone_number: emp.phone_number || "",
                    status: true,
                    created_at: new Date(),
                    updated_at: new Date(),
                    is_deleted: false,
                });
            }


            try { // Inner try...catch untuk handle error per batch
                const result = await prismaDB1.mst_user.createMany({
                    data: usersToCreate,
                    skipDuplicates: true, // Lewati duplikat
                });
                totalCreated += result.count;
                console.log(`[${new Date().toISOString()}] Batch ${offset + 1} - ${Math.min(offset + batchSize, totalEmploymentCount)} selesai: ${result.count} user dibuat.`);

            } catch (innerError) {
                console.error(`[${new Date().toISOString()}] Error dalam batch ${offset + 1} - ${Math.min(offset + batchSize, totalEmploymentCount)}:`, innerError);
                if ((innerError as any).code === 'P2002') {
                    // Hitung berapa banyak data yang di-skip karena duplikat (perkiraan)
                    const duplicateCount = usersToCreate.length - (innerError as any).meta?.target?.length || 0; // Perkiraan
                    totalSkipped += duplicateCount;

                    console.log(`[${new Date().toISOString()}] Terdeteksi duplikat. ${duplicateCount} data dilewati dalam batch ini.`);
                }
                //  Lanjutkan ke batch berikutnya, jangan hentikan seluruh proses
            }
        }

        console.log(`[${new Date().toISOString()}] Proses selesai. Total user dibuat: ${totalCreated}, Total data dilewati (duplikat/error): ${totalSkipped}`);
        res.status(201).json({
            message: "Users created successfully",
            total_created: totalCreated,
            total_skipped: totalSkipped, // Sertakan jumlah data yang dilewati
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Terjadi error:`, error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};