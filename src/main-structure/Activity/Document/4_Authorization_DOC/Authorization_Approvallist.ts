import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";

//Approval List Authorization Document
export const getApprovalListAuthDoc = async (req: Request, res: Response): Promise<void> => {
  try {
    const proposedChangesId = Number(req.params.id);

    if (isNaN(proposedChangesId)) {
      res.status(400).json({ error: "Invalid authdoc_id" });
      return;
    }

    const approvals = await prismaDB2.tr_authdoc_approval.findMany({
      where: {
        authdoc_id: proposedChangesId,
      },
      include: {
        authorization: true,        // relasi ke mst_authorization (auth_id)
      },
      orderBy: {
        created_date: "desc",
      },
    });

    if (approvals.length === 0) {
      res.status(404).json({
        message: `No approval history found for authdoc_id ${proposedChangesId}`,
      });
      return;
    }

    res.status(200).json({ data: approvals });
  } catch (error) {
    console.error("Error fetching approval history by authdoc_id:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
