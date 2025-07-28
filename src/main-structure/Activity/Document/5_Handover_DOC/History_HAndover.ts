import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";

//history handover
export const getHistoryHandover = async (req: Request, res: Response): Promise<void> => {
    try {
        const handoverId = Number(req.params.id); // karena sekarang relasinya ke tr_handover (handover_id)

        if (isNaN(handoverId)) {
            res.status(400).json({ error: "Invalid handover_id" });
            return;
        }

        const histories = await prismaDB2.tr_handover_history.findMany({
            where: {
                handover_id: handoverId,
            },
            include: {
                mst_authorization: true, // Jika ingin informasi authorization (opsional)
                tr_handover: {
                    select: {
                        doc_number: true,
                        progress: true,
                        status: true,
                        created_by: true,
                    }
                }
            },
            orderBy: {
                created_date: "desc",
            },
        });

        if (histories.length === 0) {
            res.status(404).json({ message: `No history found for handover_id ${handoverId}` });
            return;
        }

        res.status(200).json({ data: histories });
    } catch (error) {
        console.error("Error fetching handover history by handover_id:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

