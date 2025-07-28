import { prismaDB2 } from "../config/database";
import { Request, Response, NextFunction } from "express";

interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    [key: string]: any;
  };
  action?: string;
}

export const activityLogger = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on("finish", async () => {
    const duration = Date.now() - start;

    try {
      await prismaDB2.tr_log.create({
        data: {
          userId: req.user?.id || null,
          endpoint: req.originalUrl,
          method: req.method,
          statusCode: res.statusCode,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"] || "",
          action: req.action || null,
          metadata: {
            duration,
            query: req.query,
            body: req.body,
          },
        },
      });
    } catch (error) {
      console.error("❌ Error logging activity:", error);
    }
  });

  next();
};
