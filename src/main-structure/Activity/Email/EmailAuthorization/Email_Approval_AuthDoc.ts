import { prismaDB2 } from "../../../../config/database";
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { getStatusText, sendEmail, getDocumentNumber, getGenderTitle, getGreeting } from "../EmailServiceEnvironment/EmailServiceExport";
// Pastikan tipe enum ini diimpor atau tersedia
export enum email_tracking_authdoc_recipient_type {
  submitter = 'submitter',
  approver = 'approver',
  next_approver = 'next_approver'
}

export enum email_tracking_authdoc_status {
  approved = 'approved',
  not_approved = 'not_approved',
  rejected = 'rejected'
  // Tambahkan status lain jika ada di skema Anda, misal 'on_going'
}

// Definisi tipe untuk parameter email
interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  cc?: string;
}

/**
 * Fungsi untuk menghasilkan hash dari string
 * Digunakan untuk membuat identifier unik dari catatan approval
 */
function hashString(str: string): string {
  if (!str) return 'no-note';

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Ambil 8 karakter hex saja, pastikan cukup unik untuk note hash
  return Math.abs(hash).toString(16).padStart(8, '0').substring(0, 8);
}

const getEmailData = async (authorizationDocId: number, authId: number) => {
  try {
    // Step 1: Ambil authorization document berdasarkan ID
    const authorizationDoc = await prismaDB2.tr_authorization_doc.findUnique({
      where: { id: authorizationDocId },
      include: {
        authdocApprovals: {
          include: {
            authorization: true
          },
          orderBy: {
            step: 'asc'
          }
        }
      } 
    });

    if (!authorizationDoc) {
      throw new Error(`Authorization document with ID ${authorizationDocId} not found`);
    }

    // Step 2: Ambil proposed change berdasarkan relasi
    const proposedChange = await prismaDB2.tr_proposed_changes.findUnique({
      where: { id: authorizationDoc.proposed_change_id ?? undefined }
    });

    if (!proposedChange) {
      throw new Error(`Proposed change with ID ${authorizationDoc.proposed_change_id} not found`);
    }

    // Step 3: Ambil info submitter
    const submitter = await prismaDB2.mst_authorization.findUnique({
      where: { id: authorizationDoc.auth_id || 0 }
    });

    // Step 4: Cari current dan next approver
    const currentApprover = authorizationDoc.authdocApprovals.find(a => a.auth_id === authId);
    if (!currentApprover) {
      throw new Error(`Approver with auth ID ${authId} not found for this document`);
    }

    const currentStep = currentApprover.step || 0;
    const nextApprover = authorizationDoc.authdocApprovals.find(a => a.step === currentStep + 1);
    const isLastApprover = !nextApprover;

    return {
      proposedChange,
      authorizationDoc,
      submitter,
      currentApprover,
      nextApprover,
      isLastApprover
    };
  } catch (error) {
    console.error("Error getting email data:", error);
    throw error;
  }
};



/**
 * Fungsi untuk memeriksa apakah email sudah pernah dicatat (dan mungkin berhasil dikirim)
 * Menggunakan tabel email_tracking_authdoc
 */
const checkEmailLog = async (
  tr_authorization_doc: number,
  recipientEmail: string,
  recipientType: email_tracking_authdoc_recipient_type,
  status: email_tracking_authdoc_status,
  noteHash: string
): Promise<boolean> => {
  try {
    const existingLog = await prismaDB2.email_tracking_authdoc.findFirst({
      where: {
        authorization_doc_id: tr_authorization_doc,
        recipient_email: recipientEmail,
        recipient_type: recipientType,
        status: status,
        note_hash: noteHash,
        // Anda mungkin ingin menambahkan kondisi is_success: true jika hanya ingin
        // mencegah pengiriman ulang email yang SUDAH BERHASIL terkirim.
        // Jika ingin mencegah percobaan pengiriman ganda meski yang pertama gagal,
        // kondisi is_success tidak perlu ditambahkan di sini.
      },
      select: { id: true } // Hanya perlu cek keberadaan
    });
    const found = !!existingLog;
    console.log(`[checkEmailLog] Found existing log for ${recipientEmail} (${recipientType}, ${status}, hash:${noteHash}): ${found}`);
    return found;
  } catch (error) {
    console.error(`[checkEmailLog] Error checking email log for ${recipientEmail}:`, error);
    // Asumsikan belum ada jika terjadi error untuk mencegah email tidak terkirim
    // Pertimbangkan penanganan error yang lebih baik
    return false;
  }
};

