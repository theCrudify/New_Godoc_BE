import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";

// Import necessary modules
import { getStatusText, sendEmail, getGenderTitle, getGreeting } from "../../Email/EmailServiceEnvironment/EmailServiceExport";
import { format } from "date-fns";
import { id } from "date-fns/locale/id";

//update authorization document
export const updateAuthDocById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const authDocId = parseInt(id, 10);

        if (isNaN(authDocId)) {
            console.warn("❌ Invalid ID format:", id);
            res.status(400).json({
                error: "Validation Error",
                details: "ID must be a valid number"
            });
            return;
        }

        console.log(`🔄 Updating authorization document with ID: ${authDocId}`);

        // Dapatkan data yang akan diupdate dari request body
        const updateData = req.body;

        // Cek dulu apakah document dengan ID tersebut ada
        const existingDoc = await prismaDB2.tr_authorization_doc.findUnique({
            where: { id: authDocId },
            include: {
                proposedChange: {
                    select: {
                        id: true,
                        project_name: true
                    }
                },
                authorization: {
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
            console.warn(`❌ No authorization document found with ID: ${authDocId}`);
            res.status(404).json({
                error: "Not Found",
                details: `Authorization document with ID ${authDocId} not found`
            });
            return;
        }

        // Simpan auth_id untuk membuat history nantinya
        const auth_id = updateData.auth_id ?? existingDoc.auth_id;
        const created_by = updateData.created_by ?? existingDoc.created_by;

        if (!auth_id) {
            console.warn(`❌ Missing auth_id for document ID: ${authDocId}`);
            res.status(400).json({
                error: "Validation Error",
                details: "auth_id is required for creating history"
            });
            return;
        }

        // Tentukan status dokumen - jika tidak ada dalam request, selalu gunakan "updated"
        const documentStatus = updateData.status || "updated";

        // Prepare update data object
        const updateDataObj = {
            // Update fields sesuai dengan model database
            doc_number: updateData.doc_number ?? existingDoc.doc_number,
            implementation_date: updateData.implementation_date ? new Date(updateData.implementation_date) : existingDoc.implementation_date,
            evaluation: updateData.evaluation ?? existingDoc.evaluation,
            description: updateData.description ?? existingDoc.description,
            conclution: updateData.conclution ?? existingDoc.conclution,
            concept: updateData.concept ?? existingDoc.concept,
            standart: updateData.standart ?? existingDoc.standart,
            method: updateData.method ?? existingDoc.method,
            status: documentStatus, // Gunakan status yang sudah ditentukan
            progress: updateData.progress ?? existingDoc.progress,
            auth_id: auth_id,
            plant_id: updateData.plant_id ?? existingDoc.plant_id,
            department_id: updateData.department_id ?? existingDoc.department_id,
            section_department_id: updateData.section_department_id ?? existingDoc.section_department_id,
            updated_at: new Date() // Set updated timestamp
        };

        console.log(`💾 Updating document with data:`, JSON.stringify(updateDataObj));

        // Lakukan update pada document
        const updatedAuthDoc = await prismaDB2.tr_authorization_doc.update({
            where: { id: authDocId },
            data: updateDataObj,
            include: {
                proposedChange: {
                    select: {
                        id: true,
                        project_name: true
                    }
                },
                authdocMembers: {
                    where: {
                        is_deleted: false
                    },
                    select: {
                        id: true,
                        employee_code: true,
                        employee_name: true,
                        status: true,
                        created_date: true
                    }
                },
                authorization: {
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

        // Jika ada member yang perlu diupdate
        if (updateData.members && Array.isArray(updateData.members)) {
            console.log(`👥 Processing ${updateData.members.length} members...`);

            // Update existing members atau tambahkan baru
            for (const member of updateData.members) {
                if (member.id) {
                    // Update existing member
                    await prismaDB2.tr_authdoc_member.update({
                        where: { id: member.id },
                        data: {
                            employee_code: member.employee_code,
                            employee_name: member.employee_name,
                            status: member.status ?? 'ACTIVE',
                            // Tidak perlu update created_date untuk member yang sudah ada
                        }
                    });
                    console.log(`✅ Updated existing member: ${member.id}`);
                } else {
                    // Tambah member baru
                    await prismaDB2.tr_authdoc_member.create({
                        data: {
                            authdoc_id: authDocId, // Sesuai dengan nama field di model
                            employee_code: member.employee_code,
                            employee_name: member.employee_name,
                            status: member.status ?? 'ACTIVE',
                            created_date: new Date(),
                            is_deleted: false // Default value for new members
                        }
                    });
                    console.log(`➕ Added new member: ${member.employee_name}`);
                }
            }

            // Jika ada member yang perlu dihapus (soft delete)
            if (updateData.deleted_member_ids && Array.isArray(updateData.deleted_member_ids)) {
                console.log(`🗑️ Soft deleting ${updateData.deleted_member_ids.length} members...`);

                for (const memberId of updateData.deleted_member_ids) {
                    await prismaDB2.tr_authdoc_member.update({
                        where: { id: memberId },
                        data: {
                            is_deleted: true
                        }
                    });
                    console.log(`❌ Soft deleted member: ${memberId}`);
                }
            }
        }

        // Gunakan status yang sama untuk history
        const status = documentStatus;
        const note = updateData.note || "";

        console.log(`📝 Creating history record with status: ${status}`);
        console.log(`📄 History parameters:`, {
            authDocId,
            auth_id,
            created_by: created_by || 'system',
            status,
            note
        });

        try {
            await createAuthHistory(
                authDocId,
                auth_id,
                created_by || 'system',
                status,
                note
            );
            console.log(`✅ History record created successfully`);
        } catch (historyError) {
            console.error("❌ Error creating history record:", historyError);

            // Jika gagal, coba buat dengan direct insert sebagai fallback
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
                        description = `${employeeName} has updated Authorization Document`;
                        break;
                    case "submitted":
                        description = `${employeeName} was upload Authorization Document`;
                        break;
                    case "not_approved":
                        description = `${employeeName} has not approved the Authorization Document`;
                        break;
                    case "rejected":
                        description = `${employeeName} has rejected the Authorization Document`;
                        break;
                    case "approved":
                        description = `${employeeName} has approved the Authorization Document`;
                        break;
                    default:
                        description = `${employeeName} has changed Authorization Document status to ${status}`;
                }

                // Default note if empty
                let defaultNote = "";
                switch (status) {
                    case "submitted":
                        defaultNote = "This authorization document has been submitted.";
                        break;
                    case "updated":
                        defaultNote = "This authorization document has been updated.";
                        break;
                    case "not_approved":
                        defaultNote = "This authorization document has not been approved.";
                        break;
                    case "rejected":
                        defaultNote = "This authorization document has been rejected.";
                        break;
                    case "approved":
                        defaultNote = "This authorization document has been approved.";
                        break;
                    default:
                        defaultNote = `Status has been changed to "${status}".`;
                }

                // Force insert directly
                const result = await prismaDB2.tr_authdoc_history.create({
                    data: {
                        description,
                        employee_code: created_by || 'system',
                        authdoc_id: authDocId,
                        auth_id,
                        note: note || defaultNote,
                        status,
                        created_date: new Date(),
                        created_by: created_by || 'system',
                        updated_date: new Date()
                    }
                });
                console.log("✅ Force insert of history record successful with ID:", result.id);
            } catch (forceError) {
                console.error("❌ Force insert also failed:", forceError);
            }
        }

        // Cari semua approver yang sebelumnya melakukan "not_approved" pada dokumen ini melalui tr_authdoc_approval
        let notApprovedApprovers = [];

        try {
            console.log(`🔍 Finding previous not_approved approvers...`);

            // Mencari approver dari tr_authdoc_approval dengan status 'not_approved'
            const authdocApprovals = await prismaDB2.tr_authdoc_approval.findMany({
                where: {
                    authdoc_id: authDocId,
                    status: 'not_approved'
                },
                distinct: ['auth_id'],
                orderBy: {
                    updated_date: 'desc'
                }
            });

            console.log(`📊 Found ${authdocApprovals.length} not_approved approvals in tr_authdoc_approval`);

            // Untuk setiap auth_id dari approval, dapatkan detailnya
            for (const approval of authdocApprovals) {
                if (approval.auth_id) {
                    const approver = await prismaDB2.mst_authorization.findUnique({
                        where: { id: approval.auth_id }
                    });

                    if (approver) {
                        console.log(`👤 Found approver: ${approver.employee_name}`);

                        // Mencari catatan dari tr_authdoc_history untuk approver ini
                        const approverHistory = await prismaDB2.tr_authdoc_history.findFirst({
                            where: {
                                authdoc_id: authDocId,
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

            // Jika tidak menemukan di tr_authdoc_approval, coba cari di tr_authdoc_history
            if (notApprovedApprovers.length === 0) {
                console.log(`🔍 No approvers found in tr_authdoc_approval, checking tr_authdoc_history...`);

                // Mencari approver dari tr_authdoc_history dengan status 'not_approved'
                const approvalHistories = await prismaDB2.tr_authdoc_history.findMany({
                    where: {
                        authdoc_id: authDocId,
                        status: 'not_approved'
                    },
                    distinct: ['auth_id'],
                    orderBy: {
                        created_date: 'desc'
                    }
                });

                console.log(`📊 Found ${approvalHistories.length} not_approved entries in tr_authdoc_history`);

                // Untuk setiap auth_id dalam history, dapatkan detailnya
                for (const history of approvalHistories) {
                    if (history.auth_id) {
                        const approver = await prismaDB2.mst_authorization.findUnique({
                            where: { id: history.auth_id }
                        });

                        if (approver) {
                            console.log(`👤 Found approver from history: ${approver.employee_name}`);

                            notApprovedApprovers.push({
                                ...approver,
                                note: history.note || 'No additional notes provided.'
                            });
                        }
                    }
                }
            }

            console.log(`✅ Found ${notApprovedApprovers.length} total approvers who previously marked the document as not approved`);
        } catch (error) {
            console.error("❌ Error finding not_approved approvers:", error);
            // Jika terjadi error, lanjutkan tanpa approver
            notApprovedApprovers = [];
        }

        // Jika perlu, tambahkan log untuk menunjukkan bahwa status tidak diubah
        if (notApprovedApprovers.length > 0) {
            console.log(`ℹ️ Keeping 'not_approved' status for ${notApprovedApprovers.length} approvers who previously rejected the document`);
        }

        // Get submitter information
        console.log(`🔍 Getting submitter information for auth_id: ${updatedAuthDoc.auth_id}`);

        const submitter = updatedAuthDoc?.auth_id
            ? await prismaDB2.mst_authorization.findUnique({
                where: { id: updatedAuthDoc.auth_id }
            })
            : null;

        if (submitter) {
            console.log(`👤 Found submitter: ${submitter.employee_name}, Email: ${submitter.email || 'No email'}`);
        } else {
            console.log(`⚠️ No submitter found for auth_id: ${updatedAuthDoc.auth_id}`);
        }

        // Kirim email notifikasi update
        try {
            console.log(`📧 Sending notification emails...`);
            console.log("Email Parameters:", {
                authDocId,
                updatedAuthDoc: {
                    id: updatedAuthDoc.id,
                    doc_number: updatedAuthDoc.doc_number,
                    proposedChange: updatedAuthDoc.proposedChange
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

            await sendAuthDocUpdateNotificationEmails(
                authDocId,
                updatedAuthDoc,
                notApprovedApprovers,
                submitter
            );

            console.log(`✅ Notification emails sent successfully`);
        } catch (emailError) {
            console.error("❌ Error sending notification emails:", emailError);
            // Lanjutkan dengan response sukses meskipun pengiriman email gagal
        }

        // Ambil data yang sudah diupdate untuk dikirim ke client
        const updatedDoc = await prismaDB2.tr_authorization_doc.findUnique({
            where: { id: authDocId },
            include: {
                proposedChange: {
                    select: {
                        id: true,
                        project_name: true
                    }
                },
                authdocMembers: {
                    where: {
                        is_deleted: false
                    },
                    select: {
                        id: true,
                        employee_code: true,
                        employee_name: true,
                        status: true,
                        created_date: true
                    }
                }
            }
        });

        // Extract document line code
        const docNumberParts = updatedDoc?.doc_number?.split("/") || [];
        const line_code = docNumberParts.length >= 2 ? docNumberParts[1] : null;

        // Format data dengan menambahkan line_code dan project_name (yang tidak bisa diubah)
        const docData = {
            ...updatedDoc,
            line_code: line_code,
            project_name: updatedDoc?.proposedChange?.project_name || null
        };

        console.log(`✅ Successfully updated authorization document with ID: ${authDocId}`);

        // Struktur respons dengan format {status, data: [{}]}
        const response = {
            status: "success",
            data: [docData]  // Data dalam bentuk array untuk format konsisten
        };

        res.status(200).json(response);
    } catch (error) {
        console.error("❌ Error updating authorization document:", error);
        res.status(500).json({
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    } finally {
        await prismaDB2.$disconnect();
        console.log("🔌 Database connection closed");
    }
};

// Fungsi untuk membuat history record
async function createAuthHistory(
    authdoc_id: number,
    auth_id: number,
    created_by: string,
    status: string = "submitted",
    note: string = ""
): Promise<void> {
    console.log("==== START createAuthHistory ====");
    console.log({ authdoc_id, auth_id, created_by, status, note });

    try {
        // Ambil nama karyawan
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
                description = `${employeeName} has updated Authorization Document`;
                break;
            case "submitted":
                description = `${employeeName} was upload Authorization Document`;
                break;
            case "not_approved":
                description = `${employeeName} has not approved the Authorization Document`;
                break;
            case "rejected":
                description = `${employeeName} has rejected the Authorization Document`;
                break;
            case "approved":
                description = `${employeeName} has approved the Authorization Document`;
                break;
            default:
                description = `${employeeName} has changed Authorization Document status to ${status}`;
        }
        console.log("Generated description:", description);

        // Notes
        let defaultNote = "";
        switch (status) {
            case "submitted":
                defaultNote = "This authorization document has been submitted.";
                break;
            case "updated":
                defaultNote = "This authorization document has been updated.";
                break;
            case "not_approved":
                defaultNote = "This authorization document has not been approved.";
                break;
            case "rejected":
                defaultNote = "This authorization document has been rejected.";
                break;
            case "approved":
                defaultNote = "This authorization document has been approved.";
                break;
            default:
                defaultNote = `Status has been changed to "${status}".`;
        }
        console.log("Default note:", defaultNote);

        const finalNote = note || defaultNote;

        // Sebelum melakukan create, log data yang akan diinsert
        const dataToInsert = {
            description,
            employee_code: created_by,
            authdoc_id,
            auth_id,
            note: finalNote,
            status,
            created_date: new Date(),
            created_by,
            updated_date: new Date()
        };
        console.log("Data to insert:", dataToInsert);

        // Lakukan operasi create
        const result = await prismaDB2.tr_authdoc_history.create({
            data: dataToInsert
        });
        console.log("Insert result:", result);

    } catch (error) {
        console.error("Error in createAuthHistory:", error);
        throw error;
    }
    console.log("==== END createAuthHistory ====");
}

// Function to send notification emails about auth doc updates
async function sendAuthDocUpdateNotificationEmails(
    authdocId: number,
    existingRecord: any,
    notApprovedApprovers: any[] = [],
    submitter: any
) {
    try {
        console.log("📧 Starting to send notification emails...");

        // Get the document number directly from the auth doc record
        const docNumber = existingRecord.doc_number || "NO-DOC-NUMBER";
        const projectName = existingRecord.proposedChange?.project_name || "Authorization Document";

        console.log(`📄 Document info: Number=${docNumber}, Project=${projectName}`);

        // Send email to submitter if available
        if (submitter?.email) {
            console.log(`📧 Preparing email for submitter: ${submitter.email}`);

            // Create email template for submitter
            const submitterGender = getGenderTitle(submitter.gender);
            const emailSubject = `[Go-Document] Dokumen Otentikasi Telah Diperbarui: ${projectName}`;

            const submitterTemplate = createAuthDocUpdateNotificationTemplate(
                'submitter',
                {
                    authDoc: existingRecord,
                    submitter: submitter,
                    proposedChange: existingRecord.proposedChange
                },
                docNumber,
                submitterGender
            );

            // Send email to submitter
            console.log(`📧 Sending email to submitter: ${submitter.email}`);
            await sendEmail({
                to: submitter.email,
                subject: emailSubject,
                html: submitterTemplate
            });

            console.log(`✅ Auth Doc update notification email sent to submitter: ${submitter.email}`);
        } else {
            console.log(`⚠️ No email found for submitter`);
        }

        // Send emails to all approvers who previously marked the document as "not_approved"
        if (notApprovedApprovers.length > 0) {
            console.log(`📧 Preparing to send emails to ${notApprovedApprovers.length} approvers`);
        } else {
            console.log(`⚠️ No approvers found to send emails to`);
        }

        for (const approver of notApprovedApprovers) {
            if (approver.email) {
                console.log(`📧 Preparing email for approver: ${approver.employee_name} (${approver.email})`);

                // Get approver gender title
                const approverGender = getGenderTitle(approver.gender);

                // Create email template for approver
                const emailSubject = `[Go-Document] Dokumen Otentikasi Telah Diperbarui: ${projectName}`;

                const approverTemplate = createAuthDocUpdateNotificationTemplate(
                    'approver',
                    {
                        authDoc: existingRecord,
                        submitter: submitter,
                        approver: approver,
                        proposedChange: existingRecord.proposedChange,
                        note: approver.note
                    },
                    docNumber,
                    approverGender
                );

                // Send email to approver
                console.log(`📧 Sending email to approver: ${approver.email}`);
                await sendEmail({
                    to: approver.email,
                    subject: emailSubject,
                    html: approverTemplate
                });

                console.log(`✅ Auth Doc update notification email sent to approver: ${approver.email}`);
            } else {
                console.log(`⚠️ No email found for approver: ${approver.employee_name}`);
            }
        }

        return true;
    } catch (error) {
        console.error("❌ Error sending auth doc update notification emails:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
            console.error("Error stack:", error.stack);
        }
        throw error; // Rethrow for proper error handling
    }
}

// Function to create email template for auth doc update notifications
function createAuthDocUpdateNotificationTemplate(
    recipientType: 'submitter' | 'approver',
    data: any,
    docNumber: string,
    genderTitle: string
) {
    console.log(`📧 Creating ${recipientType} email template for document: ${docNumber}`);

    const greeting = getGreeting();
    const currentDate = format(new Date(), "dd MMMM yyyy, HH:mm:ss", { locale: id });
    const projectName = data.proposedChange?.project_name || "Authorization Document";

    let bodyContent = '';
    let buttonHtml = '';
    let additionalContent = '';

    // Determine recipient name based on type
    let recipientName = '';
    let recipientGender = '';

    switch (recipientType) {
        case 'submitter':
            recipientName = data.submitter?.employee_name || '';
            recipientGender = genderTitle;
            bodyContent = `
                <p>Dengan hormat,</p>
                <p>Kami ingin memberitahukan bahwa dokumen otentikasi <strong>${projectName}</strong> - ( <strong>${docNumber}</strong>) yang Anda buat telah diperbarui dalam sistem kami.</p>
                <p>Dokumen telah direvisi dan siap untuk diproses persetujuan kembali.</p>
            `;
            buttonHtml = `
                <div class="button-container">
                    <a href="http://localhost:4200/activity-page/authorization-doc-detail/${data.authDoc.id}" class="button">Lihat Detail Dokumen</a>
                </div>
            `;
            break;
        case 'approver':
            recipientName = data.approver?.employee_name || '';
            recipientGender = genderTitle;
            bodyContent = `
                <p>Dengan hormat,</p>
                <p>Kami ingin memberitahukan bahwa dokumen otentikasi <strong>${projectName}</strong> - ( <strong>${docNumber}</strong>) yang sebelumnya Anda <strong>TIDAK SETUJUI</strong> telah diperbarui oleh submitter.</p>
                <p>Dokumen telah direvisi dan menunggu persetujuan Anda kembali.</p>
            `;

            // Add previous note if available
            if (data.note) {
                additionalContent = `
                <div class="note-container">
                    <h4 class="note-title">Catatan Anda Sebelumnya:</h4>
                    <p class="note-content">${data.note || 'Tidak ada catatan yang ditambahkan'}</p>
                </div>
                `;
            }

            buttonHtml = `
                <div class="button-container">
                    <a href="http://localhost:4200/activity-page/authdoc-approval-detail/${data.authDoc.id}" class="button">Review & Approve Dokumen</a>
                </div>
            `;
            break;
    }

    // Full greeting and formal recipient
    const fullGreeting = `${greeting}`;
    const formalRecipient = `Yth. ${recipientGender} ${recipientName},`;

    console.log(`📧 Created email template for ${recipientName}`);

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Go-Document System - Notifikasi Pembaruan</title>
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          margin: 0; 
          padding: 0;
          background-color: #f9f9f9;
        }
        .container { 
          max-width: 650px; 
          margin: 0 auto; 
          padding: 20px;
          background-color: #ffffff;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header { 
          text-align: center; 
          margin-bottom: 30px; 
          padding-bottom: 20px;
          border-bottom: 1px solid #eee;
        }
        .header h1 {
          color: #2c3e50;
          margin: 0;
          font-size: 28px;
        }
        .content { 
          margin-bottom: 30px; 
          padding: 0 10px;
        }
        .content p {
          margin-bottom: 15px;
          color: #555;
        }
        .document-title {
          background-color: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
          margin: 20px 0;
          border-left: 4px solid #007bff;
          font-weight: bold;
          font-size: 16px;
        }
        table.main-info { 
          width: 100%; 
          border-collapse: collapse; 
          margin: 25px 0;
          border-radius: 5px;
          overflow: hidden;
          box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        .main-info th, .main-info td { 
          padding: 12px 15px; 
          text-align: left; 
          border-bottom: 1px solid #eee;
        }
        .main-info th { 
          background-color: #f8f9fa; 
          color: #333;
          font-weight: 600;
          border-bottom: 2px solid #ddd;
        }
        .main-info tr:hover {
          background-color: #f5f5f5;
        }
        .note-container {
          margin: 25px 0;
          padding: 15px;
          background-color: #f8f9fa;
          border-radius: 5px;
          border-left: 4px solid #17a2b8;
        }
        .note-title {
          margin-top: 0;
          color: #17a2b8;
          font-weight: 600;
        }
        .note-content {
          margin-bottom: 0;
          color: #555;
          font-style: italic;
        }
        .status {
          display: inline-block;
          padding: 5px 10px;
          border-radius: 3px;
          font-weight: bold;
          font-size: 14px;
          background-color: #17a2b8;
          color: white;
        }
        .highlight-box {
          background-color: #e8f4fd;
          border-left: 4px solid #17a2b8;
          padding: 15px;
          margin: 20px 0;
          border-radius: 5px;
        }
        .highlight-box p {
          margin: 0;
          color: #17a2b8;
          font-weight: 500;
        }
        .button-container {
          text-align: center;
          margin: 30px 0;
        }
        .button {
          display: inline-block;
          background-color: #007bff;
          color: white;
          padding: 12px 25px;
          text-decoration: none;
          border-radius: 5px;
          font-weight: bold;
          text-align: center;
          transition: background-color 0.3s;
        }
        .button:hover {
          background-color: #0069d9;
        }
        .footer { 
          margin-top: 40px; 
          padding-top: 20px;
          border-top: 1px solid #eee;
          text-align: center;
          font-size: 14px;
          color: #6c757d;
        }
        .footer p {
          margin: 5px 0;
        }
        .signature {
          margin-top: 15px;
          font-weight: 600;
          color: #495057;
        }
        @media only screen and (max-width: 600px) {
          .container {
            width: 100%;
            padding: 10px;
          }
          .button {
            display: block;
            width: 100%;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Go-Document System</h1>
        </div>
        
        <div class="content">
          <p>${fullGreeting}</p>
          <p>${formalRecipient}</p>
          
          ${bodyContent}
          
          <div class="document-title">
            ${projectName} - ${docNumber}
          </div>
          
          <div class="highlight-box">
            <p>Dokumen ini telah diperbarui pada ${currentDate}.</p>
          </div>
          
          <table class="main-info">
            <tr>
              <th width="35%">Status</th>
              <td><span class="status">DIPERBARUI</span></td>
            </tr>
            <tr>
              <th>Pembuat</th>
              <td>${data.submitter?.employee_name || 'N/A'}</td>
            </tr>
          </table>
          
          ${additionalContent}
          
          ${buttonHtml}
          
          <p>Pesan ini dikirim otomatis oleh sistem Go-Document. Jika ada pertanyaan, silakan hubungi tim support kami.</p>
        </div>
        
        <div class="footer">
          <p>© ${new Date().getFullYear()} Go-Document System</p>
          <p class="signature">Hormat kami,<br>Tim Go-Document System</p>
        </div>
      </div>
    </body>
    </html>
  `;
}