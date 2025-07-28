import { PrismaClient as PrismaClientDB1 } from "../../prisma/generated/db1";
import { PrismaClient as PrismaClientDB2 } from "../../prisma/generated/db2";
import * as dotenv from "dotenv";

dotenv.config();

const isDev = process.env.NODE_ENV === 'development';

const prismaDB1 = new PrismaClientDB1({
  datasources: { db: { url: process.env.DATABASE_URL_1 } },
  log: isDev ? ['error', 'warn'] : ['error']
});

const prismaDB2 = new PrismaClientDB2({
  datasources: { db: { url: process.env.DATABASE_URL_2 } },
  log: isDev ? ['error', 'warn'] : ['error']
});

export { prismaDB1, prismaDB2 };