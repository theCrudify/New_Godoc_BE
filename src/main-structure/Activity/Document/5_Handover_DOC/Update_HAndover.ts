import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";
import { sendHandoverUpdateNotificationEmails} from "../../Email/EmailHandover/EmailUpdateHandover"

// Update handover document
export const updateHandover = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const handoverId = parseInt(id, 10);

        if (isNaN(handoverId)) {
            console.warn("❌ Invalid ID format:", id);
            res.status(400).json({
                error: "Validation Error",
                details: "ID must be a valid number"
            });
            return;
        }

        console.log(`🔄 Updating handover document with ID: ${handoverId}`);

        // Get update data from request body
        const updateData = req.body;

        // Check if the document with this ID exists
        const existingDoc = await prismaDB2.tr_handover.findUnique({
            where: { id: handoverId },
            include: {
                tr_proposed_changes: {
                    select: {
                        id: true,
                        project_name: true
                    }
                },
                mst_authorization_tr_handover_auth_idTomst_authorization: {
                    select: {
                        id: true,
                        employee_name: true,
                        employee_code: true,
                        email: true,
                        gender: true
                    }
                }
            }
        });

        if (!existingDoc) {
            console.warn(`❌ No handover document found with ID: ${handoverId}`);
            res.status(404).json({
                error: "Not Found",
                details: `Handover document with ID ${handoverId} not found`
            });
            return;
        }

        // Save auth_id for creating history later
        const auth_id = updateData.auth_id ?? existingDoc.auth_id;
        const created_by = updateData.created_by ?? existingDoc.created_by;

        if (!auth_id) {
            console.warn(`❌ Missing auth_id for document ID: ${handoverId}`);
            res.status(400).json({
                error: "Validation Error",
                details: "auth_id is required for creating history"
            });
            return;
        }

        // Determine document status - if not in request, always use "updated"
        const documentStatus = updateData.status || "updated";

        // Prepare update data object
        // const updateDataObj = {
        //     // Update fields according to the tr_handover model
        //     doc_number: updateData.doc_number ?? existingDoc.doc_number,
        //     auth_id: auth_id,
        //     auth_id2: updateData.auth_id2 ?? existingDoc.auth_id2,
        //     auth_id3: updateData.auth_id3 ?? existingDoc.auth_id3,
        //     auth_id4: updateData.auth_id4 ?? existingDoc.auth_id4,
        //     proposed_change_id: updateData.proposed_change_id ?? existingDoc.proposed_change_id,
        //     authdoc_id: updateData.authdoc_id ?? existingDoc.authdoc_id,
        //     plant_id: updateData.plant_id ?? existingDoc.plant_id,
        //     department_id: updateData.department_id ?? existingDoc.department_id,
        //     section_department_id: updateData.section_department_id ?? existingDoc.section_department_id,
        //     progress: updateData.progress ?? existingDoc.progress,
        //     status: documentStatus, // Use the status determined earlier
        //     material: updateData.material ?? existingDoc.material,
        //     remark: updateData.remark ?? existingDoc.remark,
        //     updated_at: new Date(),
        //     updated_by: updateData.updated_by ?? created_by
        // };

        const updateDataObj = {
            material: updateData.material ?? existingDoc.material,
            remark: updateData.remark ?? existingDoc.remark,
            status: documentStatus, // Use the status determined earlier

            updated_at: new Date(),
            updated_by: updateData.updated_by ?? created_by
        };
        

        console.log(`💾 Updating handover document with data:`, JSON.stringify(updateDataObj));

        // Perform update on the document
        const updatedHandover = await prismaDB2.tr_handover.update({
            where: { id: handoverId },
            data: updateDataObj,
            include: {
                tr_proposed_changes: {
                    select: {
                        id: true,
                        project_name: true
                    }
                },
                mst_authorization_tr_handover_auth_idTomst_authorization: {
                    select: {
                        id: true,
                        employee_name: true,
                        employee_code: true,
                        email: true,
                        gender: true
                    }
                }
            }
        });

        // Use the same status for history
        const status = documentStatus;
        const note = updateData.note || "";

        console.log(`📝 Creating history record with status: ${status}`);
        console.log(`📄 History parameters:`, {
            handoverId,
            auth_id,
            created_by: created_by || 'system',
            status,
            note
        });

        try {
            await createHandoverHistory(
                handoverId,
                auth_id,
                created_by || 'system',
                status,
                note
            );
            console.log(`✅ History record created successfully`);
        } catch (historyError) {
            console.error("❌ Error creating history record:", historyError);

            // If fails, try direct insert as fallback
            console.log("⚠️ Attempting force insert of history record");
            try {
                // Get employee name for description
                const auth = await prismaDB2.mst_authorization.findUnique({
                    where: { id: auth_id },
                    select: { employee_name: true }
                });
                const employeeName = auth?.employee_name || "Unknown";

                // Create description based on status
                let description = "";
                switch (status) {
                    case "updated":
                        description = `${employeeName} has updated Handover Document`;
                        break;
                    default:
                        description = `${employeeName} has changed Handover Document status to ${status}`;
                }

                // Default note if empty
                let defaultNote = "";
                switch (status) {
                    case "submitted":
                        defaultNote = "This handover document has been submitted.";
                        break;
                    case "updated":
                        defaultNote = "This handover document has been updated.";
                        break;
                    default:
                        defaultNote = `Status has been changed to "${status}".`;
                }

                // Force insert directly
                const result = await prismaDB2.tr_handover_history.create({
                    data: {
                        description,
                        employee_code: created_by || 'system',
                        handover_id: handoverId,
                        auth_id,
                        note: note || defaultNote,
                        status,
                        created_date: new Date(),
                        updated_date: new Date(),
                        created_by: created_by || 'system'
                    }
                });
                console.log("✅ Force insert of history record successful with ID:", result.id);
            } catch (forceError) {
                console.error("❌ Force insert also failed:", forceError);
            }
        }

        // Find all approvers who previously marked the document as "not_approved"
        let notApprovedApprovers = [];

        try {
            console.log(`🔍 Finding previous not_approved approvers...`);

            // Find approvers from tr_handover_approval with status 'not_approved'
            const handoverApprovals = await prismaDB2.tr_handover_approval.findMany({
                where: {
                    handover_id: handoverId,
                    status: 'not_approved'
                },
                distinct: ['auth_id'],
                orderBy: {
                    updated_date: 'desc'
                }
            });

            console.log(`📊 Found ${handoverApprovals.length} not_approved approvals in tr_handover_approval`);

            // For each auth_id from approval, get its details
            for (const approval of handoverApprovals) {
                if (approval.auth_id) {
                    const approver = await prismaDB2.mst_authorization.findUnique({
                        where: { id: approval.auth_id }
                    });

                    if (approver) {
                        console.log(`👤 Found approver: ${approver.employee_name}`);

                        // Find history record for this approver
                        const approverHistory = await prismaDB2.tr_handover_history.findFirst({
                            where: {
                                handover_id: handoverId,
                                auth_id: approval.auth_id,
                                status: 'not_approved'
                            },
                            orderBy: {
                                created_date: 'desc'
                            }
                        });

                        notApprovedApprovers.push({
                            ...approver,
                            note: approverHistory?.note || 'No additional notes provided.'
                        });
                    }
                }
            }

            // If none found in tr_handover_approval, check tr_handover_history
            // if (notApprovedApprovers.length === 0) {
            //     console.log(`🔍 No approvers found in tr_handover_approval, checking tr_handover_history...`);

            //     // Find approvers from tr_handover_history with status 'not_approved'
            //     const approvalHistories = await prismaDB2.tr_handover_history.findMany({
            //         where: {
            //             handover_id: handoverId,
            //             status: 'not_approved'
            //         },
            //         distinct: ['auth_id'],
            //         orderBy: {
            //             created_date: 'desc'
            //         }
            //     });

            //     console.log(`📊 Found ${approvalHistories.length} not_approved entries in tr_handover_history`);

            //     // Get details for each auth_id in history
            //     for (const history of approvalHistories) {
            //         if (history.auth_id) {
            //             const approver = await prismaDB2.mst_authorization.findUnique({
            //                 where: { id: history.auth_id }
            //             });

            //             if (approver) {
            //                 console.log(`👤 Found approver from history: ${approver.employee_name}`);

            //                 notApprovedApprovers.push({
            //                     ...approver,
            //                     note: history.note || 'No additional notes provided.'
            //                 });
            //             }
            //         }
            //     }
            // }

            console.log(`✅ Found ${notApprovedApprovers.length} total approvers who previously marked the document as not approved`);
        } catch (error) {
            console.error("❌ Error finding not_approved approvers:", error);
            // If error occurs, continue without approvers
            notApprovedApprovers = [];
        }

        // Log if needed, showing that status is not changed
        if (notApprovedApprovers.length > 0) {
            console.log(`ℹ️ Keeping 'not_approved' status for ${notApprovedApprovers.length} approvers who previously rejected the document`);
        }

        // Get submitter information
        console.log(`🔍 Getting submitter information for auth_id: ${updatedHandover.auth_id}`);

        const submitter = updatedHandover?.auth_id
            ? await prismaDB2.mst_authorization.findUnique({
                where: { id: updatedHandover.auth_id }
            })
            : null;

        if (submitter) {
            console.log(`👤 Found submitter: ${submitter.employee_name}, Email: ${submitter.email || 'No email'}`);
        } else {
            console.log(`⚠️ No submitter found for auth_id: ${updatedHandover.auth_id}`);
        }

        // Send email notification about the update
        try {
            console.log(`📧 Sending notification emails...`);
            console.log("Email Parameters:", {
                handoverId,
                updatedHandover: {
                    id: updatedHandover.id,
                    doc_number: updatedHandover.doc_number,
                    proposedChange: updatedHandover.tr_proposed_changes
                },
                notApprovedApprovers: notApprovedApprovers.map(a => ({
                    id: a.id,
                    email: a.email,
                    employee_name: a.employee_name
                })),
                submitter: submitter ? {
                    id: submitter.id,
                    email: submitter.email,
                    employee_name: submitter.employee_name
                } : null
            });

            await sendHandoverUpdateNotificationEmails(
                handoverId,
                updatedHandover,
                notApprovedApprovers,
                submitter
            );

            console.log(`✅ Notification emails sent successfully`);
        } catch (emailError) {
            console.error("❌ Error sending notification emails:", emailError);
            // Continue with success response even if email sending fails
        }

        // Get updated data to send to client
        const updatedDoc = await prismaDB2.tr_handover.findUnique({
            where: { id: handoverId },
            include: {
                tr_proposed_changes: {
                    select: {
                        id: true,
                        project_name: true
                    }
                }
            }
        });

        // Extract document line code
        const docNumberParts = updatedDoc?.doc_number?.split("/") || [];
        const line_code = docNumberParts.length >= 2 ? docNumberParts[1] : null;

        // Format data with added line_code and project_name (which can't be changed)
        const docData = {
            ...updatedDoc,
            line_code: line_code,
            project_name: updatedDoc?.tr_proposed_changes?.project_name || null
        };

        console.log(`✅ Successfully updated handover document with ID: ${handoverId}`);

        // Structure response with format {status, data: [{}]}
        const response = {
            status: "success",
            data: [docData]  // Data in array format for consistency
        };

        res.status(200).json(response);
    } catch (error) {
        console.error("❌ Error updating handover document:", error);
        res.status(500).json({
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    } finally {
        await prismaDB2.$disconnect();
        console.log("🔌 Database connection closed");
    }
};

// Function to create history record
async function createHandoverHistory(
    handover_id: number,
    auth_id: number,
    created_by: string,
    status: string = "updated",
    note: string = ""
): Promise<void> {
    console.log("==== START createHandoverHistory ====");
    console.log({ handover_id, auth_id, created_by, status, note });

    try {
        // Get employee name
        const auth = await prismaDB2.mst_authorization.findUnique({
            where: { id: auth_id },
            select: { employee_name: true }
        });
        console.log("Found auth:", auth);

        const employeeName = auth?.employee_name || "Unknown";

        // Descriptions
        let description = "";
        switch (status) {
            case "updated":
                description = `${employeeName} has updated Handover Document`;
                break;
            case "submitted":
                description = `${employeeName} was upload Handover Document`;
                break;
            default:
                description = `${employeeName} has changed Handover Document status to ${status}`;
        }
        console.log("Generated description:", description);

        // Notes
        let defaultNote = "";
        switch (status) {
            case "submitted":
                defaultNote = "This handover document has been submitted.";
                break;
            case "updated":
                defaultNote = "This handover document has been updated.";
                break;
            default:
                defaultNote = `Status has been changed to "${status}".`;
        }
        console.log("Default note:", defaultNote);

        const finalNote = note || defaultNote;

        // Before creating, log data to be inserted
        const dataToInsert = {
            description,
            employee_code: created_by,
            handover_id,
            auth_id,
            note: finalNote,
            status,
            created_date: new Date(),
            created_by,
            updated_date: new Date()
        };
        console.log("Data to insert:", dataToInsert);

        // Perform create operation
        const result = await prismaDB2.tr_handover_history.create({
            data: dataToInsert
        });
        console.log("Insert result:", result);

    } catch (error) {
        console.error("Error in createHandoverHistory:", error);
        throw error;
    }
    console.log("==== END createHandoverHistory ====");
}

