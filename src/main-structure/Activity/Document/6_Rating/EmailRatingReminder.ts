import { prismaDB2 } from "../../../../config/database";
import { sendEmail, getGenderTitle, getGreeting } from "../../Email/EmailServiceEnvironment/EmailServiceExport";
import { format, differenceInDays, addDays } from "date-fns";
import { id } from "date-fns/locale";

// Enum for tracking purposes
enum RatingReminderStage {
  INITIAL = 'initial',     // Right after marking as finished
  DAY_THREE = 'day_three', // 3 days after
  DAY_SEVEN = 'day_seven', // 7 days after
  FINAL = 'final'          // 10 days - final reminder
}

/**
 * Send an email to remind an approver to submit their rating
 */
async function sendRatingReminderEmail(
  approvalId: number,
  recipientEmail: string,
  recipientName: string,
  recipientGender: string,
  handoverId: number,
  projectName: string, 
  docNumber: string,
  reminderStage: RatingReminderStage
): Promise<boolean> {
  try {
    // Set email subject and urgency level based on reminder stage
    let emailSubject = `[Go-Document] Pengingat: Mohon Berikan Penilaian untuk Handover ${projectName}`;
    let urgencyLevel = "normal";
    let deadlineText = "";
    
    switch (reminderStage) {
      case RatingReminderStage.DAY_THREE:
        urgencyLevel = "medium";
        deadlineText = "Anda memiliki 7 hari lagi untuk memberikan penilaian.";
        break;
      case RatingReminderStage.DAY_SEVEN:
        emailSubject = `[Go-Document] PENTING: Penilaian Handover ${projectName} Belum Diberikan`;
        urgencyLevel = "high";
        deadlineText = "Anda memiliki 3 hari lagi untuk memberikan penilaian.";
        break;
      case RatingReminderStage.FINAL:
        emailSubject = `[Go-Document] MENDESAK: Batas Waktu Penilaian Handover ${projectName} Akan Berakhir`;
        urgencyLevel = "critical";
        deadlineText = "Ini adalah kesempatan terakhir Anda untuk memberikan penilaian. Sistem akan ditutup dalam 10 jam.";
        break;
      default:
        deadlineText = "Mohon berikan penilaian dalam 10 hari.";
    }

    // Create email content based on template
    const emailContent = createRatingReminderTemplate(
      recipientName,
      recipientGender,
      projectName,
      docNumber,
      urgencyLevel,
      deadlineText,
      handoverId
    );

    // Send email
    await sendEmail({
      to: recipientEmail,
      subject: emailSubject,
      html: emailContent
    });

    console.log(`✅ Rating reminder email (${reminderStage}) sent to: ${recipientEmail}`);
    return true;
  } catch (error) {
    console.error(`❌ Error sending rating reminder email to ${recipientEmail}:`, error);
    return false;
  }
}

/**
 * Get existing track record or create a new one
 */
async function getOrCreateRatingReminderTracking(handoverId: number, approvalId: number): Promise<any> {
  try {
    // See if tracking exists
    const existingTracking = await prismaDB2.email_tracking_handover.findFirst({
      where: {
        handover_id: handoverId,
        recipient_type: 'approver',
        status: 'approved',
        note_hash: `rating_reminder_${approvalId}` // Use unique identifier with approvalId
      }
    });

    if (existingTracking) {
      return existingTracking;
    }

    // If not exists, create a new one
    const newTracking = await prismaDB2.email_tracking_handover.create({
      data: {
        handover_id: handoverId,
        recipient_email: "pending", // Will be updated later
        recipient_type: 'approver',
        status: 'approved',
        note_hash: `rating_reminder_${approvalId}`,
        note_text: "Rating reminder tracking",
        is_success: false
      }
    });

    return newTracking;
  } catch (error) {
    console.error(`❌ Error tracking rating reminder:`, error);
    return null;
  }
}

/**
 * Create email template for rating reminders
 */
