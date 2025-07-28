// Import at the top of your file
import { getStatusText, sendEmail, getDocumentNumber, getGenderTitle, getGreeting } from "../EmailServiceEnvironment/EmailServiceExport";
import { prismaDB2 } from "../../../../config/database";
import { format } from "date-fns";
import { id } from "date-fns/locale/id";

// Fungsi utama untuk mengirim notifikasi email tentang pembaruan
// In the sendUpdateNotificationEmails function, we need to modify our approach
// to track not just emails but also roles to prevent true duplicates while
// allowing the same email to receive different role-based notifications

async function sendUpdateNotificationEmails(
  proposedChangesId: number,
  existingRecord: any,
  notApprovedApprovers: any[],
  submitter: any
) {
  try {
    console.log(`Starting sendUpdateNotificationEmails for proposed change ID: ${proposedChangesId}`);
    console.log(`Number of not approved approvers: ${notApprovedApprovers?.length || 0}`);
    
    // Get the document number
    const runningNumber = await getDocumentNumber(proposedChangesId);
    
    // Instead of tracking just emails, track email+role combinations
    // This allows the same email to receive different notifications for different roles
    const emailRoleSent = new Set<string>();
    
    // Kirim email ke submitter terlebih dahulu
    if (submitter?.email) {
      console.log(`Sending email to submitter: ${submitter.email}`);
      await sendSubmitterUpdateNotification(existingRecord, submitter, runningNumber);
      emailRoleSent.add(`${submitter.email.toLowerCase()}:submitter`);
      console.log(`Email sent to submitter, added to emailRoleSent set: ${submitter.email.toLowerCase()}:submitter`);
    } else {
      console.log(`Submitter email not available, skipping submitter notification`);
    }
    
    // Kirim email ke approver yang sebelumnya menolak (tanpa duplikasi)
    console.log(`About to send emails to ${notApprovedApprovers?.length || 0} approvers who previously rejected`);
    await sendApproverUpdateNotifications(existingRecord, notApprovedApprovers, submitter, runningNumber, emailRoleSent);
    
    return true;
  } catch (error) {
    console.error("Error sending update notification emails:", error);
    throw error; // Rethrow for proper error handling
  }
}

// Update the sendApproverUpdateNotifications function to use the new email+role tracking
async function sendApproverUpdateNotifications(
  existingRecord: any,
  notApprovedApprovers: any[],
  submitter: any,
  runningNumber: string,
  emailRoleSent: Set<string> = new Set()
) {
  console.log(`Starting sendApproverUpdateNotifications with ${notApprovedApprovers?.length || 0} approvers`);
  console.log(`Current emailRoleSent set contains ${emailRoleSent.size} entries:`, Array.from(emailRoleSent));
  
  if (!notApprovedApprovers || notApprovedApprovers.length === 0) {
    console.log("No previous not-approved approvers found");
    return false;
  }

  let successCount = 0;
  
  // Kirim email ke setiap approver yang menolak sebelumnya
  for (const approver of notApprovedApprovers) {
    console.log(`Processing approver: ${approver.employee_name || 'unknown'} (ID: ${approver.id})`);
    
    // Skip jika tidak ada email
    if (!approver.email) {
      console.log(`Approver ${approver.employee_name || 'unknown'} doesn't have an email, skipping`);
      continue;
    }
    
    const approverEmail = approver.email.toLowerCase();
    const approverRoleKey = `${approverEmail}:approver-${approver.id}`; // Include ID to differentiate between approvers with same email
    console.log(`Approver email: ${approverEmail}`);
    
    // Skip hanya jika kombinasi email+role sudah dikirim sebelumnya
    if (emailRoleSent.has(approverRoleKey)) {
      console.log(`Email already sent to ${approverEmail} as approver with ID ${approver.id}, skipping duplicate`);
      continue;
    }
    
    try {
      const approverGender = getGenderTitle(approver.gender);
      const emailSubject = `[Go-Document] Dokumen Telah Diperbarui: ${existingRecord.project_name}`;

      console.log(`Creating email template for approver: ${approverEmail}`);
      const approverTemplate = createApproverUpdateTemplate(
        existingRecord,
        submitter,
        approver,
        runningNumber,
        approverGender
      );

      // Kirim email ke approver
      console.log(`Attempting to send email to approver: ${approverEmail}`);
      await sendEmail({
        to: approver.email,
        subject: emailSubject,
        html: approverTemplate
      });

      // Catat kombinasi email+role yang sudah dikirim
      emailRoleSent.add(approverRoleKey);
      
      console.log(`✅ Update notification email sent to approver: ${approver.email}`);
      successCount++;
    } catch (error) {
      console.error(`❌ Error sending email to approver: ${approver.email}`, error);
    }
  }
  
  console.log(`Completed sendApproverUpdateNotifications with ${successCount} successful emails`);
  return successCount > 0;
}