/**
 * Fungsi untuk membuat entri log baru di tabel email_tracking_authdoc
 * SEBELUM mencoba mengirim email.
 */
const createEmailLogEntry = async (
  tr_authorization_doc: number,
  recipientEmail: string,
  recipientType: email_tracking_authdoc_recipient_type,
  status: email_tracking_authdoc_status,
  note: string = ''
): Promise<number | null> => {
  const noteHash = hashString(note);
  const noteText = note || null; // Simpan null jika note kosong

  try {
    // Coba create, tangkap error jika constraint violation
    const newLog = await prismaDB2.email_tracking_authdoc.create({
      data: {
        authorization_doc_id: tr_authorization_doc,
        recipient_email: recipientEmail,
        recipient_type: recipientType,
        status: status,
        note_hash: noteHash,
        note_text: noteText,
        is_success: false,
        retry_count: 0,
      },
      select: { id: true }
    });
    console.log(`[createEmailLogEntry] Created log entry ID: ${newLog.id}`);
    return newLog.id;
  } catch (error) {
    // Jika error adalah unique constraint violation
    if ((error as any)?.code === 'P2002') {
      console.log(`[createEmailLogEntry] Entry already exists for ${recipientEmail}, retrieving existing ID`);
      // Dapatkan ID yang sudah ada
      const existingLog = await prismaDB2.email_tracking_authdoc.findFirst({
        where: {
          authorization_doc_id: tr_authorization_doc,
          recipient_email: recipientEmail,
          recipient_type: recipientType,
          status: status,
          note_hash: noteHash
        },
        select: { id: true }
      });
      if (existingLog) return existingLog.id;
    }
    console.error(`[createEmailLogEntry] Error:`, error);
    return null;
  }
};

/**
 * Fungsi untuk memperbarui status entri log email setelah percobaan pengiriman.
 */
const updateEmailLogStatus = async (
  logId: number,
  success: boolean,
  messageId: string | null = null,
  retryAttempt: boolean = false // Tandai jika ini adalah hasil dari proses retry
) => {
  try {
    const dataToUpdate: any = {
      is_success: success,
      sent_at: success ? new Date() : null,
      message_id: success ? (messageId || null) : null,

    };

    // Hapus properti undefined agar tidak diupdate oleh Prisma
    Object.keys(dataToUpdate).forEach(key => dataToUpdate[key] === undefined && delete dataToUpdate[key]);

    await prismaDB2.email_tracking_authdoc.update({
      where: { id: logId },
      data: dataToUpdate
    });
    console.log(`[updateEmailLogStatus] Updated log entry ID: ${logId}, Success: ${success}`);
  } catch (error) {
    console.error(`[updateEmailLogStatus] Error updating log entry ID: ${logId}:`, error);
  }
};


/**
 * Fungsi untuk mengirim email approval (Versi Modifikasi dengan DB Logging)
 * @param tr_authorization_doc ID dari proposed change
 * @param authId ID dari authorizer
 * @param status Status approval (approved, not_approved, rejected)
 * @param currentStep Step saat ini dalam alur approval
 * @param currentNote Catatan dari request body saat ini
 */
