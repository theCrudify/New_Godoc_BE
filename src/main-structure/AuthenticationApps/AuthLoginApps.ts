import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import dotenv from "dotenv";
import { prismaDB1, prismaDB2 } from "../../config/database";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = process.env.JWT_EXPIRATION;

if (!JWT_SECRET) {
    throw new Error("❌ JWT_SECRET is not defined in environment variables!");
}
if (!JWT_EXPIRATION) {
    throw new Error("❌ JWT_EXPIRATION is not defined in environment variables!");
}

// Tipe data sementara untuk user, bisa disesuaikan
type UserType = {
    user_id: number;
    username: string | null;
    email: string | null;
    password?: string | null; // Password mungkin null jika dari bypass
    employee_code: string;
    employee_name: string | null;
} | null;


const parsedExpiration: SignOptions["expiresIn"] = /^\d+$/.test(JWT_EXPIRATION)
    ? Number(JWT_EXPIRATION)
    : (JWT_EXPIRATION as SignOptions["expiresIn"]);

const loginAttempts = new Map<string, { count: number; timer?: NodeJS.Timeout; blockUntil?: number }>();

export const loginUserGodoc = async (req: Request, res: Response): Promise<void> => {
    try {
        const { uname, username: empCode, password } = req.body;
        const key = empCode || uname;

        // --- Blokir sementara ---
        if (loginAttempts.get(key)?.blockUntil && Date.now() < loginAttempts.get(key)!.blockUntil!) {
            console.warn(`⚠️ User ${key} is blocked due to excessive login attempts.`);
            res.status(429).json({ error: "Too Many Attempts", details: "Your account is temporarily blocked. Please try again later." });
            return;
        }

        // --- Validasi input ---
        if (!empCode && !uname) {
            console.warn("⚠️ Missing required fields: 'uname' or 'username'");
            res.status(400).json({ error: "Employee code or username is required", details: "Both 'uname' and 'username' (employee code) are missing." });
            return;
        }

        // --- Pencarian User Tahap 1: Exact Match ---
        let user: UserType = await prismaDB1.mst_user.findFirst({
            where: {
                // Cari berdasarkan employee_code jika ada, ATAU username jika ada
                OR: [
                    empCode ? { employee_code: empCode } : {},
                    uname ? { username: uname } : {}
                ].filter(c => Object.keys(c).length > 0), // Filter objek kosong jika salah satu tidak ada
                is_deleted: false,
            },
            select: { user_id: true, username: true, email: true, password: true, employee_code: true, employee_name: true },
        });

        // --- Pencarian User Tahap 2: Flexible Employee Code (Padding) ---
        // Dilakukan HANYA jika user tidak ditemukan di tahap 1 DAN input menggunakan empCode DAN panjangnya < 5
        if (!user && empCode && empCode.length > 0 && empCode.length < 5) {
            const paddedCode = empCode.padStart(5, '0'); // Tambahkan '0' di depan hingga 5 digit
            console.log(`ℹ️ User not found with exact code '${empCode}'. Trying padded code: '${paddedCode}'`);

            const potentialUser = await prismaDB1.mst_user.findFirst({
                where: {
                    employee_code: paddedCode, // Cari HANYA dengan kode yang sudah di-padding
                    is_deleted: false,
                },
                 select: { user_id: true, username: true, email: true, password: true, employee_code: true, employee_name: true },
            });

            if (potentialUser) {
                // Validasi aturan khusus: Jika kode di DB mulai '00' dan input TIDAK mulai '0', tolak.
                if (potentialUser.employee_code.startsWith('00') && !empCode.startsWith('0')) {
                     console.warn(`⚠️ Found user with padded code '${paddedCode}', but original input '${empCode}' is invalid for a code starting with '00'. Rejecting.`);
                     // JANGAN set `user = potentialUser`, biarkan `user` tetap null.
                }
                // Pastikan user yang ditemukan via padding memang 5 digit dan berawalan 0
                else if (potentialUser.employee_code.length === 5 && potentialUser.employee_code.startsWith('0')) {
                     console.log(`✅ Found user using padded code '${paddedCode}' from input '${empCode}'. Accepting.`);
                     user = potentialUser; // Terima user yang ditemukan ini
                } else {
                    console.log(`ℹ️ Found user with padded code '${paddedCode}', but the stored code is not 5 digits starting with '0'. Ignoring.`);
                    // Abaikan user ini jika tidak sesuai kriteria (misal, padding "123" jadi "00123" tapi di DB adanya "123")
                }
            } else {
                 console.log(`ℹ️ Padded code '${paddedCode}' also not found.`);
            }
        }

        // --- Penanganan login bypass "demo" ---
        // Dilakukan SETELAH pencarian normal/padding gagal atau berhasil
        if (password === "demo") {
            if (!user) {
                 // Jika user masih belum ketemu (setelah exact & padding), buat user demo
                console.log("⚠️ Bypass login triggered for demo user (user not found initially):", uname || empCode);
                user = {
                    user_id: 0,
                    username: uname || empCode,
                    email: "bypass@example.com",
                    employee_code: empCode || uname, // Gunakan input asli
                    employee_name: "Bypass User",
                    password: "",
                };
            } else {
                 // Jika user ditemukan (baik exact maupun padding), gunakan data user tsb tapi bypass password
                 console.log(`ℹ️ Bypass login triggered for existing user: ${user.employee_code}`);
                 // Password akan divalidasi sebagai 'true' nanti
            }
        }

        // --- User tidak ditemukan (setelah semua cara & bypass) ---
        if (!user) {
            handleFailedLogin(key);
            console.warn(`⚠️ User Not Found: ${key} (after exact match, padding attempt, and bypass check)`);
            res.status(404).json({ error: "User Not Found", details: "User not found with provided credentials or matching criteria." });
            return;
        }

        // --- Cari data otorisasi di DB2 (menggunakan employee_code dari user yang DITEMUKAN) ---
        const auth = await prismaDB2.mst_authorization.findFirst({
            // Gunakan employee_code dari objek 'user' yang valid
            where: { employee_code: user.employee_code, employee_name: user.employee_name },
            include: { /* ... includes ... */
                department: true,
                plant: true,
                role: true,
                section: true,
            },
        });

        // --- Otorisasi tidak ditemukan ---
        if (!auth) {
             // Perhatikan: Jika user adalah user bypass 'demo' yang baru dibuat, auth pasti tidak akan ada.
             // Anda mungkin perlu menangani kasus ini secara khusus jika user demo perlu role/auth default.
            if (password === "demo" && user.user_id === 0) {
                 console.warn(`⚠️ Authorization data missing for DEMO user: ${user.employee_code}. Provide default auth if needed.`);
                 // Opsi: Buat objek auth default di sini jika diperlukan
                 // Contoh: const auth = { id: 0, role: { role_id: 0, role_name: 'Demo Role'}, ... };
                 // Jika tidak, biarkan error 404 di bawah dieksekusi.
            }

            handleFailedLogin(key); // Gagal login jika auth tidak ada (kecuali ditangani khusus untuk demo)
            console.warn(`⚠️ Authorization data missing for user: ${user.employee_code}`);
            res.status(404).json({ error: "Authorization Not Found", details: "Authorization data not found for the user." });
            return;
        }

        // --- Validasi password ---
        let isPasswordValid = false;
        if (password === "demo") {
            isPasswordValid = true; // Bypass password check
        } else if (user.password) { // Pastikan user.password ada (tidak null/undefined)
            isPasswordValid = await bcrypt.compare(password, user.password);
        }

        if (!isPasswordValid) {
            handleFailedLogin(key);
            console.warn(`⚠️ Invalid Credentials for user: ${user.employee_code}`);
            res.status(401).json({ error: "Invalid Credentials", details: "Incorrect password." });
            return;
        }

        // --- Reset percobaan login jika berhasil ---
        resetLoginAttempts(key);

        // --- Buat JWT Token (menggunakan data user dan auth yang valid) ---
        const token = jwt.sign(
            {
                auth_id: auth.id, // ID Otorisasi
                // Data dari user yang ditemukan (bisa dari exact match atau padding yg valid)
                nik: user.employee_code,
                name: user.employee_name,
                email: user.email,
                // Data dari auth
                role: auth.role,
                department: auth.department,
                site: auth.plant,
                section: auth.section,
            },
            JWT_SECRET,
            { expiresIn: parsedExpiration }
        );

        // --- Set Cookie ---
        res.cookie("auth_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: convertExpirationToMs(JWT_EXPIRATION)
        });

        // --- Kirim Respons Sukses ---
        console.log(`✅ Login successful: ${user.employee_code}`);
        res.status(200).json({
            data: {
                auth_id: auth.id, // ID Otorisasi
                // Data dari user yang ditemukan
                nik: user.employee_code,
                name: user.employee_name,
                email: user.email,
                 // Data dari auth
                role: auth.role,
                department: auth.department,
                site: auth.plant,
                section: auth.section,
            },
            token: token,
        });

    } catch (error: any) {
        console.error("❌ Login error:", error.message, error.stack);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};

