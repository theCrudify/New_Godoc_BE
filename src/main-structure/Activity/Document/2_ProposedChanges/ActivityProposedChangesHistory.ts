import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";

// Function to get approval history by proposed_changes_id
// This function retrieves the approval history for a specific proposed changes ID
// It uses the Prisma client to query the database and return the results
export const GethistoryProposedChanges = async (req: Request, res: Response): Promise<void> => {
    try {
        const proposedChangesId = Number(req.params.id);

        if (isNaN(proposedChangesId)) {
            res.status(400).json({ error: "Invalid proposed_changes_id" });
            return;
        }

        const histories = await prismaDB2.tr_proposed_changes_history.findMany({
            where: {
                proposed_changes_id: proposedChangesId,
            },
            include: {
                proposedChange: true, // kalau mau relasi juga ditampilkan
            },
            orderBy: {
                created_date: "desc",
            },
        });

        if (histories.length === 0) {
            res.status(404).json({ message: `No history found for proposed_changes_id ${proposedChangesId}` });
            return;
        }

        res.status(200).json({ data: histories });
    } catch (error) {
        console.error("Error fetching histories by proposed_changes_id:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


// Function to get a specific proposed changes history by ID
// This function retrieves a specific proposed changes history by its ID
export const getProposedChangesHistoryById = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        const development = await prismaDB2.tr_proposed_changes_history.findUnique({
            where: {
                id: id,
            },
        });

        if (!development) {
            res.status(404).json({ error: "Development not found" });
            return;
        }

        res.status(200).json({ data: development });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


// Function to get all proposed changes history
// This function retrieves all proposed changes history
export const getAllProposedChangesHistory = async (req: Request, res: Response) => {
    try {
        const histories = await prismaDB2.tr_proposed_changes_history.findMany({
            include: {
                proposedChange: true, // Menyertakan relasi ke tr_proposed_changes
            },
            orderBy: {
                created_date: 'desc', // Optional: urutkan berdasarkan tanggal dibuat
            }
        });

        res.status(200).json(histories);
    } catch (error) {
        console.error('Error fetching proposed changes history:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};