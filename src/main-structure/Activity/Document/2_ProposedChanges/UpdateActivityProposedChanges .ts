import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";
import { createProposedChangeHistory } from "./CreateActivityProposedChanges";
import { sendUpdateNotificationEmails } from "../../Email/EmailProposedChanges/Email_Update_Proposed"

//updateProposedChange
// Function to update a proposed change
// This function updates a proposed change record in the database
export const updateProposedChange = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const data = req.body;

        // Validate id parameter
        if (!id || isNaN(Number(id))) {
            res.status(400).json({
                error: "Validation Error",
                details: "Invalid ID parameter"
            });
            return;
        }

        // Check if record exists
        const existingRecord = await prismaDB2.tr_proposed_changes.findUnique({
            where: { id: Number(id) }
        });

        if (!existingRecord) {
            res.status(404).json({
                error: "Not Found",
                details: `Proposed change with ID ${id} not found`
            });
            return;
        }
        
        // Get submitter information separately
        const submitter = existingRecord?.auth_id 
            ? await prismaDB2.mst_authorization.findUnique({
                where: { id: existingRecord.auth_id }
              })
            : null;

        // Prepare update data object
        const updateData: any = {};

        // String fields
        if (data.project_name !== undefined) updateData.project_name = String(data.project_name);
        if (data.item_changes !== undefined) updateData.item_changes = String(data.item_changes);
        if (data.line_code !== undefined) updateData.line_code = String(data.line_code);
        if (data.section_code !== undefined) updateData.section_code = String(data.section_code);
        if (data.change_type !== undefined) updateData.change_type = String(data.change_type);
        if (data.description !== undefined) updateData.description = String(data.description);
        if (data.reason !== undefined) updateData.reason = String(data.reason);
        if (data.cost !== undefined) updateData.cost = String(data.cost);
        if (data.cost_text !== undefined) updateData.cost_text = String(data.cost_text);
        if (data.other_sytem !== undefined) updateData.other_sytem = String(data.other_sytem);
        if (data.progress !== undefined) updateData.progress = String(data.progress);
        if (data.created_by !== undefined) updateData.created_by = String(data.created_by);

        // Numeric fields
        if (data.document_number_id !== undefined) updateData.document_number_id = data.document_number_id !== null ? Number(data.document_number_id) : null;
        if (data.department_id !== undefined) updateData.department_id = data.department_id !== null ? Number(data.department_id) : null;
        if (data.section_department_id !== undefined) updateData.section_department_id = data.section_department_id !== null ? Number(data.section_department_id) : null;
        if (data.plant_id !== undefined) updateData.plant_id = data.plant_id !== null ? Number(data.plant_id) : null;
        if (data.auth_id !== undefined) updateData.auth_id = data.auth_id !== null ? Number(data.auth_id) : null;

        // Date fields
        if (data.planning_start !== undefined) updateData.planning_start = data.planning_start ? new Date(data.planning_start) : null;
        if (data.planning_end !== undefined) updateData.planning_end = data.planning_end ? new Date(data.planning_end) : null;
        if (data.created_date !== undefined) updateData.created_date = data.created_date ? new Date(data.created_date) : null;

        // Boolean fields - handle TinyInt type properly
        if (data.need_engineering_approval !== undefined) updateData.need_engineering_approval = data.need_engineering_approval === true;
        if (data.need_production_approval !== undefined) updateData.need_production_approval = data.need_production_approval === true;
        if (data.is_deleted !== undefined) updateData.is_deleted = data.is_deleted === true;

        // Always set status to "updated" unless specifically requested otherwise
        updateData.status = data.status || "updated";

        // Set the updated timestamp 
        updateData.updated_at = new Date();

        // Update the record
        const updatedChange = await prismaDB2.tr_proposed_changes.update({
            where: { id: Number(id) },
            data: updateData
        });

        // Create history entry for this update
        await createProposedChangeHistory(
            Number(id),
            data.auth_id,
            data.created_by,
            updateData.status // Pass the status to history
        );

        // Find all approvers who previously marked the document as "not_approved"
        // Using tr_proposed_changes_history to find approvers who rejected the document
        let notApprovedApprovers = [];
        
        try {
            // Try to find approvers from tr_proposed_changes_history based on 'not_approved' status
            const approvalHistories = await prismaDB2.tr_proposed_changes_approval.findMany({
                where: {
                    proposed_changes_id: Number(id),
                    status: 'not_approved'
                },
                distinct: ['auth_id'],
                orderBy: {
                    created_date: 'desc'
                }
            });
            
            // For each auth_id in the history, get the authorization details
            for (const history of approvalHistories) {
                if (history.auth_id) {
                    const approver = await prismaDB2.mst_authorization.findUnique({
                        where: { id: history.auth_id }
                    });
                    
                    if (approver) {
                        notApprovedApprovers.push({
                            ...approver,
                        });
                    }
                }
            }
            
            console.log(`Found ${notApprovedApprovers.length} approvers who previously marked the document as not approved`);
        } catch (error) {
            console.error("Error finding not_approved approvers:", error);
            // If there's an error, continue without approvers
            notApprovedApprovers = [];
        }
        
        // Send email notifications for the update
        try {
            await sendUpdateNotificationEmails(
                Number(id), 
                existingRecord,
                notApprovedApprovers,
                submitter
            );
        } catch (emailError) {
            console.error("Error sending notification emails:", emailError);
            // Continue with success response even if emails fail
        }

        res.status(200).json({
            message: "Proposed change updated successfully",
            data: updatedChange
        });

    } catch (error) {
        console.error("Error updating proposed change:", error);
        res.status(500).json({
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    } finally {
        await prismaDB2.$disconnect();
    }
};

//Update Dokumen Support yang 15 Biji, untuk Perubahan Status
export const updateSupportDocumentsStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { proposed_id } = req.params;
        const dataList = req.body;

        // Validasi ID parameter
        if (!proposed_id || isNaN(Number(proposed_id))) {
            res.status(400).json({
                error: "Validation Error",
                details: "Invalid proposed_id parameter"
            });
            return;
        }

        // Validasi input array
        if (!Array.isArray(dataList) || dataList.length === 0) {
            res.status(400).json({ error: "Input must be a non-empty array of documents" });
            return;
        }

        // Periksa apakah proposed_id ada
        const existingProposed = await prismaDB2.tr_proposed_changes.findUnique({
            where: { id: Number(proposed_id) }
        });

        if (!existingProposed) {
            res.status(404).json({
                error: "Not Found",
                details: `Proposed change with ID ${proposed_id} not found`
            });
            return;
        }

        // Validasi data input
        const validationErrors: string[] = [];
        const validData = dataList.filter((data, index) => {
            if (!data.id) {
                validationErrors.push(`Missing 'id' at index ${index}`);
                return false;
            }

            if (typeof data.id !== "number") {
                validationErrors.push(`Invalid 'id' at index ${index}`);
                return false;
            }

            if (data.status === undefined) {
                validationErrors.push(`Missing 'status' at index ${index}`);
                return false;
            }

            if (typeof data.status !== "boolean") {
                validationErrors.push(`'status' must be a boolean at index ${index}`);
                return false;
            }

            if (!data.updated_by) {
                validationErrors.push(`Missing 'updated_by' at index ${index}`);
                return false;
            }

            return true;
        });

        if (validationErrors.length > 0) {
            res.status(400).json({ error: "Validation Error", details: validationErrors });
            return;
        }

        // Proses update status dokumen
        const successes: any[] = [];
        const failures: { id: number, error: string }[] = [];

        // Proses transaksi dalam batch
        for (const data of validData) {
            try {
                // Update status dan informasi update
                const result = await prismaDB2.tbl_support_document.update({
                    where: {
                        id: Number(data.id),
                        proposed_id: Number(proposed_id) // Pastikan dokumen benar-benar milik proposed_id ini
                    },
                    data: {
                        status: data.status,
                        updated_by: data.updated_by,
                        updated_at: new Date()
                    }
                });

                successes.push(result);
            } catch (err) {
                console.error(`❌ Failed to update status for document ID ${data.id}`, err);
                failures.push({ id: data.id, error: err instanceof Error ? err.message : "Unknown error" });
            }
        }

        // Tanggapi dengan hasil yang sesuai
        if (failures.length === 0) {
            res.status(200).json({
                message: `${successes.length} support documents status updated successfully`,
                data: successes
            });
        } else {
            res.status(207).json({
                message: `${successes.length} documents updated, ${failures.length} failed`,
                successes,
                failures
            });
        }

    } catch (error) {
        console.error("❌ General ERROR:", error);
        res.status(500).json({
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    } finally {
        await prismaDB2.$disconnect();
    }
};