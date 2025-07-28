import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";


//Approval List Authorization Document for History
// This function retrieves the approval history for a specific authorization document ID
export const getHistoryAuthDoc = async (req: Request, res: Response): Promise<void> => {
    try {
        const proposedChangesId = Number(req.params.id);

        if (isNaN(proposedChangesId)) {
            res.status(400).json({ error: "Invalid authdoc_id" });
            return;
        }

        const histories = await prismaDB2.tr_authdoc_history.findMany({
            where: {
                authdoc_id: proposedChangesId,
            },
            // include: {
            //     proposedChange: true, // kalau mau relasi juga ditampilkan
            // },
            orderBy: {
                created_date: "desc",
            },
        });

        if (histories.length === 0) {
            res.status(404).json({ message: `No history found for authdoc_id ${proposedChangesId}` });
            return;
        }

        res.status(200).json({ data: histories });
    } catch (error) {
        console.error("Error fetching histories by authdoc_id:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


