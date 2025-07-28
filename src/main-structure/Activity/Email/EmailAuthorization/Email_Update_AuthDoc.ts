// Import necessary modules
import { getStatusText, sendEmail, getGenderTitle, getGreeting } from "../EmailServiceEnvironment/EmailServiceExport";
import { prismaDB2 } from "../../../../config/database";
import { format } from "date-fns";
import { id } from "date-fns/locale/id";

// Function to send notification emails about auth doc updates
async function sendAuthDocUpdateNotificationEmails(
  authdocId: number,
  existingRecord: any,
  notApprovedApprovers: any[] = [],
  submitter: any
) {
  try {
    // Get the document number directly from the auth doc record
    const docNumber = existingRecord.doc_number || "NO-DOC-NUMBER";
    const projectName = existingRecord.proposedChange?.project_name || "Authorization Document";

    // Send email to submitter if available
    if (submitter?.email) {
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
      await sendEmail({
        to: submitter.email,
        subject: emailSubject,
        html: submitterTemplate
      });

      console.log(`Auth Doc update notification email sent to submitter: ${submitter.email}`);
    }

    // Send emails to all approvers who previously marked the document as "not_approved"
    for (const approver of notApprovedApprovers) {
      if (approver.email) {
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
        await sendEmail({
          to: approver.email,
          subject: emailSubject,
          html: approverTemplate
        });

        console.log(`Auth Doc update notification email sent to approver: ${approver.email}`);
      }
    }

    return true;
  } catch (error) {
    console.error("Error sending auth doc update notification emails:", error);
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

export { sendAuthDocUpdateNotificationEmails };