function createRatingReminderTemplate(
  recipientName: string,
  recipientGender: string,
  projectName: string,
  docNumber: string,
  urgencyLevel: string,
  deadlineText: string,
  handoverId: number
): string {
  const greeting = getGreeting();
  const currentDate = format(new Date(), "dd MMMM yyyy, HH:mm:ss", { locale: id });
  
  // CSS class for urgency levels
  let urgencyClass = "urgency-normal";
  let urgencyColor = "#17a2b8";
  let urgencyTitle = "Pengingat";
  
  if (urgencyLevel === "medium") {
    urgencyClass = "urgency-medium";
    urgencyColor = "#ffc107";
    urgencyTitle = "Penting";
  } else if (urgencyLevel === "high") {
    urgencyClass = "urgency-high";
    urgencyColor = "#fd7e14";
    urgencyTitle = "Sangat Penting";
  } else if (urgencyLevel === "critical") {
    urgencyClass = "urgency-critical";
    urgencyColor = "#dc3545";
    urgencyTitle = "Mendesak!";
  }
  
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Go-Document System - Pengingat Penilaian</title>
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
      .urgency-box {
        background-color: #f8f9fa;
        border-left: 4px solid ${urgencyColor};
        padding: 15px;
        margin: 25px 0;
        border-radius: 5px;
      }
      .urgency-title {
        margin-top: 0;
        color: ${urgencyColor};
        font-weight: 700;
        font-size: 18px;
      }
      .urgency-message {
        margin-bottom: 0;
        color: #555;
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
      .rating-box {
        background-color: #fff8e1;
        border: 1px solid #ffecb3;
        border-radius: 8px;
        padding: 20px;
        margin: 25px 0;
        text-align: center;
      }
      .star-icon {
        color: #ffc107;
        font-size: 24px;
        margin: 0 5px;
      }
      .rating-text {
        font-weight: 600;
        color: #856404;
        margin-top: 10px;
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
        <p>Yth. ${recipientGender} ${recipientName},</p>
        
        <div class="urgency-box ${urgencyClass}">
          <h3 class="urgency-title">${urgencyTitle}</h3>
          <p class="urgency-message">Anda belum memberikan penilaian untuk dokumen handover yang telah selesai. ${deadlineText}</p>
        </div>
        
        <p>Dengan hormat,</p>
        <p>Kami mengingatkan bahwa dokumen handover untuk <strong>${projectName}</strong> - (<strong>${docNumber}</strong>) telah selesai diproses dan menunggu penilaian dari Anda sebagai approver.</p>
        
        <div class="document-title">
          ${projectName} - ${docNumber}
        </div>
        
        <div class="rating-box">
          <p>Berikan penilaian Anda dengan skala 1-5:</p>
          <div>
            <span class="star-icon">★</span>
            <span class="star-icon">★</span>
            <span class="star-icon">★</span>
            <span class="star-icon">★</span>
            <span class="star-icon">★</span>
          </div>
          <p class="rating-text">Penilaian Anda sangat berharga untuk peningkatan kualitas!</p>
        </div>
        
        <div class="button-container">
          <a href="http://localhost:4200/activity-page/handover-rating/${handoverId}" class="button">Berikan Penilaian Sekarang</a>
        </div>
        
        <p>Terima kasih atas perhatian dan kerjasama Anda.</p>
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

/**
 * Process and send rating reminders for approvers who haven't rated yet
 * This should be called by a scheduled job
 */
export async function processRatingReminders(): Promise<void> {
  try {
    console.log("🔍 Starting to process rating reminders");
    const now = new Date();
    
    // Find handovers marked as finished but still need ratings
    const finishedHandovers = await prismaDB2.tr_handover.findMany({
      where: {
        is_finished: true,
        // Ensure star rating isn't set yet
        star: null
      },
      include: {
        tr_proposed_changes: {
          select: {
            project_name: true
          }
        },
        tr_handover_approval: {
          include: {
            mst_authorization: true
          },
          // Only include approvals with 'approved' status that haven't submitted a rating yet
          where: {
            status: 'approved',
            rating: null
          }
        }
      }
    });
    
    console.log(`📋 Found ${finishedHandovers.length} finished handovers that need ratings`);
    
    // Process each handover
    for (const handover of finishedHandovers) {
      const handoverId = handover.id;
      const finishedDate = handover.finished_date || handover.updated_at || now;
      const projectName = handover.tr_proposed_changes?.project_name || "Handover Document";
      const docNumber = handover.doc_number || "No Doc Number";
      
      console.log(`📝 Processing handover ID: ${handoverId}, Project: ${projectName}`);
      
      // Process each approval that needs rating
      for (const approval of handover.tr_handover_approval) {
        const approvalId = approval.id;
        const approver = approval.mst_authorization;
        
        if (!approver || !approver.email) {
          console.log(`⚠️ Approver with ID ${approval.auth_id} has no email, skipping`);
          continue;
        }
        
        const recipientEmail = approver.email;
        const recipientName = approver.employee_name || approver.employee_code || "Unknown";
        const recipientGender = getGenderTitle(approver.gender);
        
        console.log(`👤 Processing approver: ${recipientName} (${recipientEmail})`);
        
        // Use the last_rating_reminder_sent field directly from the approval
        const lastReminderSent = approval.last_rating_reminder_sent;
        const reminderCount = approval.rating_reminder_count || 0;
        
        // Calculate days since the handover was marked as finished
        const daysSinceFinished = differenceInDays(now, finishedDate);
        console.log(`⏱️ Days since finished: ${daysSinceFinished}`);
        
        // Calculate days since last reminder (if any)
        const daysSinceLastReminder = lastReminderSent 
          ? differenceInDays(now, lastReminderSent)
          : null;
        
        if (daysSinceLastReminder !== null) {
          console.log(`⏱️ Days since last reminder: ${daysSinceLastReminder}`);
        }
        
        // Determine which reminder to send based on reminder count and days passed
        let reminderStage: RatingReminderStage | null = null;
        let shouldSendReminder = false;
        
        // Initial reminder (only if no reminders have been sent yet)
        if (reminderCount === 0) {
          reminderStage = RatingReminderStage.INITIAL;
          shouldSendReminder = true;
        }
        // Day 3 reminder (only if it's been at least 3 days since finished, and at least 3 days since last reminder)
        else if (reminderCount === 1 && daysSinceFinished >= 3 && 
                (daysSinceLastReminder === null || daysSinceLastReminder >= 3)) {
          reminderStage = RatingReminderStage.DAY_THREE;
          shouldSendReminder = true;
        }
        // Day 7 reminder (only if it's been at least 7 days since finished, and at least 4 days since last reminder)
        else if (reminderCount === 2 && daysSinceFinished >= 7 && 
                (daysSinceLastReminder === null || daysSinceLastReminder >= 4)) {
          reminderStage = RatingReminderStage.DAY_SEVEN;
          shouldSendReminder = true;
        }
        // Final reminder (only if it's been at least 9.5 days since finished, and at least 2 days since last reminder)
        else if (reminderCount === 3 && daysSinceFinished >= 9.5 && 
                (daysSinceLastReminder === null || daysSinceLastReminder >= 2)) {
          reminderStage = RatingReminderStage.FINAL;
          shouldSendReminder = true;
        }
        
        // Send reminder if needed
        if (shouldSendReminder && reminderStage) {
          console.log(`📧 Sending ${reminderStage} reminder (count: ${reminderCount + 1}) to ${recipientEmail}`);
          
          const emailSent = await sendRatingReminderEmail(
            approvalId,
            recipientEmail,
            recipientName,
            recipientGender,
            handoverId,
            projectName,
            docNumber,
            reminderStage
          );
          
          // Update approval record with new reminder info directly
          if (emailSent) {
            await prismaDB2.tr_handover_approval.update({
              where: { id: approvalId },
              data: {
                last_rating_reminder_sent: new Date(),
                rating_reminder_count: reminderCount + 1
              }
            });
            
            // Also create a tracking record for audit purposes
            await getOrCreateRatingReminderTracking(handoverId, approvalId);
            
            console.log(`✅ Updated approval record with reminder info: count=${reminderCount + 1}`);
          }
        } else {
          if (reminderCount >= 4) {
            console.log(`⏭️ Maximum reminders (${reminderCount}) already sent to ${recipientEmail}`);
          } else {
            console.log(`⏭️ No reminder needed at this time for ${recipientEmail} (count: ${reminderCount})`);
          }
        }
      }
    }
    
    console.log("✅ Finished processing rating reminders");
  } catch (error) {
    console.error("❌ Error processing rating reminders:", error);
  }
}

/**
 * Mark a handover as finished and trigger initial rating reminders
 */
export async function markHandoverAsFinished(handoverId: number, updatedBy: string): Promise<boolean> {
  try {
    console.log(`🔍 Marking handover ID ${handoverId} as finished`);
    
    // Update handover status
    await prismaDB2.tr_handover.update({
      where: { id: handoverId },
      data: {
        is_finished: true,
        finished_date: new Date(),
        updated_at: new Date(),
        updated_by: updatedBy
      }
    });
    
    console.log(`✅ Handover ID ${handoverId} marked as finished`);
    
    // Trigger immediate processing of rating reminders for this handover
    // This is more efficient than waiting for the scheduled job
    const handover = await prismaDB2.tr_handover.findUnique({
      where: { id: handoverId },
      include: {
        tr_proposed_changes: {
          select: {
            project_name: true
          }
        },
        tr_handover_approval: {
          where: {
            status: 'approved',
            rating: null
          },
          include: {
            mst_authorization: true
          }
        }
      }
    });
    
    if (!handover) {
      console.error(`❌ Handover ID ${handoverId} not found after updating`);
      return false;
    }
    
    const projectName = handover.tr_proposed_changes?.project_name || "Handover Document";
    const docNumber = handover.doc_number || "No Doc Number";
    
    // Send initial reminder to all approved approvers who haven't rated yet
    const approvalsNeedingRating = handover.tr_handover_approval;
    
    console.log(`👤 Sending initial rating reminders to ${approvalsNeedingRating.length} approvers`);
    
    for (const approval of approvalsNeedingRating) {
      const approvalId = approval.id;
      const approver = approval.mst_authorization;
      
      if (!approver || !approver.email) {
        console.log(`⚠️ Approver with ID ${approval.auth_id} has no email, skipping`);
        continue;
      }
      
      const recipientEmail = approver.email;
      const recipientName = approver.employee_name || approver.employee_code || "Unknown";
      const recipientGender = getGenderTitle(approver.gender);
      
      // Send initial reminder
      console.log(`📧 Sending initial reminder to ${recipientEmail}`);
      const emailSent = await sendRatingReminderEmail(
        approvalId,
        recipientEmail,
        recipientName,
        recipientGender,
        handoverId,
        projectName,
        docNumber,
        RatingReminderStage.INITIAL
      );
      
      // Update approval with reminder info
      if (emailSent) {
        await prismaDB2.tr_handover_approval.update({
          where: { id: approvalId },
          data: {
            last_rating_reminder_sent: new Date(),
            rating_reminder_count: 1
          }
        });
        
        // Also create tracking record
        await getOrCreateRatingReminderTracking(handoverId, approvalId);
        
        console.log(`✅ Updated approval record with initial reminder info`);
      }
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Error marking handover ${handoverId} as finished:`, error);
    return false;
  }
}

/**
 * Submit a rating for a handover approval
 */
export async function submitHandoverRating(
  approvalId: number, 
  rating: number, 
  review: string
): Promise<boolean> {
  try {
    console.log(`🔍 Submitting rating ${rating} for approval ID ${approvalId}`);
    
    // Validate rating
    if (rating < 1 || rating > 5) {
      console.error(`❌ Invalid rating value: ${rating}. Must be between 1-5.`);
      return false;
    }
    
    // Update the approval with rating and review
    await prismaDB2.tr_handover_approval.update({
      where: { id: approvalId },
      data: {
        rating,
        review,
        updated_date: new Date()
      }
    });
    
    console.log(`✅ Rating submitted for approval ID ${approvalId}`);
    
    // Get the handover approval details
    const approval = await prismaDB2.tr_handover_approval.findUnique({
      where: { id: approvalId },
      include: {
        tr_handover: true
      }
    });
    
    if (!approval || !approval.tr_handover) {
      console.error(`❌ Approval or handover not found for approval ID ${approvalId}`);
      return false;
    }
    
    const handoverId = approval.tr_handover.id;
    
    // Check if all approvers have submitted ratings
    const allApprovals = await prismaDB2.tr_handover_approval.findMany({
      where: {
        handover_id: handoverId,
        status: 'approved'
      }
    });
    
    const allRated = allApprovals.every(a => a.rating !== null && a.rating !== undefined);
    
    // If all approvers have rated, calculate the average and update the handover
    if (allRated) {
      console.log(`✅ All approvers have submitted ratings for handover ID ${handoverId}`);
      
      // Calculate average rating
      const totalRating = allApprovals.reduce((sum, a) => sum + (a.rating || 0), 0);
      const averageRating = Math.round(totalRating / allApprovals.length);
      
      // Update handover with final rating
      await prismaDB2.tr_handover.update({
        where: { id: handoverId },
        data: {
          star: averageRating,
          updated_at: new Date()
        }
      });
      
      console.log(`🌟 Final average rating ${averageRating} set for handover ID ${handoverId}`);
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Error submitting rating for approval ID ${approvalId}:`, error);
    return false;
  }
}

export { RatingReminderStage };