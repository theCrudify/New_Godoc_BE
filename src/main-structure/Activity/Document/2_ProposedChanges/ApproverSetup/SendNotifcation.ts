// src/main-structure/Activity/Document/2_ProposedChanges/ApproverChangeController.ts

import { prismaDB2 } from '../../../../../config/database';
import { sendEmail } from '../../../Email/EmailServiceEnvironment/EmailServiceExport'
// Create this as a separate file: src/main-structure/Activity/Email/ApproverChangeEmail.ts
// Then import these functions in your ApproverChangeController.ts




/**
 * Send email notification when approver change request is submitted
 */
/**
 * Send email notification when approver change request is submitted
 */
export const sendApproverChangeRequestEmail = async (changeRequest: any, requesterDepartmentId?: number) => {
  try {
    console.log('📧 Sending approver change request email notification');
    console.log('🔍 DEBUG: Requester department_id:', requesterDepartmentId);

    const projectName = changeRequest.tr_proposed_changes?.project_name || 'Unknown Project';
    const requestId = changeRequest.id;
    const fromApprover = changeRequest.mst_authorization_tr_approver_change_request_current_auth_idTomst_authorization?.employee_name || 'Unknown';
    const toApprover = changeRequest.mst_authorization_tr_approver_change_request_new_auth_idTomst_authorization?.employee_name || 'Unknown';
    const requester = changeRequest.mst_authorization_tr_approver_change_request_requester_auth_idTomst_authorization?.employee_name || 'Unknown';
    const reason = changeRequest.reason;
    const urgent = changeRequest.urgent;
    const step = changeRequest.tr_proposed_changes_approval_tr_approver_change_request_approval_idTotr_proposed_changes_approval?.step || 'Unknown';
    const actor = changeRequest.tr_proposed_changes_approval_tr_approver_change_request_approval_idTotr_proposed_changes_approval?.actor || 'Unknown';

    // Get admin emails (Super Admin + Admin with same department)
    const adminEmails = await getAdminEmails(requesterDepartmentId);
    
    if (adminEmails.length === 0) {
      console.warn('⚠️ WARNING: No admin emails found! Cannot send notification.');
      return;
    }

    console.log('🔍 DEBUG: Will send emails to:', adminEmails);
    
    const subject = urgent 
      ? `[URGENT] Request Perubahan Approver - ${projectName} (Request #${requestId})`
      : `Request Perubahan Approver - ${projectName} (Request #${requestId})`;

    const emailTemplate = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #333; margin-bottom: 20px;">
            ${urgent ? '🚨 ' : '📋 '}Request Perubahan Approver
          </h2>
          
          <div style="background-color: white; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
            <h3 style="color: #007bff; margin-top: 0;">Detail Request</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; width: 30%;">Request ID:</td>
                <td style="padding: 8px 0;">#${requestId}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Project:</td>
                <td style="padding: 8px 0;">${projectName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Diajukan oleh:</td>
                <td style="padding: 8px 0;">${requester}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Step Approval:</td>
                <td style="padding: 8px 0;">Step ${step} (${actor})</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Dari Approver:</td>
                <td style="padding: 8px 0;">${fromApprover}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Ke Approver:</td>
                <td style="padding: 8px 0;"><strong style="color: #28a745;">${toApprover}</strong></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Prioritas:</td>
                <td style="padding: 8px 0;">
                  <span style="background-color: ${urgent ? '#dc3545' : '#6c757d'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                    ${urgent ? 'URGENT' : 'NORMAL'}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; vertical-align: top;">Alasan:</td>
                <td style="padding: 8px 0;">${reason}</td>
              </tr>
            </table>
          </div>

          <div style="background-color: #e9ecef; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
            <p style="margin: 0; color: #495057;">
              <strong>Tindakan Diperlukan:</strong><br>
              Silakan review dan proses request perubahan approver ini melalui sistem Go-Document.
            </p>
          </div>

          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #6c757d; font-size: 12px; margin: 0;">
              Email ini dikirim otomatis oleh sistem Go-Document.<br>
              Tanggal: ${new Date().toLocaleString('id-ID')}
            </p>
          </div>
        </div>
      </div>
    `;

    // Send to each admin
    let successCount = 0;
    for (const adminEmail of adminEmails) {
      if (adminEmail) {
        try {
          await sendEmail({
            to: adminEmail,
            subject,
            html: emailTemplate
          });
          console.log(`✅ Request email sent to admin: ${adminEmail}`);
          successCount++;
        } catch (emailError) {
          console.error(`❌ Failed to send email to ${adminEmail}:`, emailError);
        }
      }
    }

    console.log(`📧 Email sending completed. Success: ${successCount}/${adminEmails.length}`);

    // Log the notification
    await prismaDB2.tr_notification_log.create({
      data: {
        notification_type: 'approver_change_request',
        recipients: adminEmails.filter(Boolean),
        sent_count: successCount,
        urgent: urgent,
        related_id: changeRequest.id,
        details: {
          request_id: changeRequest.id,
          project_name: projectName,
          from_approver: fromApprover,
          to_approver: toApprover,
          requester: requester,
          requester_department_id: requesterDepartmentId,
          reason: reason
        }
      }
    });

  } catch (error) {
    console.error('❌ Error sending approver change request email:', error);
    throw error;
  }
};

/**
 * Send email notification when approver change request is processed (approved/rejected)
 */
export const sendApproverChangeResultEmail = async (
  changeRequest: any, 
  status: 'approved' | 'rejected', 
  adminDecision: string
) => {
  try {
    console.log(`📧 Sending approver change result email (${status})`);

    const projectName = changeRequest.tr_proposed_changes?.project_name || 'Unknown Project';
    const requestId = changeRequest.id;
    const fromApprover = changeRequest.mst_authorization_tr_approver_change_request_current_auth_idTomst_authorization?.employee_name || 'Unknown';
    const toApprover = changeRequest.mst_authorization_tr_approver_change_request_new_auth_idTomst_authorization?.employee_name || 'Unknown';
    const requesterEmail = changeRequest.mst_authorization_tr_approver_change_request_requester_auth_idTomst_authorization?.email;
    const requesterName = changeRequest.mst_authorization_tr_approver_change_request_requester_auth_idTomst_authorization?.employee_name || 'Unknown';
    const reason = changeRequest.reason;
    const step = changeRequest.tr_proposed_changes_approval_tr_approver_change_request_approval_idTotr_proposed_changes_approval?.step || 'Unknown';
    const actor = changeRequest.tr_proposed_changes_approval_tr_approver_change_request_approval_idTotr_proposed_changes_approval?.actor || 'Unknown';

    if (!requesterEmail) {
      console.log('⚠️ No requester email found, skipping notification');
      return;
    }

    const isApproved = status === 'approved';
    const subject = `Request Perubahan Approver ${isApproved ? 'DISETUJUI' : 'DITOLAK'} - ${projectName} (Request #${requestId})`;

    const emailTemplate = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #333; margin-bottom: 20px;">
            ${isApproved ? '✅' : '❌'} Request Perubahan Approver ${isApproved ? 'Disetujui' : 'Ditolak'}
          </h2>
          
          <div style="background-color: white; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
            <h3 style="color: #007bff; margin-top: 0;">Detail Request</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; width: 30%;">Request ID:</td>
                <td style="padding: 8px 0;">#${requestId}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Project:</td>
                <td style="padding: 8px 0;">${projectName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Step Approval:</td>
                <td style="padding: 8px 0;">Step ${step} (${actor})</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Dari Approver:</td>
                <td style="padding: 8px 0;">${fromApprover}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Ke Approver:</td>
                <td style="padding: 8px 0;"><strong style="color: #28a745;">${toApprover}</strong></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Alasan Request:</td>
                <td style="padding: 8px 0;">${reason}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Status:</td>
                <td style="padding: 8px 0;">
                  <span style="background-color: ${isApproved ? '#28a745' : '#dc3545'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                    ${isApproved ? 'DISETUJUI' : 'DITOLAK'}
                  </span>
                </td>
              </tr>
            </table>
          </div>

          <div style="background-color: ${isApproved ? '#d4edda' : '#f8d7da'}; padding: 15px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid ${isApproved ? '#28a745' : '#dc3545'};">
            <h4 style="margin: 0 0 10px 0; color: ${isApproved ? '#155724' : '#721c24'};">Keputusan Admin:</h4>
            <p style="margin: 0; color: ${isApproved ? '#155724' : '#721c24'};">${adminDecision}</p>
          </div>

          ${isApproved ? `
          <div style="background-color: #d1ecf1; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
            <p style="margin: 0; color: #0c5460;">
              <strong>Informasi:</strong><br>
              Approver untuk step ${step} (${actor}) telah berhasil diubah ke <strong>${toApprover}</strong>.
              Proses approval dapat dilanjutkan dengan approver yang baru.
            </p>
          </div>
          ` : `
          <div style="background-color: #f8d7da; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
            <p style="margin: 0; color: #721c24;">
              <strong>Informasi:</strong><br>
              Request perubahan approver ditolak. Approver tetap <strong>${fromApprover}</strong>.
              Anda dapat mengajukan request baru dengan alasan yang lebih detail jika diperlukan.
            </p>
          </div>
          `}

          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #6c757d; font-size: 12px; margin: 0;">
              Email ini dikirim otomatis oleh sistem Go-Document.<br>
              Tanggal: ${new Date().toLocaleString('id-ID')}
            </p>
          </div>
        </div>
      </div>
    `;

    await sendEmail({
      to: requesterEmail,
      subject,
      html: emailTemplate
    });

    console.log(`✅ Result email sent to requester: ${requesterEmail}`);

  } catch (error) {
    console.error('❌ Error sending approver change result email:', error);
    throw error;
  }
};

/**
 * Send email notifications when admin performs bypass operation
 */
export const sendBypassNotificationEmails = async (
  proposedChange: any,
  affectedApprovals: any[],
  bypassReason: string,
  adminUser: any
) => {
  try {
    console.log('📧 Sending bypass notification emails to affected approvers');

    const projectName = proposedChange.project_name || 'Unknown Project';
    const adminName = adminUser?.employee_name || 'System Admin';
    const bypassDate = new Date().toLocaleString('id-ID');

    const subject = `[URGENT] Sistem Approval Di-bypass - ${projectName}`;

    // Send email to each affected approver
    for (const approval of affectedApprovals) {
      const approverEmail = approval.authorization?.email;
      const approverName = approval.authorization?.employee_name || 'Unknown';

      if (!approverEmail) {
        console.log(`⚠️ No email found for approver: ${approverName}`);
        continue;
      }

      const emailTemplate = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h2 style="color: #dc3545; margin-bottom: 20px;">
              🚨 Pemberitahuan: Sistem Approval Di-bypass
            </h2>
            
            <div style="background-color: white; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
              <h3 style="color: #007bff; margin-top: 0;">Detail Bypass</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; width: 30%;">Project:</td>
                  <td style="padding: 8px 0;">${projectName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Approver:</td>
                  <td style="padding: 8px 0;">${approverName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Step:</td>
                  <td style="padding: 8px 0;">Step ${approval.step} (${approval.actor})</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Status Sebelum:</td>
                  <td style="padding: 8px 0;">
                    <span style="background-color: #ffc107; color: #212529; padding: 2px 6px; border-radius: 3px; font-size: 12px;">
                      ${approval.status?.toUpperCase() || 'PENDING'}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Status Sekarang:</td>
                  <td style="padding: 8px 0;">
                    <span style="background-color: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">
                      APPROVED (BYPASS)
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Di-bypass oleh:</td>
                  <td style="padding: 8px 0;"><strong>${adminName}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Tanggal:</td>
                  <td style="padding: 8px 0;">${bypassDate}</td>
                </tr>
              </table>
            </div>

            <div style="background-color: #fff3cd; padding: 15px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
              <h4 style="margin: 0 0 10px 0; color: #856404;">Alasan Bypass:</h4>
              <p style="margin: 0; color: #856404;">${bypassReason}</p>
            </div>

            <div style="background-color: #d1ecf1; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
              <p style="margin: 0; color: #0c5460;">
                <strong>Informasi:</strong><br>
                Sistem approval untuk project ini telah di-bypass oleh Super Admin. 
                Approval Anda tidak lagi diperlukan untuk project ini. 
                Project telah otomatis disetujui dan dapat dilanjutkan.
              </p>
            </div>

            <div style="text-align: center; margin-top: 20px;">
              <p style="color: #6c757d; font-size: 12px; margin: 0;">
                Email ini dikirim otomatis oleh sistem Go-Document.<br>
                Jika ada pertanyaan, silakan hubungi administrator sistem.
              </p>
            </div>
          </div>
        </div>
      `;

      await sendEmail({
        to: approverEmail,
        subject,
        html: emailTemplate
      });

      console.log(`✅ Bypass notification sent to: ${approverEmail} (${approverName})`);
    }

    // Also send summary email to requester/submitter if available
    const submitterEmail = proposedChange.mst_authorization?.email;
    if (submitterEmail) {
      const submitterTemplate = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h2 style="color: #28a745; margin-bottom: 20px;">
              ✅ Project Anda Telah Disetujui (Bypass)
            </h2>
            
            <div style="background-color: white; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
              <h3 style="color: #007bff; margin-top: 0;">Detail Project</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; width: 30%;">Project:</td>
                  <td style="padding: 8px 0;">${projectName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Status:</td>
                  <td style="padding: 8px 0;">
                    <span style="background-color: #28a745; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                      APPROVED (BYPASS)
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Disetujui oleh:</td>
                  <td style="padding: 8px 0;">${adminName} (Super Admin)</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Tanggal:</td>
                  <td style="padding: 8px 0;">${bypassDate}</td>
                </tr>
              </table>
            </div>

            <div style="background-color: #d4edda; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
              <p style="margin: 0; color: #155724;">
                <strong>Selamat!</strong><br>
                Project Anda telah disetujui melalui bypass system oleh Super Admin. 
                Anda dapat melanjutkan ke tahap berikutnya sesuai prosedur yang berlaku.
              </p>
            </div>

            <div style="text-align: center; margin-top: 20px;">
              <p style="color: #6c757d; font-size: 12px; margin: 0;">
                Email ini dikirim otomatis oleh sistem Go-Document.
              </p>
            </div>
          </div>
        </div>
      `;

      await sendEmail({
        to: submitterEmail,
        subject: `✅ Project Disetujui (Bypass) - ${projectName}`,
        html: submitterTemplate
      });

      console.log(`✅ Bypass notification sent to submitter: ${submitterEmail}`);
    }

  } catch (error) {
    console.error('❌ Error sending bypass notification emails:', error);
    throw error;
  }
};


/**
 * Helper function to get admin emails from database
 * - All Super Admin (regardless of department)
 * - Admin with same department_id as requester
 */
const getAdminEmails = async (requester_department_id?: number): Promise<string[]> => {
  try {
    console.log('🔍 DEBUG: Getting admin emails for department_id:', requester_department_id);
    
    const whereConditions = {
      AND: [
        {
          status: true,
          is_deleted: false,
          email: {
            not: null
          }
        },
        {
          OR: [
            // All Super Admin (no department filter)
            {
              role: {
                role_name: 'Super Admin'
              }
            },
            // Admin with same department as requester (only if department_id provided)
            ...(requester_department_id ? [{
              AND: [
                {
                  role: {
                    role_name: 'Admin'
                  }
                },
                {
                  department_id: requester_department_id
                }
              ]
            }] : [])
          ]
        }
      ]
    };

    const admins = await prismaDB2.mst_authorization.findMany({
      where: whereConditions,
      include: {
        role: {
          select: {
            role_name: true
          }
        },
        department: {
          select: {
            department_name: true
          }
        }
      }
    });

    console.log('🔍 DEBUG: Found admins:', admins.map(admin => ({
      name: admin.employee_name,
      email: admin.email,
      role: admin.role?.role_name,
      department: admin.department?.department_name,
      department_id: admin.department_id
    })));
    
    console.log('🔍 DEBUG: Admin count:', admins.length);

    const emails = admins.map(admin => admin.email).filter(Boolean) as string[];
    console.log('🔍 DEBUG: Valid admin emails:', emails);

    return emails;
  } catch (error) {
    console.error('❌ Error getting admin emails:', error);
    return [];
  }
};
