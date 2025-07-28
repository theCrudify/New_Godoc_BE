import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";

// Function to get approval history by proposed_changes_id
// This function retrieves the approval history for a specific proposed changes ID
// It uses the Prisma client to query the database and return the results
// The function is asynchronous and returns a Promise
export const GetApprovalProposedChanges = async (req: Request, res: Response): Promise<void> => {
  try {
    const proposedChangesId = Number(req.params.id);

    if (isNaN(proposedChangesId)) {
      res.status(400).json({ error: "Invalid proposed_changes_id" });
      return;
    }

    const approvals = await prismaDB2.tr_proposed_changes_approval.findMany({
      where: {
        proposed_changes_id: proposedChangesId,
      },
      include: {
        proposedChange: true,       // relasi ke tr_proposed_changes
        authorization: true,        // relasi ke mst_authorization (auth_id)
      },
      orderBy: {
        created_date: "desc",
      },
    });

    if (approvals.length === 0) {
      res.status(404).json({
        message: `No approval history found for proposed_changes_id ${proposedChangesId}`,
      });
      return;
    }

    res.status(200).json({ data: approvals });
  } catch (error) {
    console.error("Error fetching approval history by proposed_changes_id:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