export const sendApprovalEmails = async (
  tr_authorization_doc: number,
  authId: number,
  // Pastikan tipe status sesuai dengan enum Prisma
  status: email_tracking_authdoc_status,
  currentStep: number,
  currentNote: string = ''
) => {
  console.log(`📧 [START] sendApprovalEmails DB Logging Version: tr_authorization_doc=${tr_authorization_doc}, authId=${authId}, status=${status}, currentStep=${currentStep}, note="${currentNote || 'tidak ada'}"`);
  let overallSuccess = true; // Lacak keberhasilan pengiriman semua email

  try {
    const data = await getEmailData(tr_authorization_doc, authId);
    // const docNumber = await getDocumentNumber(tr_authorization_doc);
    const docNumber = data.authorizationDoc.doc_number || 'No Document Number';

    const note = currentNote || '';
    const noteHash = hashString(note);
    console.log(`📝 Using note: "${note.substring(0, 50)}${note.length > 50 ? '...' : ''}", Hash: ${noteHash}`);

    // --- Informasi Penerima ---
    const submitterEmail = data.submitter?.email || '';
    const submitterGender = getGenderTitle(data.submitter?.gender);
    const submitterRecipientType = email_tracking_authdoc_recipient_type.submitter;

    const currentApproverEmail = data.currentApprover.authorization?.email || '';
    const currentApproverGender = getGenderTitle(data.currentApprover.authorization?.gender);
    const currentApproverName = data.currentApprover.authorization?.employee_name || '';
    const approverRecipientType = email_tracking_authdoc_recipient_type.approver;

    const nextApprover = data.nextApprover;
    const nextApproverEmail = nextApprover?.authorization?.email || '';
    const nextApproverGender = getGenderTitle(nextApprover?.authorization?.gender);
    const nextApproverRecipientType = email_tracking_authdoc_recipient_type.next_approver;

    console.log('============= EMAIL ADDRESSES SUMMARY =============');
    console.log(`1. EMAIL SUBMITTER = ${submitterEmail || 'NO_EMAIL_AVAILABLE'}`);
    console.log(`2. EMAIL APPROVER  = ${currentApproverEmail || 'NO_EMAIL_AVAILABLE'}`);
    console.log(`3. EMAIL NEXT APPROVER = ${nextApproverEmail || 'NO_EMAIL_AVAILABLE'}`);
    console.log(`4. PROJECT NAME = ${data.proposedChange.project_name}`);
    console.log(`5. DOCUMENT NUMBER = ${docNumber}`);
    console.log(`6. NOTE HASH = ${noteHash}`);
    console.log('==================================================');


    // --- Proses Pengiriman Email (Satu per Satu dengan Logging DB) ---

    // 1. Email ke Submitter
    if (submitterEmail) {
      const alreadyLogged = await checkEmailLog(tr_authorization_doc, submitterEmail, submitterRecipientType, status, noteHash);
      if (!alreadyLogged) {
        const logId = await createEmailLogEntry(tr_authorization_doc, submitterEmail, submitterRecipientType, status, note);
        if (logId) {
          try {
            let emailSubject = `[Go-Document] Status Dokumen: ${data.proposedChange.project_name} - ${status.toUpperCase()}`;
             if (data.isLastApprover && status === 'approved') {
               emailSubject = `[Go-Document] Dokumen Telah Selesai Disetujui: ${data.proposedChange.project_name}`;
             } else if (status === 'not_approved') {
               emailSubject = `[Go-Document] Dokumen Perlu Revisi: ${data.proposedChange.project_name}`;
             }

            const submitterTemplate = createEmailTemplate('submitter', data, status, docNumber, submitterGender, '', '', note);
            console.log(`📧 Attempting to send email to SUBMITTER: ${submitterEmail} (Log ID: ${logId})`);
            const result = await sendEmail({ to: submitterEmail, subject: emailSubject, html: submitterTemplate });
            console.log(`✅ EMAIL SUBMITTER SENT: ${submitterEmail}, messageId: ${result.messageId || 'unknown'}`);
            await updateEmailLogStatus(logId, true, result.messageId);
          } catch (error) {
            console.error(`❌ EMAIL SUBMITTER FAILED: ${submitterEmail}`, error);
            await updateEmailLogStatus(logId, false);
            overallSuccess = false;
          }
        } else {
           console.error(`⚠️ Failed to create log entry for SUBMITTER: ${submitterEmail}, skipping send.`);
           overallSuccess = false;
        }
      } else {
        console.log(`⚠️ EMAIL SUBMITTER ALREADY LOGGED/SENT: Skipping ${submitterEmail} (${status}, hash:${noteHash})`);
      }
    } else {
      console.log(`⚠️ EMAIL SUBMITTER NOT SENT: No email address available`);
    }


    // 2. Email ke Current Approver
    if (currentApproverEmail) {
      const alreadyLogged = await checkEmailLog(tr_authorization_doc, currentApproverEmail, approverRecipientType, status, noteHash);
       if (!alreadyLogged) {
         const logId = await createEmailLogEntry(tr_authorization_doc, currentApproverEmail, approverRecipientType, status, note);
         if (logId) {
            try {
               let emailSubject = `[Go-Document] Anda Telah memilih ${getStatusText(status)} Dokumen: ${data.proposedChange.project_name}`;
               if (status === 'not_approved') {
                  emailSubject = `[Go-Document] Anda Telah TIDAK MENYETUJUI Dokumen: ${data.proposedChange.project_name}`;
               } else if (data.isLastApprover && status === 'approved') {
                emailSubject = `[Go-Document] Anda Telah Menetapkan Status ${getStatusText(status)} untuk Dokumen: ${data.proposedChange.project_name}`;
              }

               const approverTemplate = createEmailTemplate('approver', data, status, docNumber, currentApproverGender, '', '', note);
               console.log(`📧 Attempting to send email to APPROVER: ${currentApproverEmail} (Log ID: ${logId})`);
               const result = await sendEmail({ to: currentApproverEmail, subject: emailSubject, html: approverTemplate });
               console.log(`✅ EMAIL APPROVER SENT: ${currentApproverEmail}, messageId: ${result.messageId || 'unknown'}`);
               await updateEmailLogStatus(logId, true, result.messageId);
            } catch (error) {
               console.error(`❌ EMAIL APPROVER FAILED: ${currentApproverEmail}`, error);
               await updateEmailLogStatus(logId, false);
               overallSuccess = false;
            }
         } else {
           console.error(`⚠️ Failed to create log entry for APPROVER: ${currentApproverEmail}, skipping send.`);
           overallSuccess = false;
         }
       } else {
         console.log(`⚠️ EMAIL APPROVER ALREADY LOGGED/SENT: Skipping ${currentApproverEmail} (${status}, hash:${noteHash})`);
       }
    } else {
      console.log(`⚠️ EMAIL APPROVER NOT SENT: No email address available`);
    }


    // 3. Email ke Next Approver (hanya jika status 'approved' dan ada next approver)
    if (status === email_tracking_authdoc_status.approved && nextApprover && nextApproverEmail) {
       const alreadyLogged = await checkEmailLog(tr_authorization_doc, nextApproverEmail, nextApproverRecipientType, status, noteHash); // Note hash disertakan untuk konsistensi
       if (!alreadyLogged) {
         const logId = await createEmailLogEntry(tr_authorization_doc, nextApproverEmail, nextApproverRecipientType, status, note);
         if (logId) {
            try {
               const emailSubject = `[Go-Document] Dokumen Menunggu Persetujuan Anda: ${data.proposedChange.project_name}`;
               const nextApproverTemplate = createEmailTemplate('next_approver', data, status, docNumber, nextApproverGender, currentApproverGender, currentApproverName, note);
               console.log(`📧 Attempting to send email to NEXT APPROVER: ${nextApproverEmail} (Log ID: ${logId})`);
               const result = await sendEmail({ to: nextApproverEmail, subject: emailSubject, html: nextApproverTemplate });
               console.log(`✅ EMAIL NEXT APPROVER SENT: ${nextApproverEmail}, messageId: ${result.messageId || 'unknown'}`);
               await updateEmailLogStatus(logId, true, result.messageId);
            } catch (error) {
               console.error(`❌ EMAIL NEXT APPROVER FAILED: ${nextApproverEmail}`, error);
               await updateEmailLogStatus(logId, false);
               overallSuccess = false;
            }
         } else {
           console.error(`⚠️ Failed to create log entry for NEXT APPROVER: ${nextApproverEmail}, skipping send.`);
           overallSuccess = false;
         }
       } else {
         console.log(`⚠️ EMAIL NEXT APPROVER ALREADY LOGGED/SENT: Skipping ${nextApproverEmail} (${status}, hash:${noteHash})`);
       }
    } else {
       if (status !== email_tracking_authdoc_status.approved) {
           console.log(`ℹ️ NEXT APPROVER EMAIL NOT SENT: Status is ${status}, not 'approved'.`);
       } else if (!nextApprover || !nextApproverEmail) {
           console.log(`ℹ️ NEXT APPROVER EMAIL NOT SENT: No valid next approver email found.`);
       }
    }

    console.log(`✅ All approval emails processed for proposed change ID: ${tr_authorization_doc}. Overall Success: ${overallSuccess}`);
    return overallSuccess; // Mengembalikan status keberhasilan keseluruhan

  } catch (error) {
    console.error("❌ Fatal Error sending approval emails:", error);
    console.error(error instanceof Error ? error.stack : "Unknown error structure");
    return false; // Mengembalikan false jika ada error fatal
  }
};

