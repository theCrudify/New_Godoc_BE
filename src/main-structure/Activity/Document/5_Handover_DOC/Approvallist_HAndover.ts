import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";

//handover approval
export const getHandoverApproval = async (req: Request, res: Response): Promise<void> => {
  try {
    const handoverId = Number(req.params.id);

    if (isNaN(handoverId)) {
      res.status(400).json({ error: "Invalid handover_id" });
      return;
    }

    const approvals = await prismaDB2.tr_handover_approval.findMany({
      where: {
        handover_id: handoverId,
      },
      include: {
        mst_authorization: true, // relasi ke mst_authorization (auth_id)
      },
      orderBy: {
        created_date: "desc",
      },
    });

    if (approvals.length === 0) {
      res.status(404).json({
        message: `No approval history found for handover_id ${handoverId}`,
      });
      return;
    }

    res.status(200).json({ data: approvals });
  } catch (error) {
    console.error("Error fetching approval history by handover_id:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