// Fungsi untuk mengirim notifikasi ke submitter
async function sendSubmitterUpdateNotification(
  existingRecord: any,
  submitter: any,
  runningNumber: string
) {
  // Cek apakah submitter memiliki email
  if (!submitter?.email) {
    console.log("Submitter email not available, skipping email notification");
    return false;
  }

  try {
    const submitterGender = getGenderTitle(submitter.gender);
    const emailSubject = `[Go-Document] Dokumen Telah Diperbarui: ${existingRecord.project_name}`;

    const submitterTemplate = createSubmitterUpdateTemplate(
      existingRecord,
      submitter,
      runningNumber,
      submitterGender
    );

    // Kirim email ke submitter
    await sendEmail({
      to: submitter.email,
      subject: emailSubject,
      html: submitterTemplate
    });

    console.log(`Update notification email sent to submitter: ${submitter.email}`);
    return true;
  } catch (error) {
    console.error(`Error sending email to submitter: ${submitter.email}`, error);
    return false;
  }
}

// Fungsi untuk membuat template email untuk submitter
function createSubmitterUpdateTemplate(
  proposedChange: any,
  submitter: any,
  runningNumber: string,
  genderTitle: string
) {
  const greeting = getGreeting();
  const currentDate = format(new Date(), "dd MMMM yyyy, HH:mm:ss", { locale: id });
  
  const bodyContent = `
    <p>Dengan hormat,</p>
    <p>Kami ingin memberitahukan bahwa dokumen proyek <strong>${proposedChange.project_name}</strong> - (<strong>${runningNumber}</strong>) yang Anda buat telah diperbarui dalam sistem kami.</p>
    <p>Dokumen telah direvisi dan siap untuk diproses persetujuan kembali.</p>
  `;
  
  const buttonHtml = `
    <div class="button-container">
      <a href="http://localhost:4200/activity-page/proposedchanges-detail/${proposedChange.id}" class="button">Lihat Detail Dokumen</a>
    </div>
  `;
  
  const recipientName = submitter?.employee_name || '';
  const formalRecipient = `Yth. ${genderTitle} ${recipientName},`;
  
  return createEmailTemplate(
    greeting,
    formalRecipient,
    bodyContent,
    proposedChange,
    submitter,
    runningNumber,
    currentDate,
    buttonHtml,
    ""  // Tidak ada additional content untuk submitter
  );
}

// // Fungsi untuk mengirim notifikasi ke para approver yang sebelumnya menolak
// async function sendApproverUpdateNotifications(
//   existingRecord: any,
//   notApprovedApprovers: any[],
//   submitter: any,
//   runningNumber: string,
//   emailsSent: Set<string> = new Set()
// ) {
//   console.log(`Starting sendApproverUpdateNotifications with ${notApprovedApprovers?.length || 0} approvers`);
//   console.log(`Current emailsSent set contains ${emailsSent.size} emails:`, Array.from(emailsSent));
  
//   if (!notApprovedApprovers || notApprovedApprovers.length === 0) {
//     console.log("No previous not-approved approvers found");
//     return false;
//   }

//   let successCount = 0;
  
//   // Kirim email ke setiap approver yang menolak sebelumnya
//   for (const approver of notApprovedApprovers) {
//     console.log(`Processing approver: ${approver.employee_name || 'unknown'} (ID: ${approver.id})`);
    
//     // Skip jika tidak ada email
//     if (!approver.email) {
//       console.log(`Approver ${approver.employee_name || 'unknown'} doesn't have an email, skipping`);
//       continue;
//     }
    