// Membuat template email
const createEmailTemplate = (
  recipientType: 'submitter' | 'approver' | 'next_approver',
  data: any,
  status: string,
  docNumber: string,
  genderTitle: string,
  previousApproverGenderTitle: string = '',
  previousApproverName: string = '',
  note: string = ''
) => {
  const greeting = getGreeting();
  const statusText = getStatusText(status);
  const currentDate = format(new Date(), "dd MMMM yyyy, HH:mm:ss", { locale: id });

  // Get project name directly from the proposed change
  const projectName = data.proposedChange.project_name || 'Dokumen';

  let bodyContent = '';
  let buttonHtml = '';
  let additionalContent = '';
  const isLastApprover = data.isLastApprover;
  const authDocId = data.authorizationDoc.id;

  // Email content and button based on recipient type
  switch (recipientType) {
    case 'submitter':
      if (isLastApprover && status === 'approved') {
        bodyContent = `
          <p>Dengan hormat,</p>
          <p>Kami ingin memberitahukan bahwa dokumen proyek <strong>${projectName}</strong> - ( <strong>${docNumber}</strong>) telah <span class="status status-${status.toLowerCase()}">${statusText}</span> oleh <strong>semua approver</strong> dan telah selesai proses persetujuannya.</p>
          <p>Dokumen ini telah selesai diproses dan siap untuk diimplementasikan.</p>
        `;
        buttonHtml = `
          <div class="button-container">
            <a href="http://localhost:4200/activity-page/authorization-detail/${data.proposedChange.id}" class="button">Lihat Detail Dokumen</a>
          </div>
        `;
      } else if (status === 'not_approved') {
        bodyContent = `
          <p>Dengan hormat,</p>
          <p>Kami informasikan bahwa dokumen proyek <strong>${projectName}</strong> dengan nomor dokumen <strong>${docNumber}</strong> tidak dapat disetujui pada tahap ini.</p>
        `;
        additionalContent = `
          <div class="additional-info">
            <p>Apabila ${genderTitle} memerlukan klarifikasi lebih lanjut atau ingin mengajukan revisi, silakan menghubungi kami atau melakukan tindak lanjut melalui sistem.</p>
          </div>
        `;
        buttonHtml = `
          <div class="button-container">
            <a href="http://localhost:4200/activity-page/authorization-edit/${data.proposedChange.id}" class="button">Revisi Dokumen</a>
          </div>
        `;
      } else {
        bodyContent = `
          <p>Dengan hormat,</p>
          <p>Kami ingin memberitahukan bahwa dokumen proyek <strong>${projectName}</strong> - ( <strong>${docNumber}</strong>) telah <span class="status status-${status.toLowerCase()}">${statusText}</span> dalam sistem kami.</p>
        `;
        buttonHtml = `
          <div class="button-container">
            <a href="http://localhost:4200/activity-page/authorization-detail/${data.proposedChange.id}" class="button">Lihat Detail Dokumen</a>
          </div>
        `;
      }
      break;
    case 'approver':
      if (isLastApprover && status === 'approved') {
        bodyContent = `
          <p>Dengan hormat,</p>
          <p>Kami ingin memberitahukan bahwa dokumen proyek <strong>${projectName}</strong> - ( <strong>${docNumber}</strong>) statusnya telah <span class="status status-${status.toLowerCase()}">${statusText}</span> oleh Anda sebagai <strong>approver terakhir</strong>.</p>
          <p>Seluruh proses persetujuan dokumen ini telah selesai. Terima kasih atas persetujuan yang Anda berikan.</p>
        `;
      } else if (status === 'not_approved') {
        bodyContent = `
          <p>Dengan hormat,</p>
          <p>Kami konfirmasi bahwa Anda telah <span class="status status-${status.toLowerCase()}">${statusText}</span> dokumen proyek <strong>${projectName}</strong> - ( <strong>${docNumber}</strong>).</p>
          <p>Dokumen ini telah diberitahukan kepada submitter untuk dilakukan revisi sesuai dengan catatan yang Anda berikan.</p>
        `;
        buttonHtml = `
          <div class="button-container">
            <a href="http://localhost:4200/activity-page/authorization-detail/${data.proposedChange.id}" class="button">Lihat Detail Dokumen</a>
          </div>
        `;
      } else {
        bodyContent = `
          <p>Dengan hormat,</p>
          <p>Kami ingin memberitahukan bahwa dokumen proyek <strong>${projectName}</strong> - ( <strong>${docNumber}</strong>) statusnya telah berubah menjadi <span class="status status-${status.toLowerCase()}">${statusText}</span> dalam sistem kami.</p>
        `;
      }
      break;
    case 'next_approver':
      bodyContent = `
        <p>Dengan hormat,</p>
        <p>Kami ingin memberitahukan bahwa dokumen proyek <strong>${projectName}</strong> - ( <strong>${docNumber}</strong>) statusnya telah disetujui oleh approver sebelumnya (${previousApproverGenderTitle} ${previousApproverName}).</p>
        
        <p><strong>Sekarang giliran Anda untuk menentukan keputusan dalam proyek ini.</strong></p>
      `;
      buttonHtml = `
        <div class="button-container">
          <a href="http://localhost:4200/activity-page/approval-detail/${authDocId}" class="button">Review & Approve Dokumen</a>
        </div>
      `;
      break;
  }

  // Determine next approver information
  let nextApproverInfo = '';
  if (data.nextApprover && data.nextApprover.authorization) {
    nextApproverInfo = `${getGenderTitle(data.nextApprover.authorization.gender)} ${data.nextApprover.authorization.employee_name || data.nextApprover.authorization.employee_code || 'N/A'}`;
  } else {
    nextApproverInfo = 'Tidak ada';
  }

  // Customize status badge style based on status
  let statusBadgeStyle = '';
  switch (status) {
    case 'approved':
      statusBadgeStyle = 'background-color: #28a745; color: white;';
      break;
    case 'not_approved':
      statusBadgeStyle = 'background-color: #ffc107; color: #212529;';
      break;
    case 'rejected':
      statusBadgeStyle = 'background-color: #dc3545; color: white;';
      break;
    case 'on_going':
      statusBadgeStyle = 'background-color: #17a2b8; color: white;';
      break;
    default:
      statusBadgeStyle = 'background-color: #6c757d; color: white;';
  }

  // Tentukan sapaan yang sesuai berdasarkan jenis penerima
  let recipientName = '';
  let recipientGender = '';

  switch (recipientType) {
    case 'submitter':
      recipientName = data.submitter?.employee_name || '';
      recipientGender = getGenderTitle(data.submitter?.gender);
      break;
    case 'approver':
      recipientName = data.currentApprover.authorization?.employee_name || '';
      recipientGender = genderTitle;
      break;
    case 'next_approver':
      recipientName = data.nextApprover?.authorization?.employee_name || '';
      recipientGender = getGenderTitle(data.nextApprover?.authorization?.gender);
      break;
  }

  // Buat sapaan lengkap
  const fullGreeting = `${greeting}`;
  const formalRecipient = `Yth. ${recipientGender} ${recipientName},`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Go-Document System - Notifikasi</title>
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
        .additional-info {
          margin: 25px 0;
          padding: 15px;
          background-color: #fff8e1;
          border-radius: 5px;
          border-left: 4px solid #ffc107;
          color: #856404;
        }
        .additional-info p {
          color: #856404;
          margin-bottom: 0;
        }
        .status {
          display: inline-block;
          padding: 5px 10px;
          border-radius: 3px;
          font-weight: bold;
          font-size: 14px;
        }
        .status-approved {
          ${statusBadgeStyle}
        }
        .status-not_approved {
          ${statusBadgeStyle}
        }
        .status-rejected {
          ${statusBadgeStyle}
        }
        .status-on_going {
          ${statusBadgeStyle}
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
          <h1>Go-Document System - Authorization Doc</h1>
        </div>
        
        <div class="content">
          <p>${fullGreeting}</p>
          <p>${formalRecipient}</p>
          
          ${bodyContent}
          
          <div class="document-title">
            ${projectName} - ${docNumber}
          </div>
          
          <table class="main-info">
            <tr>
              <th width="35%">Tanggal</th>
              <td>${currentDate}</td>
            </tr>
            <tr>
              <th>Approver</th>
              <td>${data.currentApprover.authorization?.employee_name || 'N/A'}</td>
            </tr>
            <tr>
              <th>Status</th>
              <td><span class="status status-${status.toLowerCase()}">${statusText}</span></td>
            </tr>
            <tr>
              <th>Pembuat</th>
              <td>${data.submitter?.employee_name || 'N/A'}</td>
            </tr>
            <tr>
              <th>Next Approver</th>
              <td>${nextApproverInfo}</td>
            </tr>
          </table>
          
          <div class="note-container">
            <h4 class="note-title">Catatan:</h4>
            <p class="note-content">${note || 'Tidak ada catatan yang ditambahkan'}</p>
          </div>
          
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
};
