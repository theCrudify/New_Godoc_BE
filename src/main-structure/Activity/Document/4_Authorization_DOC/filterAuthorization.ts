import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";

//untuk keperluan pemilihan OTP Kode di handover
export const getAuthDocByAuthId = async (req: Request, res: Response): Promise<void> => {
  try {
    const authId = Number(req.params.id);

    if (isNaN(authId)) {
      res.status(400).json({ error: "Invalid auth_id parameter" });
      return;
    }

    // Step 1: Ambil semua authdoc_id dari tr_handover
    const handoverDocs = await prismaDB2.tr_handover.findMany({
      where: {
        authdoc_id: {
          not: null,
        },
      },
      select: {
        authdoc_id: true,
      },
    });

    const excludedIds = handoverDocs
      .map((item) => item.authdoc_id)
      .filter((id): id is number => id !== null);

    // Step 2: Ambil dokumen tr_authorization_doc dengan filter tambahan
    const result = await prismaDB2.tr_authorization_doc.findMany({
      where: {
        auth_id: authId,
        progress: '100%',
        status: 'done',
        id: {
          notIn: excludedIds,
        },
      },
      include: {
        proposedChange: true,
      },
      orderBy: {
        created_date: 'desc',
      },
    });

    if (result.length === 0) {
      res.status(404).json({ message: `No documents found for auth_id ${authId} with progress 100% and status done` });
      return;
    }

    res.status(200).json({ data: result });
  } catch (error) {
    console.error("Error retrieving filtered authdoc:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
