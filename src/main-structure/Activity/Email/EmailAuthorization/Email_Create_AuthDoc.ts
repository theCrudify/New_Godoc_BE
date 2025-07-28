// Import necessary modules at the top of your file
import { getStatusText, sendEmail, getDocumentNumber, getGenderTitle, getGreeting } from "../EmailServiceEnvironment/EmailServiceExport";
import { prismaDB2 } from "../../../../config/database";

async function sendSubmissionEmails(authDocId: number, authId: number): Promise<void> {
  try {
    // Get the authorization doc data with related proposed change
    const authDoc = await prismaDB2.tr_authorization_doc.findUnique({
      where: { id: authDocId },
      include: {
        proposedChange: true,  // Relasi ke tr_proposed_changes sesuai dengan model
        authdocApprovals: {    // Relasi ke tr_authdoc_approval sesuai dengan model
          include: {
            authorization: true
          },
          orderBy: {
            step: 'asc'
          }
        }
      }
    });

    if (!authDoc) {
      throw new Error(`Authorization document with ID ${authDocId} not found`);
    }

    // Get submitter information
    const submitter = await prismaDB2.mst_authorization.findUnique({
      where: { id: authId }
    });

    if (!submitter || !submitter.email) {
      console.log(`No valid submitter email found for auth ID ${authId}`);
      return;
    }

    // Get first approver (the one with status 'on_going')
    const firstApprover = authDoc.authdocApprovals.find(a => a.status === 'on_going');
    if (!firstApprover || !firstApprover.authorization || !firstApprover.authorization.email) {
      console.log(`No valid first approver found for auth doc ${authDocId}`);
      return;
    }

    // Get document number directly from the auth doc
    const runningNumber = authDoc.doc_number || 'N/A';

    // Get project name from related proposed change if available
    const projectName = authDoc.proposedChange?.project_name || 'Dokumen Otorisasi';

    // Get gender titles
    const submitterGender = getGenderTitle(submitter.gender);
    const approverGender = getGenderTitle(firstApprover.authorization.gender);

    // Format current date
    const currentDate = new Date().toLocaleString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // 1. Email to submitter
    const submitterEmailSubject = `[Go-Document] Dokumen Berhasil Diajukan: ${projectName}`;

    const submitterEmailTemplate = `
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
        .status {
          display: inline-block;
          padding: 5px 10px;
          border-radius: 3px;
          font-weight: bold;
          font-size: 14px;
          background-color: #17a2b8; 
          color: white;
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
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Go-Document System - Authorization Doc</h1>
        </div>
        
        <div class="content">
          <p>${getGreeting()}</p>
          <p>Yth. ${submitterGender} ${submitter.employee_name || submitter.employee_code || ''},</p>
          
          <p>Dengan hormat,</p>
          <p>Dokumen otorisasi <strong>${projectName}</strong> - ( <strong>${runningNumber}</strong>) telah berhasil diajukan dan sedang menunggu persetujuan.</p>
          
          <div class="document-title">
            ${projectName} - ${runningNumber}
          </div>
          
          <table class="main-info">
            <tr>
              <th width="35%">Tanggal Pengajuan</th>
              <td>${currentDate}</td>
            </tr>
            <tr>
              <th>Status</th>
              <td><span class="status">SUBMITTED</span></td>
            </tr>
            <tr>
              <th>Pembuat</th>
              <td>${submitter.employee_name || submitter.employee_code || 'N/A'}</td>
            </tr>
            <tr>
              <th>Approver Saat Ini</th>
              <td>${firstApprover.authorization.employee_name || firstApprover.authorization.employee_code || 'N/A'}</td>
            </tr>
          </table>
          
          <div class="button-container">
            <a href="http://localhost:4200/activity-page/authdoc-detail/${authDoc.id}" class="button">Lihat Detail Dokumen</a>
          </div>
          
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

    // 2. Email to first approver
    const approverEmailSubject = `[Go-Document] Dokumen Menunggu Persetujuan Anda: ${projectName}`;

    const approverEmailTemplate = `
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
        .status {
          display: inline-block;
          padding: 5px 10px;
          border-radius: 3px;
          font-weight: bold;
          font-size: 14px;
          background-color: #ffc107; 
          color: #212529;
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
        .attention {
          background-color: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
          border-radius: 5px;
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
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Go-Document System - Authorization Doc</h1>
        </div>
        
        <div class="content">
          <p>${getGreeting()}</p>
          <p>Yth. ${approverGender} ${firstApprover.authorization.employee_name || firstApprover.authorization.employee_code || ''},</p>
          
          <p>Dengan hormat,</p>
          <p>Dokumen otorisasi <strong>${projectName}</strong> - ( <strong>${runningNumber}</strong>) telah diajukan dan <strong>menunggu persetujuan Anda</strong>.</p>
          
          <div class="attention">
            <p><strong>Anda adalah approver untuk dokumen ini.</strong> Mohon segera melakukan review dan persetujuan untuk memastikan proses berjalan lancar.</p>
          </div>
          
          <div class="document-title">
            ${projectName} - ${runningNumber}
          </div>
          
          <table class="main-info">
            <tr>
              <th width="35%">Tanggal Pengajuan</th>
              <td>${currentDate}</td>
            </tr>
            <tr>
              <th>Status</th>
              <td><span class="status">MENUNGGU PERSETUJUAN</span></td>
            </tr>
            <tr>
              <th>Pembuat</th>
              <td>${submitter.employee_name || submitter.employee_code || 'N/A'}</td>
            </tr>
            <tr>
              <th>Approver Saat Ini</th>
              <td><strong>${firstApprover.authorization.employee_name || firstApprover.authorization.employee_code || 'N/A'}</strong> (Anda)</td>
            </tr>
          </table>
          
          <div class="button-container">
            <a href="http://localhost:4200/activity-page/authdoc-approval-detail/${authDoc.id}" class="button">Review & Approve Dokumen</a>
          </div>
          
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

    // Send email to submitter
    await sendEmail({
      to: submitter.email,
      subject: submitterEmailSubject,
      html: submitterEmailTemplate
    });
    console.log(`✉️ Submission notification email sent to submitter: ${submitter.email}`);

    // Send email to first approver
    await sendEmail({
      to: firstApprover.authorization.email,
      subject: approverEmailSubject,
      html: approverEmailTemplate
    });
    console.log(`✉️ Approval request email sent to first approver: ${firstApprover.authorization.email}`);

  } catch (error) {
    console.error("Error sending submission emails:", error);
    throw error;
  }
}

export { sendSubmissionEmails };