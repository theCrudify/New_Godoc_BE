import { Request, Response, NextFunction } from "express";

export const validateUserInput = (req: Request, res: Response, next: NextFunction): void => {
  const { username, email, password } = req.body;
  const errors: { field: string; message: string }[] = [];

  // Validasi username (hanya boleh huruf dan angka, min 3 karakter)
  if (!username || !/^[a-zA-Z0-9]{3,}$/.test(username)) {
    errors.push({ field: "username", message: "Username harus alphanumeric dan minimal 3 karakter" });
  }

  // Validasi email (format email harus valid)
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({ field: "email", message: "Email tidak valid" });
  }

  // Validasi password (minimal 8 karakter, harus ada huruf & angka)
  if (!password || password.length < 8 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password)) {
    errors.push({ field: "password", message: "Password minimal 8 karakter dan harus mengandung huruf serta angka" });
  }

  if (errors.length > 0) {
    res.status(400).json({ errors });
    return; // Tambahkan return agar middleware berhenti di sini
  }

  return next(); // TypeScript sekarang menganggap middleware ini valid
};


//jidan was here