import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import dotenv from "dotenv";
import { prismaDB1 } from "../../config/database";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = process.env.JWT_EXPIRATION;

if (!JWT_SECRET) {
    throw new Error("❌ JWT_SECRET is not defined in environment variables!");
}
if (!JWT_EXPIRATION) {
    throw new Error("❌ JWT_EXPIRATION is not defined in environment variables!");
}

// Pastikan JWT_EXPIRATION sesuai dengan tipe yang diharapkan oleh `jwt.sign()`
const parsedExpiration: SignOptions["expiresIn"] = /^\d+$/.test(JWT_EXPIRATION)
    ? Number(JWT_EXPIRATION) // Jika hanya angka, ubah ke Number
    : (JWT_EXPIRATION as SignOptions["expiresIn"]); // Jika string valid, tetap gunakan

// Gunakan Map sederhana agar lebih cepat
const loginAttempts = new Map<string, { count: number; timer?: NodeJS.Timeout }>();

export const loginUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        // Ambil user langsung dari database
        const user = await prismaDB1.mst_user.findFirst({
            where: { email, is_deleted: false },
            select: { user_id: true, username: true, email: true, password: true }
        });

        if (!user) {
            handleFailedLogin(email);
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        // Cek apakah password cocok
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            handleFailedLogin(email);
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        // Reset login attempt jika berhasil login
        resetLoginAttempts(email);

        // Buat token JWT dengan masa berlaku dari ENV
        const token = jwt.sign(
            { user_id: user.user_id, email: user.email, username: user.username },
            JWT_SECRET,
            { expiresIn: parsedExpiration }
        );

        // Kirim token sebagai HTTP-only cookie
        res.cookie("auth_token", token, {
            httpOnly: true,
            maxAge: convertExpirationToMs(JWT_EXPIRATION) // Konversi waktu ke milidetik
        });

        res.status(200).json({
            message: "Login successful",
            token,
            user: {
                user_id: user.user_id,
                username: user.username,
                email: user.email
            }
        });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Fungsi untuk mengonversi JWT_EXPIRATION ke milidetik (untuk cookie)
const convertExpirationToMs = (expiration: string): number => {
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
};

// Fungsi menangani percobaan login gagal
const handleFailedLogin = (email: string) => {
    const attempt = loginAttempts.get(email) || { count: 0 };

    if (attempt.count >= 5) {
        return;
    }

    attempt.count += 1;
    loginAttempts.set(email, attempt);

    if (attempt.count === 1) {
        // Hanya set timer jika ini percobaan pertama
        attempt.timer = setTimeout(() => {
            loginAttempts.delete(email);
        }, 15 * 60 * 1000);
    }
};

// Fungsi mereset percobaan login setelah berhasil login
const resetLoginAttempts = (email: string) => {
    const attempt = loginAttempts.get(email);
    if (attempt?.timer) clearTimeout(attempt.timer);
    loginAttempts.delete(email);
};

// jidan was here