//     const approverEmail = approver.email.toLowerCase();
//     console.log(`Approver email: ${approverEmail}`);
    
//     // Skip jika email sudah dikirim sebelumnya (untuk menghindari duplikasi)
//     if (emailsSent.has(approverEmail)) {
//       console.log(`Email already sent to ${approverEmail}, skipping duplicate`);
//       continue;
//     }
    
//     try {
//       const approverGender = getGenderTitle(approver.gender);
//       const emailSubject = `[Go-Document] Dokumen Telah Diperbarui: ${existingRecord.project_name}`;

//       console.log(`Creating email template for approver: ${approverEmail}`);
//       const approverTemplate = createApproverUpdateTemplate(
//         existingRecord,
//         submitter,
//         approver,
//         runningNumber,
//         approverGender
//       );

//       // Kirim email ke approver
//       console.log(`Attempting to send email to approver: ${approverEmail}`);
//       await sendEmail({
//         to: approver.email,
//         subject: emailSubject,
//         html: approverTemplate
//       });

//       // Catat bahwa email sudah dikirim ke alamat ini
//       emailsSent.add(approverEmail);
      
//       console.log(`✅ Update notification email sent to approver: ${approver.email}`);
//       successCount++;
//     } catch (error) {
//       console.error(`❌ Error sending email to approver: ${approver.email}`, error);
//     }
//   }
  
//   console.log(`Completed sendApproverUpdateNotifications with ${successCount} successful emails`);
//   return successCount > 0;
// }

// Fungsi untuk membuat template email untuk approver
function createApproverUpdateTemplate(
  proposedChange: any,
  submitter: any,
  approver: any,
  runningNumber: string,
  genderTitle: string
) {
  const greeting = getGreeting();
  const currentDate = format(new Date(), "dd MMMM yyyy, HH:mm:ss", { locale: id });
  
  const bodyContent = `
    <p>Dengan hormat,</p>
    <p>Kami ingin memberitahukan bahwa dokumen proyek <strong>${proposedChange.project_name}</strong> - (<strong>${runningNumber}</strong>) yang sebelumnya Anda <strong>TIDAK SETUJUI</strong> telah diperbarui oleh submitter.</p>
    <p>Dokumen telah direvisi dan menunggu persetujuan Anda kembali.</p>
  `;
  
  const buttonHtml = `
    <div class="button-container">
      <a href="http://localhost:4200/activity-page/approval-detail/${proposedChange.id}" class="button">Review & Approve Dokumen</a>
    </div>
  `;
  
  // Tambahkan catatan sebelumnya jika tersedia
  let additionalContent = '';
  if (approver.note) {
    additionalContent = `
      <div class="note-container">
        <h4 class="note-title">Catatan Anda Sebelumnya:</h4>
        <p class="note-content">${approver.note || 'Tidak ada catatan yang ditambahkan'}</p>
      </div>
    `;
  }
  
  const recipientName = approver?.employee_name || '';
  const formalRecipient = `Yth. ${genderTitle} ${recipientName},`;
  
  return createEmailTemplate(
    greeting,
    formalRecipient,
    bodyContent,
    proposedChange,
    submitter,
    runningNumber,
    currentDate,
    buttonHtml,
    additionalContent
  );
}

// Fungsi dasar untuk membuat template email
function createEmailTemplate(
  greeting: string,
  formalRecipient: string,
  bodyContent: string,
  proposedChange: any,
  submitter: any,
  runningNumber: string,
  currentDate: string,
  buttonHtml: string,
  additionalContent: string
) {
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
        <p>${greeting}</p>
        <p>${formalRecipient}</p>
        
        ${bodyContent}
        
        <div class="document-title">
          ${proposedChange.project_name} - ${runningNumber}
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
            <td>${submitter?.employee_name || 'N/A'}</td>
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

// Export semua fungsi yang dibutuhkan
export { 
  sendUpdateNotificationEmails,
  sendSubmitterUpdateNotification,
  sendApproverUpdateNotifications,
  createSubmitterUpdateTemplate,
  createApproverUpdateTemplate,
  createEmailTemplate
};