const convertExpirationToMs = (expiration: string): number => {
    try {
        const match = expiration.match(/^(\d+)([smhd])$/);
        if (!match) throw new Error("❌ Invalid JWT_EXPIRATION format!");

        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case "s": return value * 1000;
            case "m": return value * 60 * 1000;
            case "h": return value * 60 * 60 * 1000;
            case "d": return value * 24 * 60 * 60 * 1000;
            default: throw new Error("❌ Invalid JWT_EXPIRATION format!");
        }
    } catch (error: any) {
        console.error("❌ Expiration Conversion Error:", error.message);
        throw error;
    }
};

const handleFailedLogin = (key: string) => {
    const attempt = loginAttempts.get(key) || { count: 0 };
    attempt.count += 1;
    loginAttempts.set(key, attempt);

    if (attempt.count >= 5 && !attempt.blockUntil) {
        attempt.blockUntil = Date.now() + 15 * 60 * 1000;
        console.warn(`⚠️ User ${key} exceeded login attempts. Blocked until ${new Date(attempt.blockUntil).toLocaleString()}`);
        attempt.timer = setTimeout(() => {
            attempt.count = 0;
            attempt.blockUntil = undefined;
            loginAttempts.set(key, attempt);
            console.log(` User ${key} login attempts unblocked.`);
        }, 15 * 60 * 1000);
        loginAttempts.set(key, attempt);
    }
};

const resetLoginAttempts = (key: string) => {
    const attempt = loginAttempts.get(key);
    if (attempt?.timer) clearTimeout(attempt.timer);
    loginAttempts.delete(key);
};