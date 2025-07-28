import jwt, { JwtPayload, Secret, SignOptions } from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET as Secret;
const JWT_EXPIRATION = process.env.JWT_EXPIRATION as SignOptions["expiresIn"];

if (!JWT_SECRET) {
    throw new Error("❌ JWT_SECRET is not defined in environment variables!");
}

if (!JWT_EXPIRATION) {
    throw new Error("❌ JWT_EXPIRATION is not defined in environment variables!");
}

export const generateToken = (userId: number): string => {
    const options: SignOptions = { expiresIn: JWT_EXPIRATION };

    return jwt.sign({ userId }, JWT_SECRET, options);
};

export const verifyToken = (token: string): JwtPayload | string => {
    return jwt.verify(token, JWT_SECRET);
};
