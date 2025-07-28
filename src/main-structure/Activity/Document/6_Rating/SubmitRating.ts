
/**
 * Endpoint to submit a rating for a handover approval
 * Modified to include auth_id validation and send confirmation emails
 */
// 2. Create the new handler function
import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";
import { sendEmail, getGenderTitle, getGreeting } from "../../Email/EmailServiceEnvironment/EmailServiceExport";

/**
 * Endpoint to submit a rating for a handover approval
 * Modified to include auth_id validation, record rating timestamp, and send confirmation emails
 */
export const submitRatingByHandover = async (req: Request, res: Response): Promise<void> => {
  try {
    const { handover_id } = req.params;
    const handoverId = parseInt(handover_id, 10);
    const { rating, review = "", auth_id } = req.body;
    const currentTime = new Date(); // Get current timestamp for rating submission

    // Validate handover_id format
    if (isNaN(handoverId)) {
      console.warn("❌ Invalid handover_id format:", handover_id);
      res.status(400).json({
        error: "Validation Error",
        details: "handover_id must be a valid number"
      });
      return;
    }

    // Validate auth_id is provided
    if (auth_id === undefined || auth_id === null) {
      console.warn("❌ Missing auth_id in request body");
      res.status(400).json({
        error: "Validation Error",
        details: "auth_id is required in request body for verification"
      });
      return;
    }

    // Validate rating value
    if (rating === undefined || rating === null) {
      console.warn("❌ Missing rating in request body");
      res.status(400).json({
        error: "Validation Error",
        details: "rating is required in request body"
      });
      return;
    }

    const ratingValue = parseInt(rating.toString(), 10);
    if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      console.warn(`❌ Invalid rating value: ${rating}`);
      res.status(400).json({
        error: "Validation Error",
        details: "rating must be a number between 1 and 5"
      });
      return;
    }

    console.log(`🔍 Processing rating submission for handover ID: ${handoverId} by auth_id: ${auth_id}`);

    // Check if handover exists
    const existingHandover = await prismaDB2.tr_handover.findUnique({
      where: { id: handoverId },
      select: {
        id: true,
        is_finished: true,
        doc_number: true,
        auth_id: true, // Submitter ID
        tr_proposed_changes: {
          select: {
            project_name: true
          }
        }
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

    // Check if handover is marked as finished
    if (!existingHandover.is_finished) {
      console.warn(`❌ Handover ID ${handoverId} is not marked as finished`);
      res.status(400).json({
        error: "Invalid Operation",
        details: "Ratings can only be submitted for finished handovers"
      });
      return;
    }

    // Find the specific approval for this user and handover
    const existingApproval = await prismaDB2.tr_handover_approval.findFirst({
      where: {
        handover_id: handoverId,
        auth_id: auth_id,
        status: "approved" // Ensure it's approved
      },
      include: {
        mst_authorization: true // Include approver details
      }
    });

    if (!existingApproval) {
      console.warn(`❌ No approved approval found for handover ID: ${handoverId} and auth_id: ${auth_id}`);
      res.status(404).json({
        error: "Not Found",
        details: "No approved approval found for this handover and user"
      });
      return;
    }

    // Check if the approval already has a rating
    if (existingApproval.rating !== null) {
      console.warn(`❌ Approval ID ${existingApproval.id} already has a rating: ${existingApproval.rating}`);
      res.status(400).json({
        error: "Invalid Operation",
        details: "This approval already has a rating"
      });
      return;
    }

    const approvalId = existingApproval.id;
    const projectName = existingHandover.tr_proposed_changes?.project_name || "Handover Document";
    const docNumber = existingHandover.doc_number || "No Document Number";

    // Submit the rating with timestamp
    await prismaDB2.tr_handover_approval.update({
      where: { id: approvalId },
      data: {
        rating: ratingValue,
        review: review,
        rating_date: currentTime, // Add rating timestamp
        updated_date: currentTime
      }
    });

    console.log(`✅ Successfully submitted rating ${ratingValue} for approval ${approvalId} at ${currentTime.toISOString()}`);

    // Get all approvals for this handover to calculate average
    const allApprovals = await prismaDB2.tr_handover_approval.findMany({
      where: {
        handover_id: handoverId,
        status: "approved"
      }
    });

    // Count how many approvals have ratings
    const approvalsWithRatings = allApprovals.filter(a => a.rating !== null && a.rating !== undefined);
    const totalApprovals = allApprovals.length;
    const ratedApprovals = approvalsWithRatings.length;

    console.log(`📊 ${ratedApprovals} of ${totalApprovals} approvals have ratings`);

    // Calculate average rating if all approvals have been rated
    let averageRating = null;
    let isComplete = false;

    if (ratedApprovals > 0) {
      // Sum all ratings
      const sum = approvalsWithRatings.reduce((total, approval) => total + (approval.rating || 0), 0);

      // Calculate average and round to nearest integer
      averageRating = parseFloat((sum / ratedApprovals).toFixed(1)); // atau 2 untuk 2 angka di belakang koma

      // Check if all approvals have ratings
      isComplete = ratedApprovals === totalApprovals;

      console.log(`📈 Current average rating: ${averageRating} (${isComplete ? 'Complete' : 'Partial'})`);

      // Update handover with current average rating
      await prismaDB2.tr_handover.update({
        where: { id: handoverId },
        data: {
          star: averageRating,
          updated_at: currentTime
        }
      });

      console.log(`✅ Updated handover with average rating: ${averageRating}`);
    }

    // Send confirmation email to the approver who submitted the rating
    try {
      if (existingApproval.mst_authorization?.email) {
        await sendRatingConfirmationToApprover(
          existingApproval.mst_authorization,
          ratingValue,
          projectName,
          docNumber,
          review
        );
      }
    } catch (emailError) {
      console.error('❌ Error sending approver confirmation email:', emailError);
      // Continue processing even if email fails
    }

    // If this was the final rating, send a summary email to the submitter
    try {
      if (isComplete && existingHandover.auth_id) {
        // Get submitter details
        const submitter = await prismaDB2.mst_authorization.findUnique({
          where: { id: existingHandover.auth_id }
        });

        if (submitter?.email) {
          await sendRatingSummaryToSubmitter(
            submitter,
            handoverId,
            projectName,
            docNumber,
            averageRating || 0,
            totalApprovals
          );
        }
      }
    } catch (emailError) {
      console.error('❌ Error sending submitter summary email:', emailError);
      // Continue processing even if email fails
    }

    res.status(200).json({
      message: isComplete
        ? "Rating submitted successfully. All ratings complete!"
        : "Rating submitted successfully",
      data: {
        handover_id: handoverId,
        approval_id: approvalId,
        auth_id: auth_id,
        rating: ratingValue,
        rating_date: currentTime, // Include rating timestamp in response
        final_rating: averageRating,
        is_complete: isComplete,
        rated_approvals: ratedApprovals,
        total_approvals: totalApprovals
      }
    });

  } catch (error) {
    console.error("❌ Error submitting rating:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
    console.log("🔌 Database connection closed");
  }
};

/**
 * Send confirmation email to the approver who submitted a rating
 */
async function sendRatingConfirmationToApprover(
  approver: any,
  rating: number,
  projectName: string,
  docNumber: string,
  review: string
): Promise<void> {
  try {
    const email = approver.email;
    if (!email) {
      console.warn("⚠️ Cannot send confirmation email: approver has no email address");
      return;
    }

    const approverName = approver.employee_name || approver.employee_code || "Approver";
    const approverGender = getGenderTitle(approver.gender);
    const greeting = getGreeting();
    const ratingStars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    const currentDate = new Date().toLocaleDateString('id-ID');

    // Email subject
    const emailSubject = `[Go-Document] Konfirmasi Penilaian untuk ${projectName}`;

    // Email content
    const emailContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Go-Document System - Konfirmasi Penilaian</title>
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
        .success-box {
          background-color: #d4edda;
          border-left: 4px solid #28a745;
          padding: 15px;
          margin: 20px 0;
          border-radius: 5px;
        }
        .success-box p {
          color: #155724;
          margin: 0;
          font-weight: 500;
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
        .rating-display {
          text-align: center;
          margin: 25px 0;
          padding: 15px;
          background-color: #fff8e1;
          border-radius: 8px;
          border: 1px solid #ffecb3;
        }
        .stars {
          font-size: 32px;
          color: #ffc107;
          letter-spacing: 5px;
        }
        .rating-text {
          margin-top: 10px;
          font-weight: 600;
          color: #856404;
        }
        .review-box {
          background-color: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
          margin: 20px 0;
          border-left: 4px solid #6c757d;
        }
        .review-text {
          font-style: italic;
          color: #555;
          margin: 0;
        }
        table.info-table { 
          width: 100%; 
          border-collapse: collapse; 
          margin: 25px 0;
          border-radius: 5px;
          overflow: hidden;
          box-shadow: a 0 20px rgba(0,0,0,0.05);
        }
        .info-table th, .info-table td { 
          padding: 12px 15px; 
          text-align: left; 
          border-bottom: 1px solid #eee;
        }
        .info-table th { 
          background-color: #f8f9fa; 
          color: #333;
          font-weight: 600;
          width: 35%;
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
          <h1>Go-Document System</h1>
        </div>
        
        <div class="content">
          <p>${greeting}</p>
          <p>Yth. ${approverGender} ${approverName},</p>
          
          <div class="success-box">
            <p><strong>Terima kasih!</strong> Penilaian Anda untuk dokumen handover telah berhasil disimpan.</p>
          </div>
          
          <p>Berikut ringkasan penilaian yang telah Anda berikan:</p>
          
          <div class="document-title">
            ${projectName} - ${docNumber}
          </div>
          
          <div class="rating-display">
            <div class="stars">${ratingStars}</div>
            <p class="rating-text">Penilaian: ${rating} dari 5</p>
          </div>
          
          ${review ? `
          <div class="review-box">
            <p class="review-text">"${review}"</p>
          </div>
          ` : ''}
          
          <table class="info-table">
            <tr>
              <th>Tanggal Penilaian</th>
              <td>${currentDate}</td>
            </tr>
            <tr>
              <th>Status</th>
              <td>Tersimpan</td>
            </tr>
          </table>
          
          <p>Terima kasih atas kontribusi Anda dalam meningkatkan kualitas proses handover di sistem kami.</p>
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

    // Send the email
    await sendEmail({
      to: email,
      subject: emailSubject,
      html: emailContent
    });

    console.log(`✉️ Rating confirmation email sent to approver: ${email}`);

  } catch (error) {
    console.error("❌ Error sending approver confirmation email:", error);
    throw error;
  }
}

/**
 * Send summary email to the submitter when all ratings are complete
 */
function renderStars(rating: number): string {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.25 && rating - fullStars < 0.75;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  let stars = '★'.repeat(fullStars);
  if (hasHalfStar) stars += '⯨'; // simbol setengah bintang, bisa diganti
  stars += '☆'.repeat(emptyStars);

  return stars;
}

async function sendRatingSummaryToSubmitter(
  submitter: any,
  handoverId: number,
  projectName: string,
  docNumber: string,
  averageRating: number,
  totalApprovers: number
): Promise<void> {
  try {
    const email = submitter.email;
    if (!email) {
      console.warn("⚠️ Cannot send summary email: submitter has no email address");
      return;
    }

    const submitterName = submitter.employee_name || submitter.employee_code || "Submitter";
    const submitterGender = getGenderTitle(submitter.gender);
    const greeting = getGreeting();
    const ratingStars = renderStars(averageRating);
    const currentDate = new Date().toLocaleDateString('id-ID');

    const approvals = await prismaDB2.tr_handover_approval.findMany({
      where: {
        handover_id: handoverId,
        status: "approved",
        rating: { not: null }
      },
      include: {
        mst_authorization: true
      },
      orderBy: {
        rating: 'desc'
      }
    });

    let approverFeedbackHtml = '';
    for (const approval of approvals) {
      const approverName = approval.mst_authorization?.employee_name || approval.employee_code || "Approver";
      const approverRating = approval.rating || 0;
      const approverStars = renderStars(approverRating);
      const approverReview = approval.review || "(Tidak ada ulasan)";

      approverFeedbackHtml += `
      <div class="approver-feedback">
        <div class="approver-header">
          <span class="approver-name">${approverName}</span>
          <span class="approver-stars">${approverStars}</span>
        </div>
        <p class="approver-review">"${approverReview}"</p>
      </div>
      `;
    }


    // Email subject
    const emailSubject = `[Go-Document] Ringkasan Penilaian untuk ${projectName}`;

    // Email content
    const emailContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Go-Document System - Ringkasan Penilaian</title>
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
        .complete-box {
          background-color: #d4edda;
          border-left: 4px solid #28a745;
          padding: 15px;
          margin: 20px 0;
          border-radius: 5px;
        }
        .complete-box p {
          color: #155724;
          margin: 0;
          font-weight: 500;
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
        .rating-summary {
          text-align: center;
          margin: 25px 0;
          padding: 20px;
          background-color: #fff8e1;
          border-radius: 8px;
          border: 1px solid #ffecb3;
        }
        .rating-big {
          font-size: 48px;
          font-weight: bold;
          color: #ffc107;
        }
        .stars-big {
          font-size: 36px;
          color: #ffc107;
          letter-spacing: 5px;
          margin: 10px 0;
        }
        .rating-text {
          margin-top: 10px;
          font-weight: 600;
          color: #856404;
        }
        .approver-feedback {
          background-color: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
          margin: 15px 0;
          border-left: 4px solid #6c757d;
        }
        .approver-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .approver-name {
          font-weight: bold;
          color: #495057;
        }
        .approver-stars {
          color: #ffc107;
        }
        .approver-review {
          font-style: italic;
          color: #555;
          margin: 0;
        }
        .feedback-section {
          margin: 30px 0;
        }
        .section-title {
          font-size: 18px;
          color: #333;
          margin-bottom: 15px;
          padding-bottom: 5px;
          border-bottom: 1px solid #eee;
        }
        table.summary-table { 
          width: 100%; 
          border-collapse: collapse; 
          margin: 25px 0;
          border-radius: 5px;
          overflow: hidden;
          box-shadow: 0 0 20px rgba(0,0,0,0.05);
        }
        .summary-table th, .summary-table td { 
          padding: 12px 15px; 
          text-align: left; 
          border-bottom: 1px solid #eee;
        }
        .summary-table th { 
          background-color: #f8f9fa; 
          color: #333;
          font-weight: 600;
          width: 35%;
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
          <h1>Go-Document System</h1>
        </div>
        
        <div class="content">
          <p>${greeting}</p>
          <p>Yth. ${submitterGender} ${submitterName},</p>
          
          <div class="complete-box">
            <p><strong>Selamat!</strong> Semua penilaian untuk dokumen handover Anda telah lengkap.</p>
          </div>
          
          <p>Berikut ringkasan penilaian untuk dokumen:</p>
          
          <div class="document-title">
            ${projectName} - ${docNumber}
          </div>
          
          <div class="rating-summary">
            <div class="rating-big">${averageRating}/5</div>
            <div class="stars-big">${ratingStars}</div>
            <p class="rating-text">Penilaian rata-rata dari ${totalApprovers} approver</p>
          </div>
          
          <table class="summary-table">
            <tr>
              <th>Tanggal Selesai</th>
              <td>${currentDate}</td>
            </tr>
            <tr>
              <th>Status</th>
              <td>Selesai</td>
            </tr>
            <tr>
              <th>Jumlah Penilai</th>
              <td>${totalApprovers} orang</td>
            </tr>
          </table>
          
          <div class="feedback-section">
            <h3 class="section-title">Ulasan dan Komentar</h3>
            ${approverFeedbackHtml}
          </div>
          
          <p>Terima kasih atas partisipasi Anda dalam proses handover. Penilaian ini akan digunakan untuk meningkatkan kualitas proses handover di masa mendatang.</p>
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

    // Send the email
    await sendEmail({
      to: email,
      subject: emailSubject,
      html: emailContent
    });

    console.log(`✉️ Rating summary email sent to submitter: ${email}`);

  } catch (error) {
    console.error("❌ Error sending submitter summary email:", error);
    throw error;
  }
}

/**
 * Endpoint to mark a handover as finished, which enables the rating process
 */
export const markHandoverAsFinished = async (req: Request, res: Response): Promise<void> => {
  try {
    const { handover_id } = req.params;
    const handoverId = parseInt(handover_id, 10);

    if (isNaN(handoverId)) {
      console.warn("❌ Invalid handover_id format:", handover_id);
      res.status(400).json({
        error: "Validation Error",
        details: "handover_id must be a valid number"
      });
      return;
    }

    console.log(`🔍 Processing request to mark handover ${handoverId} as finished`);

    // Check if handover exists
    const handover = await prismaDB2.tr_handover.findUnique({
      where: { id: handoverId },
      include: {
        tr_handover_approval: true
      }
    });

    if (!handover) {
      console.warn(`❌ No handover found with ID: ${handoverId}`);
      res.status(404).json({
        error: "Not Found",
        details: `Handover with ID ${handoverId} not found`
      });
      return;
    }

    // Check if handover is already finished
    if (handover.is_finished) {
      console.warn(`⚠️ Handover ID ${handoverId} is already marked as finished`);
      res.status(200).json({
        message: "Handover is already marked as finished",
        data: {
          handover_id: handoverId,
          is_finished: true,
          finished_date: handover.finished_date
        }
      });
      return;
    }

    // Check if all approvals are in "approved" status
    const pendingApprovals = handover.tr_handover_approval.filter(a =>
      a.status !== "approved"
    );

    if (pendingApprovals.length > 0) {
      console.warn(`❌ Handover ID ${handoverId} has ${pendingApprovals.length} pending approvals`);
      res.status(400).json({
        error: "Invalid Operation",
        details: "Cannot mark handover as finished while there are pending approvals"
      });
      return;
    }

    // Set finished timestamp
    const finishedDate = new Date();

    // Update handover to mark it as finished
    const updatedHandover = await prismaDB2.tr_handover.update({
      where: { id: handoverId },
      data: {
        is_finished: true,
        finished_date: finishedDate,
        updated_at: finishedDate
      }
    });

    // Update all approval records with the finished date
    await prismaDB2.tr_handover_approval.updateMany({
      where: {
        handover_id: handoverId,
        status: "approved"
      },
      data: {
        finished_date: finishedDate
      }
    });

    console.log(`✅ Successfully marked handover ${handoverId} as finished`);

    // Send notification emails to all approvers requesting ratings
    // This could be handled by a background job or directly here
    try {
      await notifyApproversForRating(handoverId);
    } catch (emailError) {
      console.error(`⚠️ Error sending rating request emails:`, emailError);
      // Continue processing even if email fails
    }

    res.status(200).json({
      message: "Handover marked as finished successfully",
      data: {
        handover_id: handoverId,
        is_finished: true,
        finished_date: finishedDate
      }
    });

  } catch (error) {
    console.error("❌ Error marking handover as finished:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
    console.log("🔌 Database connection closed");
  }
};

/**
 * Helper function to send notification emails to all approvers requesting ratings
 */
async function notifyApproversForRating(handoverId: number): Promise<void> {
  try {
    // Get handover with approvals and related data
    const handover = await prismaDB2.tr_handover.findUnique({
      where: { id: handoverId },
      include: {
        tr_proposed_changes: true,
        tr_handover_approval: {
          where: {
            status: "approved"
          },
          include: {
            mst_authorization: true
          }
        }
      }
    });

    if (!handover) {
      console.warn(`Cannot send rating notifications: handover ${handoverId} not found`);
      return;
    }

    const projectName = handover.tr_proposed_changes?.project_name || "Handover Document";
    const docNumber = handover.doc_number || "No Document Number";
    const currentDate = new Date().toLocaleDateString('id-ID');

    // Send email to each approver
    for (const approval of handover.tr_handover_approval) {
      const approver = approval.mst_authorization;

      if (!approver || !approver.email) {
        console.warn(`Skipping rating notification for approval ${approval.id}: no valid email address`);
        continue;
      }

      const gender = getGenderTitle(approver.gender);
      const greeting = getGreeting();

      // Create and send the email
      const emailSubject = `[Go-Document] Mohon Berikan Penilaian untuk Handover ${projectName}`;
      const emailTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Go-Document System - Permintaan Penilaian</title>
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
          .highlight-box {
            background-color: #e8f4fd;
            border-left: 4px solid #17a2b8;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
          }
          .highlight-box p {
            color: #17a2b8;
            margin: 0;
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
          .rating-stars {
            font-size: 24px;
            display: flex;
            justify-content: center;
            margin: 20px 0;
          }
          .star {
            color: #FFD700;
            margin: 0 5px;
            cursor: pointer;
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
            <h1>Go-Document System - Permintaan Penilaian</h1>
          </div>
          
          <div class="content">
            <p>${greeting}</p>
            <p>Yth. ${gender} ${approver.employee_name || approver.employee_code},</p>
            
            <p>Dengan hormat,</p>
            <p>Proses handover berikut telah selesai dan siap untuk dinilai:</p>
            
            <div class="document-title">
              ${projectName} - ${docNumber}
            </div>
            
            <div class="highlight-box">
              <p><strong>Mohon berikan penilaian Anda</strong> untuk dokumen handover ini. Penilaian Anda sangat berarti bagi peningkatan kualitas proses handover di masa mendatang.</p>
            </div>
            
            <table class="main-info">
              <tr>
                <th width="35%">Tanggal Selesai</th>
                <td>${currentDate}</td>
              </tr>
              <tr>
                <th>Status</th>
                <td>Menunggu Penilaian</td>
              </tr>
            </table>
            
            <div class="button-container">
              <a href="http://localhost:4200/activity-page/handover-rating/${approval.id}" class="button">Berikan Penilaian Sekarang</a>
            </div>
            
            <p>Silakan berikan penilaian berdasarkan pengalaman Anda dalam proses handover ini. Penilaian berupa skala bintang (1-5) dan komentar/ulasan jika diperlukan.</p>
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

      // Send the email
      await sendEmail({
        to: approver.email,
        subject: emailSubject,
        html: emailTemplate
      });

      console.log(`✉️ Rating request email sent to ${approver.email}`);

      // Update the approval record to track the initial reminder
      await prismaDB2.tr_handover_approval.update({
        where: { id: approval.id },
        data: {
          last_rating_reminder_sent: new Date(),
          rating_reminder_count: 1
        }
      });
    }
  } catch (error) {
    console.error(`Error sending rating request emails:`, error);
    throw error;
  }
}