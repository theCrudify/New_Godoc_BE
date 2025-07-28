import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";
import { markHandoverAsFinished } from "./EmailRatingReminder";

/**
 * Endpoint to mark a handover as finished and trigger rating reminders
 */
//intinya menandakan handover sebagai selesai dan mengirimkan pengingat rating pada kolom is_finished
export const finishHandover = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const handoverId = parseInt(id, 10);
    const { updated_by } = req.body;

    if (isNaN(handoverId)) {
      console.warn("❌ Invalid ID format:", id);
      res.status(400).json({
        error: "Validation Error",
        details: "ID must be a valid number"
      });
      return;
    }

    if (!updated_by) {
      console.warn("❌ Missing updated_by in request body");
      res.status(400).json({
        error: "Validation Error",
        details: "updated_by is required in request body"
      });
      return;
    }

    console.log(`🔍 Processing request to finish handover with ID: ${handoverId}`);

    // Check if handover exists and is not already finished
    const existingHandover = await prismaDB2.tr_handover.findUnique({
      where: { id: handoverId },
      select: {
        id: true,
        is_finished: true,
        status: true
      }
    });

    if (!existingHandover) {
      console.warn(`❌ No handover found with ID: ${handoverId}`);
      res.status(404).json({
        error: "Not Found",
        details: `Handover with ID ${handoverId} not found`
      });
      return;
    }

    if (existingHandover.is_finished) {
      console.log(`⚠️ Handover with ID ${handoverId} is already marked as finished`);
      res.status(200).json({
        message: "Handover already marked as finished",
        data: { id: handoverId, is_finished: true }
      });
      return;
    }

    // Only allow finishing handovers with 'approved' or 'done' status
    if (existingHandover.status !== 'approved' && existingHandover.status !== 'done') {
      console.warn(`❌ Cannot finish handover in '${existingHandover.status}' status`);
      res.status(400).json({
        error: "Invalid Operation",
        details: "Only handovers with 'approved' or 'done' status can be marked as finished"
      });
      return;
    }

    // Mark handover as finished using the service function
    // This will trigger initial rating reminders
    const success = await markHandoverAsFinished(handoverId, updated_by);

    if (!success) {
      console.error(`❌ Failed to mark handover ${handoverId} as finished`);
      res.status(500).json({
        error: "Operation Failed",
        details: "Failed to mark handover as finished"
      });
      return;
    }

    console.log(`✅ Successfully marked handover ${handoverId} as finished`);

    // Get updated handover data
    const updatedHandover = await prismaDB2.tr_handover.findUnique({
      where: { id: handoverId },
      include: {
        tr_proposed_changes: {
          select: {
            project_name: true
          }
        }
      }
    });

    res.status(200).json({
      message: "Handover marked as finished and rating reminders sent",
      data: updatedHandover
    });

  } catch (error) {
    console.error("❌ Error finishing handover:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
    console.log("🔌 Database connection closed");
  }
};


