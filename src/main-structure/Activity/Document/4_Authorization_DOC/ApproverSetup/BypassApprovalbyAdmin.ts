// FILE: src/main-structure/Activity/Document/3_Authorization/ApproverSetup/BypassApprovalbyAdminAuthdoc.ts
// UPDATED BYPASS APPROVAL CONTROLLER FOR AUTHORIZATION DOCUMENTS
// Compatible with updated database schema

import { Request, Response } from 'express';
import { prismaDB2 } from '../../../../../config/database';
import { sendBypassNotificationEmailsAuthdoc } from './SendNotificationAuthdoc';

// Interface for the authenticated user, reflecting the actual JWT structure
interface AuthenticatedUser {
  auth_id: number;
  nik: string;
  name: string;
  email: string;
  role: {
    id: number;
    role_name: string;
    description: string;
  };
  department: any;
  site: any;
  section: any;
  // Legacy fields for backward compatibility
  employee_code?: string;
  employee_name?: string;
  user_role?: string;
}

// Extend Request to include the user object
interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export const adminBypassApprovalAuthdoc = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      authorization_doc_id,
      target_status,
      reason,
      bypass_type = "approval_system"
    } = req.body;

    // Get user data with fallbacks for various structures
    const admin_auth_id = req.user?.auth_id;
    const userRole = getUserRole(req.user);
    const employeeName = getEmployeeName(req.user);
    const employeeCode = getEmployeeCode(req.user);

    // DEBUG LOGGING - to ensure data is received correctly
    console.log("ADMIN BYPASS AUTHDOC DEBUG: Incoming request body:", req.body);
    console.log("ADMIN BYPASS AUTHDOC DEBUG: Extracted values:", { authorization_doc_id, target_status, reason, bypass_type });
    console.log("ADMIN BYPASS AUTHDOC DEBUG: Authenticated user info:", req.user);
    console.log("ADMIN BYPASS AUTHDOC DEBUG: Extracted user role:", userRole);
    console.log("ADMIN BYPASS AUTHDOC DEBUG: Extracted employee name:", employeeName);
    console.log("ADMIN BYPASS AUTHDOC DEBUG: Extracted employee code:", employeeCode);

    // Validate input fields
    if (!authorization_doc_id || !target_status || !reason) {
      console.warn("ADMIN BYPASS AUTHDOC ERROR: Missing required fields in request body.", { authorization_doc_id, target_status, reason });
      res.status(400).json({
        error: "Missing required fields",
        required: ["authorization_doc_id", "target_status", "reason"]
      });
      return;
    }

    // Validate target status for the two bypass strategies
    if (!['approved', 'done'].includes(target_status)) {
      console.warn("ADMIN BYPASS AUTHDOC ERROR: Invalid target_status.", { target_status });
      res.status(400).json({
        error: "Target status must be 'approved' (partial bypass) or 'done' (full complete)"
      });
      return;
    }

    // Validate super admin role using various user structures
    if (userRole !== 'Super Admin') {
      console.warn("ADMIN BYPASS AUTHDOC ERROR: Unauthorized attempt by non-Super Admin.", {
        user_role: userRole,
        auth_id: admin_auth_id,
        full_user_object: req.user
      });
      res.status(403).json({
        error: "Unauthorized: Super admin access required for bypass operation"
      });
      return;
    }

    // Fetch the authorization document details with UPDATED relation names
    const authDoc = await prismaDB2.tr_authorization_doc.findUnique({
      where: { id: authorization_doc_id },
      include: {
        authdocApprovals: {
          include: {
            authorization: {
              select: {
                employee_name: true,
                employee_code: true,
                email: true
              }
            }
          },
          orderBy: { step: 'asc' }
        },
        authorizationPlant: {
          select: { plant_name: true }
        },
        department: {
          select: { department_name: true }
        }
      }
    });

    // Check if authorization document exists
    if (!authDoc) {
      console.warn("ADMIN BYPASS AUTHDOC ERROR: Authorization document not found.", { authorization_doc_id });
      res.status(404).json({ error: "Authorization document tidak ditemukan" });
      return;
    }

    // Check if authorization document status allows bypass
    if (authDoc.status === 'done' && authDoc.progress === '100%') {
      console.warn("ADMIN BYPASS AUTHDOC ERROR: Authorization document already completed.", {
        authorization_doc_id,
        status: authDoc.status,
        progress: authDoc.progress
      });
      res.status(400).json({
        error: `Authorization document sudah dalam status ${authDoc.status} dengan progress 100%`
      });
      return;
    }

    const bypassTimestamp = new Date();
    const originalStatus = authDoc.status;
    const originalProgress = authDoc.progress;

    // Initialize variables for bypass strategy
    let finalDocumentStatus: string = '';
    let newProgress: string = '';
    let affectedApprovals: any[] = []; // Approvals that are directly set to 'approved'
    let bypassStrategy: string = '';
    let approvalUpdateFilter: any = {};
    let transitionedApprover: any = null; // To store info about the newly transitioned approver

    // Determine bypass strategy based on target_status
    if (target_status === 'approved') {
      // PARTIAL BYPASS: Only bypass currently 'on_going' approvals
      bypassStrategy = 'partial';
      finalDocumentStatus = 'on_progress'; // Document status remains on_progress

      const onGoingApprovals = authDoc.authdocApprovals.filter(approval =>
        approval.status === 'on_going'
      );

      const approvedCount = authDoc.authdocApprovals.filter(approval =>
        approval.status === 'approved'
      ).length;

      const totalApprovals = authDoc.authdocApprovals.length;

      // Calculate new progress based on already approved + newly bypassed (on_going) steps
      const progressPercentage = Math.round(((approvedCount + onGoingApprovals.length) / totalApprovals) * 100);
      newProgress = `${progressPercentage}%`;

      affectedApprovals = onGoingApprovals; // These are the ones whose status will directly become 'approved'
      approvalUpdateFilter = { status: 'on_going' }; // Only update 'on_going' approvals

      console.log("ADMIN BYPASS AUTHDOC INFO: PARTIAL BYPASS strategy selected", {
        strategy: bypassStrategy,
        onGoingCount: onGoingApprovals.length,
        approvedCount,
        totalApprovals,
        calculatedProgress: newProgress
      });

      // Validate: Ensure there are 'on_going' approvals to bypass for a partial bypass
      if (onGoingApprovals.length === 0) {
        console.warn("ADMIN BYPASS AUTHDOC ERROR: No on_going approvals found for partial bypass.", { authorization_doc_id });
        res.status(400).json({
          error: "Tidak ada approval yang sedang berjalan (on_going) untuk di-bypass secara partial"
        });
        return;
      }

    } else if (target_status === 'done') {
      // FULL BYPASS: Bypass all 'pending' and 'on_going' approvals
      bypassStrategy = 'full';
      finalDocumentStatus = 'done'; // Document status becomes done
      newProgress = '100%';

      affectedApprovals = authDoc.authdocApprovals.filter(approval =>
        ['pending', 'on_going'].includes(approval.status || '')
      );
      approvalUpdateFilter = { status: { in: ['pending', 'on_going'] } }; // Update 'pending' + 'on_going'

      console.log("ADMIN BYPASS AUTHDOC INFO: FULL BYPASS strategy selected", {
        strategy: bypassStrategy,
        affectedCount: affectedApprovals.length
      });

      // Validate: Ensure there are approvals to bypass
      if (affectedApprovals.length === 0) {
        console.warn("ADMIN BYPASS AUTHDOC ERROR: No pending/on_going approvals found for full bypass.", { authorization_doc_id });
        res.status(400).json({
          error: "Tidak ada approval yang pending atau on_going untuk di-bypass"
        });
        return;
      }
    } else {
      // This should ideally not be reached due to previous validation
      console.error("ADMIN BYPASS AUTHDOC ERROR: Invalid target_status after validation.", { target_status });
      res.status(400).json({
        error: "Invalid target_status provided"
      });
      return;
    }

    console.log("ADMIN BYPASS AUTHDOC INFO: Starting database operations for authorization_doc_id:", authorization_doc_id);
    console.log("ADMIN BYPASS AUTHDOC INFO: Bypass strategy details:", {
      target_status,
      bypass_strategy: bypassStrategy,
      final_document_status: finalDocumentStatus,
      new_progress: newProgress,
      affected_approvals_count: affectedApprovals.length,
      approval_update_filter: approvalUpdateFilter
    });

    // Update the main authorization document status and progress
    await prismaDB2.tr_authorization_doc.update({
      where: { id: authorization_doc_id },
      data: {
        status: finalDocumentStatus,
        progress: newProgress,
        updated_at: bypassTimestamp
      }
    });
    console.log("ADMIN BYPASS AUTHDOC INFO: Authorization document status updated.", {
      newStatus: finalDocumentStatus,
      newProgress: newProgress
    });

    // Update affected approvals (those directly bypassed to 'approved') - USING UPDATED TABLE
    if (affectedApprovals.length > 0) {
      await prismaDB2.tr_authdoc_approval.updateMany({
        where: {
          authdoc_id: authorization_doc_id,
          ...approvalUpdateFilter
        },
        data: {
          status: 'approved',
          updated_date: bypassTimestamp,
          // ADD NOTE to indicate this was bypassed
          note: `Bypassed by super admin (${employeeName}) - ${bypassStrategy} bypass: ${reason}`
        }
      });
      console.log("ADMIN BYPASS AUTHDOC INFO: Affected approvals updated to 'approved'.", {
        count: affectedApprovals.length,
        strategy: bypassStrategy,
        filter: approvalUpdateFilter
      });
    } else {
      console.log("ADMIN BYPASS AUTHDOC INFO: No approvals found to update for strategy:", bypassStrategy);
    }

    // --- NEW LOGIC FOR PARTIAL BYPASS: Transition next pending to on_going ---
    if (bypassStrategy === 'partial') {
      // Re-fetch approvals to get their updated statuses after the previous updateMany
      const updatedApprovals = await prismaDB2.tr_authdoc_approval.findMany({
        where: { authdoc_id: authorization_doc_id },
        orderBy: { step: 'asc' }
      });

      // Find the first 'pending' approval by step
      const nextPendingApproval = updatedApprovals.find(app => app.status === 'pending');

      if (nextPendingApproval) {
        // Update this specific approval to 'on_going'
        const updatedNextApproval = await prismaDB2.tr_authdoc_approval.update({
          where: { id: nextPendingApproval.id },
          data: {
            status: 'on_going',
            updated_date: bypassTimestamp,
            note: `Approval step transitioned to on_going by super admin bypass (${employeeName}) after previous step bypass`
          },
          include: { // Include authorization details for logging later
            authorization: {
              select: {
                employee_name: true,
                employee_code: true,
                email: true
              }
            }
          }
        });
        console.log("ADMIN BYPASS AUTHDOC INFO: Next pending approval transitioned to 'on_going'.", {
          approvalId: updatedNextApproval.id,
          step: updatedNextApproval.step,
          actor: updatedNextApproval.actor
        });
        transitionedApprover = updatedNextApproval; // Store for logging and response
      } else {
        console.log("ADMIN BYPASS AUTHDOC INFO: No next pending approval found to transition to 'on_going' after partial bypass.");
      }
    }
    // --- END NEW LOGIC ---

    // Prepare list of affected approvers for logging
    let loggableAffectedApprovals: any[] = [];
    // Add approvals that were explicitly bypassed to 'approved'
    loggableAffectedApprovals.push(...affectedApprovals.map(approval => ({
        auth_id: approval.auth_id,
        employee_name: approval.authorization?.employee_name,
        employee_code: approval.authorization?.employee_code,
        step: approval.step,
        actor: approval.actor,
        original_status: approval.status, // This was 'on_going' before bypass
        final_status: 'approved',
        reason: `Bypassed to approved by admin.`
    })));

    // If a next pending approver was transitioned to 'on_going', add them to the loggable list
    if (transitionedApprover) {
        loggableAffectedApprovals.push({
            auth_id: transitionedApprover.auth_id,
            employee_name: transitionedApprover.authorization?.employee_name,
            employee_code: transitionedApprover.authorization?.employee_code,
            step: transitionedApprover.step,
            actor: transitionedApprover.actor,
            original_status: 'pending', // This was 'pending' before this action
            final_status: 'on_going',
            reason: `Next pending step transitioned to on_going by admin bypass logic.`
        });
    }

    // Create bypass log with strategy information - USING NEW TABLE
    const bypassLog = await prismaDB2.tr_admin_bypass_log_authdoc.create({
      data: {
        authorization_doc_id,
        admin_auth_id: admin_auth_id!,
        bypass_type,
        target_status: finalDocumentStatus,
        original_status: originalStatus,
        original_progress: originalProgress,
        new_progress: newProgress,
        reason,
        affected_approvers_count: loggableAffectedApprovals.length,
        affected_approvers_list: loggableAffectedApprovals, // Use the comprehensive list
        bypass_timestamp: bypassTimestamp,
        ip_address: req.ip || req.socket.remoteAddress,
        user_agent: req.get('User-Agent') || null
      }
    });
    console.log("ADMIN BYPASS AUTHDOC INFO: Bypass log created.", { bypassLogId: bypassLog.id });

    // Create history record with strategy information - USING UPDATED TABLE WITH NEW FIELDS
    await prismaDB2.tr_authdoc_history.create({
      data: {
        authdoc_id: authorization_doc_id,
        auth_id: admin_auth_id,
        description: `Sistem approval di-bypass oleh super admin (${bypassStrategy} bypass)`,
        note: `Super admin ${bypassStrategy} bypass oleh ${employeeName}: ${reason}. Status diubah dari ${originalStatus} ke ${finalDocumentStatus}. Progress: ${originalProgress} → ${newProgress}. ${loggableAffectedApprovals.length} approver terpengaruh.`,
        status: finalDocumentStatus,
        // NEW FIELDS FOR ENHANCED TRACKING
        action_type: 'admin_bypass',
        related_bypass_id: bypassLog.id,
        metadata: {
          bypass_strategy: bypassStrategy,
          target_status: finalDocumentStatus,
          affected_approvers_count: loggableAffectedApprovals.length,
          affected_approvers_list: loggableAffectedApprovals,
          admin_info: {
            name: employeeName,
            code: employeeCode,
            role: userRole
          }
        },
        created_date: bypassTimestamp,
        created_by: employeeCode,
        ip_address: req.ip || req.socket.remoteAddress
      }
    });
    console.log("ADMIN BYPASS AUTHDOC INFO: History record created.");

    // Create compatible user object for email service
    const userForEmail = {
      employee_name: employeeName,
      employee_code: employeeCode,
      user_role: userRole,
      auth_id: admin_auth_id,
      email: req.user?.email
    };

    // Send notification emails (only for those whose steps were explicitly approved/bypassed)
    // The `sendBypassNotificationEmailsAuthdoc` function should handle who receives emails.
    // We pass `affectedApprovals` which holds the ones that were directly set to 'approved'.
    await sendBypassNotificationEmailsAuthdoc(authDoc, affectedApprovals, reason, userForEmail);
    console.log("ADMIN BYPASS AUTHDOC INFO: Bypass notification emails sent (or attempted).");

    // Log notification - USING NEW TABLE
    await prismaDB2.tr_notification_log_authdoc.create({
      data: {
        notification_type: 'admin_bypass',
        // Recipients include those directly affected by bypass (set to approved)
        recipients: affectedApprovals.map(approval => approval.authorization?.email).filter(Boolean) as string[],
        sent_count: affectedApprovals.filter(approval => approval.authorization?.email).length,
        urgent: true,
        related_id: bypassLog.id,
        details: {
          authorization_doc_id,
          target_status: finalDocumentStatus,
          bypass_reason: reason,
          bypass_strategy: bypassStrategy,
          requested_target_status: target_status,
          affected_approvers_count: loggableAffectedApprovals.length,
          bypassed_by: employeeName,
          doc_number: authDoc.doc_number,
          original_status: originalStatus,
          original_progress: originalProgress
        }
      }
    });
    console.log("ADMIN BYPASS AUTHDOC INFO: Notification log created.");

    // Send successful response
    res.status(200).json({
      message: `Approval system berhasil di-bypass menggunakan ${bypassStrategy} strategy ke status ${finalDocumentStatus}. ${transitionedApprover ? `Langkah berikutnya (${transitionedApprover.actor}) telah diubah menjadi 'on_going'.` : ''}`,
      data: {
        authorization_doc_id: authorization_doc_id,
        doc_number: authDoc.doc_number,
        original_status: originalStatus,
        new_status: finalDocumentStatus,
        original_progress: originalProgress,
        new_progress: newProgress,
        affected_approvers: loggableAffectedApprovals.length,
        bypass_log_id: bypassLog.id,
        bypassed_by: employeeName,
        bypass_timestamp: bypassTimestamp,
        bypass_strategy: bypassStrategy,
        // Enhanced response data
        strategy_details: {
          requested_target: target_status,
          final_status: finalDocumentStatus,
          approvals_status: target_status === 'approved' ? 'current on_going become approved, next pending become on_going' : 'all pending/on_going become approved',
          strategy_type: bypassStrategy,
          progress_calculation: target_status === 'approved' ? 'calculated based on completed + bypassed steps' : 'set to 100%',
          affected_approval_types: target_status === 'approved' ? 'on_going bypassed + next pending transitioned' : 'pending + on_going bypassed'
        },
        transitioned_next_approver: transitionedApprover ? {
            auth_id: transitionedApprover.auth_id,
            employee_name: transitionedApprover.authorization?.employee_name,
            employee_code: transitionedApprover.authorization?.employee_code,
            step: transitionedApprover.step,
            actor: transitionedApprover.actor,
            status: 'on_going'
        } : null
      }
    });
    console.log("ADMIN BYPASS AUTHDOC SUCCESS: Bypass operation completed and response sent.");

  } catch (error) {
    console.error("❌ ADMIN BYPASS AUTHDOC CRITICAL ERROR:", {
      message: "Terjadi kesalahan saat melakukan operasi bypass admin untuk authorization document.",
      error: error,
      stack: (error instanceof Error) ? error.stack : 'No stack trace available',
      requestBody: req.body,
      user: req.user ? {
        auth_id: req.user.auth_id,
        user_role: getUserRole(req.user),
        employee_name: getEmployeeName(req.user)
      } : 'Not authenticated'
    });

    res.status(500).json({
      error: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// HELPER FUNCTIONS to retrieve user data with various structures
function getUserRole(user: AuthenticatedUser | undefined): string | undefined {
  if (!user) return undefined;

  // Priority: role.role_name > user_role
  return user.role?.role_name || user.user_role;
}

function getEmployeeName(user: AuthenticatedUser | undefined): string | undefined {
  if (!user) return undefined;

  // Priority: employee_name > name
  return user.employee_name || user.name;
}

function getEmployeeCode(user: AuthenticatedUser | undefined): string | undefined {
  if (!user) return undefined;

  // Priority: employee_code > nik
  return user.employee_code || user.nik;
}

// ==========================================
// MAINTENANCE NOTES (UPDATED)
// ==========================================

/*
MAINTENANCE GUIDE untuk Authorization Document Bypass (UPDATED FOR NEW SCHEMA):

1. KEY UPDATES FROM SCHEMA CHANGES:
   - tr_admin_bypass_log_authdoc: NEW dedicated table for authorization bypass logs
   - tr_notification_log_authdoc: NEW dedicated table for authorization notifications
   - tr_authdoc_history: ENHANCED with new fields (action_type, related_bypass_id, metadata, ip_address)
   - tr_authdoc_approval: ENHANCED with note field for bypass tracking

2. DATABASE OPERATIONS (UPDATED):
   - Update tr_authorization_doc (status, progress)
   - Update tr_authdoc_approval (status + note untuk affected approvals)
   - Create tr_admin_bypass_log_authdoc (NEW TABLE)
   - Create tr_authdoc_history with NEW FIELDS (action_type, metadata, etc.)
   - Create tr_notification_log_authdoc (NEW TABLE)

3. ENHANCED FEATURES:
   - Better audit trail dengan metadata lengkap
   - Separated notification logs untuk authorization documents
   - Enhanced history tracking dengan action types
   - IP address dan user agent logging
   - Structured metadata untuk better analytics

4. BYPASS STRATEGIES (UNCHANGED):
   - Partial Bypass: Only bypass 'on_going' approvals, transition next 'pending' to 'on_going'
   - Full Bypass: Bypass all 'pending' and 'on_going' approvals, set document to 'done'

5. EMAIL NOTIFICATIONS (ENHANCED):
   - Send to affected approvers whose steps were bypassed
   - Send to document submitter/creator
   - Use dedicated notification log table
   - Include more context in notification details

6. TESTING CHECKLIST (UPDATED):
   - ✅ Test dengan authorization_doc_id yang valid
   - ✅ Test berbagai target_status (approved/done)
   - ✅ Test dengan user role yang berbeda (only Super Admin allowed)
   - ✅ Verify NEW TABLE records created correctly:
     * tr_admin_bypass_log_authdoc
     * tr_notification_log_authdoc
   - ✅ Verify ENHANCED TABLE records with new fields:
     * tr_authdoc_history (action_type, metadata, etc.)
     * tr_authdoc_approval (note field)
   - ✅ Verify email notifications
   - ✅ Test compatibility dengan existing approval workflows

7. MIGRATION IMPACT:
   - NO BREAKING CHANGES to existing tr_authdoc_approval workflows
   - NO BREAKING CHANGES to existing tr_authdoc_history workflows
   - Only ADDITIVE changes (new fields with default values)
   - NEW TABLES for better separation of concerns
   - Enhanced tracking capabilities
*/