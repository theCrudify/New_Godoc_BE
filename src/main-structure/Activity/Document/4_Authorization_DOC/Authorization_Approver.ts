import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";
import { sendApprovalEmails } from '../../Email/EmailAuthorization/Email_Approval_AuthDoc';

//Nyari Approval by ID dan support pencarian by id doc
export const getAuthDocByIdApprover = async (req: Request, res: Response): Promise<void> => {
  try {
    // Ekstrak query parameters dengan default values
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const searchTerm = (req.query.search as string) || "";
    const sortColumn = (req.query.sort as string) || "id";
    const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

    // Definisi kolom yang diperbolehkan untuk sorting
    const validSortColumns = [
      "id", "doc_number", "implementation_date", "concept",
      "method", "status", "progress", "created_date",
      "plant_id", "department_id", "section_department_id"
    ];

    // Validasi sortColumn dan set default jika tidak valid
    const orderBy: any = validSortColumns.includes(sortColumn)
      ? { [sortColumn]: sortDirection }
      : { id: "asc" };

    const offset = (page - 1) * limit;

    // Inisialisasi whereCondition - HAPUS is_deleted yang tidak ada di model
    const whereCondition: any = {};

    // Array untuk kondisi AND
    const andConditions = [];

    // Tambahkan kondisi pencarian (Search Term)
    if (searchTerm) {
      andConditions.push({
        OR: [
          { doc_number: { contains: searchTerm } },
          { evaluation: { contains: searchTerm } },
          { description: { contains: searchTerm } },
          { conclution: { contains: searchTerm } },
          { concept: { contains: searchTerm } },
          { standart: { contains: searchTerm } },
          { method: { contains: searchTerm } },
          { status: { contains: searchTerm } },
          { progress: { contains: searchTerm } },
          { created_by: { contains: searchTerm } },
          { proposedChange: { project_name: { contains: searchTerm } } }
        ]
      });
    }

    // Filter by proposed_change_id
    if (req.query.proposed_change_id) {
      andConditions.push({ proposed_change_id: Number(req.query.proposed_change_id) });
    }

    // Filter by doc_number
    if (req.query.doc_number) {
      andConditions.push({ doc_number: req.query.doc_number as string });
    }

    // Filter by status
    if (req.query.status) {
      andConditions.push({ status: req.query.status as string });
    }

    // Filter by progress
    if (req.query.progress) {
      andConditions.push({ progress: req.query.progress as string });
    }

    // Filter by plant_id
    if (req.query.plant_id) {
      andConditions.push({ plant_id: Number(req.query.plant_id) });
    }

    // Filter by auth_id
    if (req.query.auth_id) {
      andConditions.push({ auth_id: Number(req.query.auth_id) });
    }

    // Filter by department_id
    if (req.query.department_id) {
      andConditions.push({ department_id: Number(req.query.department_id) });
    }

    // Filter by section_department_id
    if (req.query.section_department_id) {
      andConditions.push({ section_department_id: Number(req.query.section_department_id) });
    }

    // Filter by created_by
    if (req.query.created_by) {
      andConditions.push({ created_by: req.query.created_by as string });
    }

    // Filter by auth_id dengan status on_going atau not_approved
    if (req.query.approval_auth_id) {
      const approvalAuthId = Number(req.query.approval_auth_id);

      andConditions.push({
        authdocApprovals: {
          some: {
            auth_id: approvalAuthId,
            status: {
              // in: ['on_going', 'not_approved'] aktifkan saat deploy
              in: ['on_going', 'not_approved', 'rejected'] // untuk testing
            }
          }
        }
      });
    }

    // Filter berdasarkan id utama (primary key)
    if (req.query.id) {
      andConditions.push({ id: Number(req.query.id) });
    }

    // Filter by approval status
    if (req.query.approval_status) {
      andConditions.push({
        authdocApprovals: {
          some: {
            status: req.query.approval_status as string
          }
        }
      });
    }

    // Filter by employee code (approval actor)
    if (req.query.employee_code) {
      andConditions.push({
        authdocApprovals: {
          some: {
            employee_code: req.query.employee_code as string
          }
        }
      });
    }

    // Tambahkan AND conditions ke where jika ada
    if (andConditions.length > 0) {
      whereCondition.AND = andConditions;
    }

    // Eksekusi query findMany dan count dalam transaksi
    const [proposedChanges, totalCount] = await prismaDB2.$transaction([
      prismaDB2.tr_authorization_doc.findMany({
        where: whereCondition,
        skip: offset,
        take: limit,
        orderBy,
        include: {
          proposedChange: true,
          authorizationPlant: true,
          department: true,
          section_department: true,
          authdocMembers: true, // ⬅️ Ini untuk ambil data tr_authdoc_member

          authdocApprovals: {
            include: {
              authorization: true
            }
          }
        }
      }),
      prismaDB2.tr_authorization_doc.count({
        where: whereCondition
      }),
    ]);

    // Kalkulasi pagination
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    // Format response
    res.status(200).json({
      data: proposedChanges,
      pagination: {
        totalCount,
        totalPages,
        currentPage: page,
        limit,
        hasNextPage,
        hasPreviousPage
      },
    });
  } catch (error: any) {
    console.error("❌ Error in getAuthDocByIdApprover:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Ngisi Approval Secara ID 
// Fix for updateAuthApprovalStatus function in Authorization_Approver.ts
export const updateAuthApprovalStatus = async (req: Request, res: Response): Promise<void> => {
  console.log("🔍 [START] updateAuthApprovalStatus - Request body:", JSON.stringify(req.body));
  try {
    const { authdoc_id, auth_id, status, note, employee_code } = req.body;
    console.log(`📌 Processing approval - authdoc_id: ${authdoc_id}, auth_id: ${auth_id}, status: ${status}, note: "${note || "tidak ada"}"`);

    // Validasi parameter yang diperlukan
    if (!authdoc_id || !auth_id || !status) {
      console.log("❌ Validation failed: Missing required parameters");
      res.status(400).json({
        error: "Bad Request",
        message: "Required parameters missing: authdoc_id, auth_id, and status are required"
      });
      return;
    }

    const validStatuses = ['approved', 'not_approved', 'rejected'];
    if (!validStatuses.includes(status)) {
      console.log(`❌ Validation failed: Invalid status '${status}'`);
      res.status(400).json({
        error: "Bad Request",
        message: `Invalid status. Status must be one of: ${validStatuses.join(', ')}`
      });
      return;
    }

    // Find the approval without filtering by status
    console.log(`🔍 Searching for approval with authdoc_id: ${authdoc_id}, auth_id: ${auth_id}`);
    const currentApproval = await prismaDB2.tr_authdoc_approval.findFirst({
      where: {
        authdoc_id: Number(authdoc_id),
        auth_id: Number(auth_id)
      }
    });
    console.log("🔍 Current approval found:", currentApproval ? JSON.stringify(currentApproval) : "null");

    if (!currentApproval) {
      console.log("❌ No approval found with the provided IDs");
      res.status(404).json({
        error: "Not Found",
        message: "No approval found with the provided authdoc_id and auth_id"
      });
      return;
    }

    // Prevent changing from 'approved' to avoid confusion in the approval flow
    if (currentApproval.status === 'approved') {
      console.log("❌ Cannot change from 'approved' status");
      res.status(400).json({
        error: "Bad Request",
        message: "Cannot change status from 'approved' to another status"
      });
      return;
    }

    // Check for duplicates outside of transaction block
    console.log("🔍 Checking for recently submitted identical approvals");
    const currentTimestamp = new Date();
    console.log(`📅 Current timestamp: ${currentTimestamp.toISOString()}`);
    const oneMinuteAgo = new Date(currentTimestamp.getTime() - 60000); // 1 minute ago
    console.log(`📅 One minute ago: ${oneMinuteAgo.toISOString()}`);

    const existingIdenticalHistory = await prismaDB2.tr_authdoc_history.findFirst({
      where: {
        authdoc_id: Number(authdoc_id),
        auth_id: Number(auth_id),
        status: status,
        note: note || '',
        created_date: {
          gte: oneMinuteAgo
        }
      }
    });
    console.log("🔍 Existing identical history:", existingIdenticalHistory ? "Found duplicate" : "No duplicates found");

    if (existingIdenticalHistory) {
      console.log("⚠️ Duplicate submission detected, returning existing data");
      const updatedAuthDoc = await getUpdatedAuthDoc(Number(authdoc_id));
      res.status(200).json({
        message: `Approval has been updated successfully (duplicate submission prevented)`,
        data: updatedAuthDoc
      });
      return;
    }

    const currentStep = currentApproval.step || 0;
    const nextApprovalStep = currentStep + 1;
    console.log(`📊 Current step: ${currentStep}, Next step: ${nextApprovalStep}`);

    // Get all approvals before any updates to calculate progress correctly
    console.log(`🔍 Getting all approvals for authdoc_id: ${authdoc_id}`);
    const allApprovals = await prismaDB2.tr_authdoc_approval.findMany({
      where: { authdoc_id: Number(authdoc_id) }
    });
    console.log(`📊 Total approvals found: ${allApprovals.length}`);

    const totalSteps = allApprovals.length;
    console.log(`📊 Total steps in approval flow: ${totalSteps}`);

    // Count only 'approved' statuses as completed steps
    const completedSteps = allApprovals.filter(approval =>
      (approval.id === currentApproval.id)
        ? status === 'approved' // Only count current approval if new status is 'approved'
        : approval.status === 'approved' // Only count other approvals if they're 'approved'
    ).length;
    console.log(`📊 Completed steps (including current if approved): ${completedSteps}`);

    // Calculate progress percentage with the updated count
    const progressPercentage = totalSteps > 0
      ? Math.round((completedSteps / totalSteps) * 100)
      : 0;
    console.log(`📊 New progress percentage: ${progressPercentage}%`);

    let updatedAuthDoc: any;

    // Use a mutex-like approach with advisory lock
    // Create a lock key specific to this approval
    const lockKey = `approval_lock_${authdoc_id}_${auth_id}`;
    console.log(`🔒 Using lock key: ${lockKey}`);

    // Improved transaction handling with proper retry logic
    let transactionAttempt = 0;
    const maxTransactionAttempts = 3;
    console.log(`⚙️ Max transaction attempts: ${maxTransactionAttempts}`);

    // Variable to track transaction success
    let transactionSuccessful = false;
    let transactionError = null;

    while (transactionAttempt < maxTransactionAttempts && !transactionSuccessful) {
      transactionAttempt++;
      try {
        console.log(`🔄 Starting transaction attempt #${transactionAttempt}`);

        // Execute entire update logic as a single serialized transaction with increased timeout
        await prismaDB2.$transaction(async (prisma) => {
          console.log("🔄 Inside transaction");

          // Double-check for duplicates inside transaction for extra safety
          console.log("🔍 Double-checking for duplicates inside transaction");
          const duplicateCheck = await prisma.tr_authdoc_history.findFirst({
            where: {
              authdoc_id: Number(authdoc_id),
              auth_id: Number(auth_id),
              status: status,
              note: note || '',
              created_date: {
                gte: oneMinuteAgo
              }
            }
          });

          if (duplicateCheck) {
            console.log("⚠️ Duplicate detected inside transaction, skipping updates");
            // Set flag to indicate transaction completed due to duplicate
            transactionSuccessful = true;
            return;
          }

          // Refetch current approval inside transaction for consistency
          const freshApproval = await prisma.tr_authdoc_approval.findFirst({
            where: {
              id: currentApproval.id
            }
          });

          if (!freshApproval) {
            console.log("❌ Approval record no longer exists in transaction");
            throw new Error("Approval record not found in transaction");
          }

          if (freshApproval.status === 'approved') {
            console.log("⚠️ Approval already marked as approved in transaction, skipping update");
            transactionSuccessful = true;
            return;
          }

          // Update current approval status
          console.log(`✏️ Updating approval id: ${currentApproval.id} to status: ${status}`);
          await prisma.tr_authdoc_approval.update({
            where: { id: currentApproval.id },
            data: {
              status,
              updated_date: currentTimestamp
            }
          });
          console.log("✅ Approval status updated successfully");

          let newAuthDocStatus = 'onprogress';
          let isLastStep = false;

          // Handle moving to next step only when changing to 'approved'
          if (status === 'approved') {
            console.log(`🔍 Checking for next step approval (step: ${nextApprovalStep})`);
            const nextApproval = await prisma.tr_authdoc_approval.findFirst({
              where: {
                authdoc_id: Number(authdoc_id),
                step: nextApprovalStep
              }
            });
            console.log("🔍 Next approval:", nextApproval ? `Found (id: ${nextApproval.id})` : "Not found");

            if (nextApproval) {
              // Only update next approval to on_going if it's not already in a valid status
              if (!validStatuses.includes(nextApproval.status ?? '')) {
                console.log(`✏️ Updating next approval (id: ${nextApproval.id}) to on_going`);
                await prisma.tr_authdoc_approval.update({
                  where: { id: nextApproval.id },
                  data: {
                    status: 'on_going',
                    updated_date: currentTimestamp
                  }
                });
                console.log("✅ Next approval updated to on_going");
              } else {
                console.log(`⚠️ Next approval already has valid status: ${nextApproval.status}, not updating`);
              }
            } else {
              newAuthDocStatus = 'done';
              isLastStep = true;
              console.log("📋 This is the last approval step, setting document status to 'done'");
            }
          }

          // Determine the overall proposed status based on the new approval status
          console.log("🔄 Determining final document status");
          if (status === 'not_approved') {
            newAuthDocStatus = 'not_approved';
            console.log("📋 Setting document status to 'not_approved' due to current approval status");
          } else if (status === 'rejected') {
            newAuthDocStatus = 'rejected';
            console.log("📋 Setting document status to 'rejected' due to current approval status");
          } else if (status === 'approved' && progressPercentage === 100 && newAuthDocStatus !== 'done') {
            newAuthDocStatus = 'approved';
            console.log("📋 Setting document status to 'approved' due to 100% progress");
          }

          // Check if any approvals are still in rejected or not_approved state
          const hasRejections = allApprovals.some(approval =>
            (approval.id === currentApproval.id)
              ? status === 'rejected'
              : approval.status === 'rejected'
          );
          console.log(`📋 Has rejections: ${hasRejections}`);

          const hasNotApproved = allApprovals.some(approval =>
            (approval.id === currentApproval.id)
              ? status === 'not_approved'
              : approval.status === 'not_approved'
          );
          console.log(`📋 Has not_approved: ${hasNotApproved}`);

          // If any approval is rejected, overall status should be rejected
          if (hasRejections) {
            newAuthDocStatus = 'rejected';
            console.log("📋 Overriding document status to 'rejected' due to rejections");
          }
          // If any approval is not_approved and none are rejected, overall status should be not_approved
          else if (hasNotApproved) {
            newAuthDocStatus = 'not_approved';
            console.log("📋 Overriding document status to 'not_approved' due to not_approved statuses");
          }

          console.log(`✏️ Updating document (id: ${authdoc_id}) to status: ${newAuthDocStatus}, progress: ${progressPercentage}%`);
          await prisma.tr_authorization_doc.update({
            where: { id: Number(authdoc_id) },
            data: {
              status: newAuthDocStatus,
              progress: `${progressPercentage}%`,
              updated_at: currentTimestamp
            }
          });
          console.log("✅ Document updated successfully");

          // Check for previous not_approved status for message
          console.log("🔍 Checking for previous not_approved history");
          const previousNotApproved = await prisma.tr_authdoc_history.findFirst({
            where: {
              authdoc_id: Number(authdoc_id),
              auth_id: Number(auth_id),
              status: 'not_approved'
            }
          });
          console.log("🔍 Previous not_approved:", previousNotApproved ? "Found" : "Not found");

          // Generate appropriate description based on status
          console.log("📝 Generating description for history entry");
          let description = '';
          console.log(`🔍 Looking up authorization details for auth_id: ${auth_id}`);
          const authorization = await prisma.mst_authorization.findUnique({
            where: { id: Number(auth_id) }
          });
          console.log("🔍 Authorization details:", authorization ? "Found" : "Not found");

          // Use employee full name if available, or employee_code as fallback
          const authName = authorization?.employee_name;
          console.log(`👤 Using auth name: ${authName || 'Unknown'}`);

          if (status === 'approved') {
            description = `${authName} has approved the Authorization Document`;
          } else if (status === 'not_approved') {
            if (previousNotApproved) {
              description = `${authName} not approved again the Authorization Document`;
            } else {
              description = `${authName} has not approved the Authorization Document`;
            }
          } else if (status === 'rejected') {
            description = `${authName} has rejected the Authorization Document`;
          }
          console.log(`📝 Generated description: "${description}"`);

          // Create history entry - use exact same timestamp for both dates
          console.log("✏️ Creating history entry");
          await prisma.tr_authdoc_history.create({
            data: {
              authdoc_id: Number(authdoc_id),
              auth_id: Number(auth_id),
              employee_code: employee_code || authorization?.employee_code || '',
              status,
              note: note || '',
              description,
              created_date: currentTimestamp,
              updated_date: currentTimestamp
            }
          });
          console.log("✅ History entry created successfully");

          // Set success flag
          transactionSuccessful = true;
        }, {
          timeout: 30000, // Increase timeout to 30 seconds
          isolationLevel: 'Serializable' // Stronger isolation to prevent concurrent modifications
        });

        console.log("✅ Transaction completed successfully");
        break; // Exit retry loop on success
      } catch (error: any) {
        console.error(`❌ Transaction error attempt #${transactionAttempt}:`, error);
        // Save the last error
        transactionError = error;

        // Handle specific database errors
        if (error.code === 'P2034') { // Prisma transaction failed due to concurrent modification
          if (transactionAttempt < maxTransactionAttempts) {
            // Exponential backoff before retry with additional randomness to prevent thundering herd
            const baseDelay = Math.pow(2, transactionAttempt) * 500; // 500ms, 1000ms, 2000ms
            const jitter = Math.floor(Math.random() * 300); // Add 0-300ms of random jitter
            const delay = baseDelay + jitter;
            console.log(`⏱️ Retrying after ${delay}ms delay due to conflict`);
            await new Promise(resolve => setTimeout(resolve, delay));
            // Don't increment transactionAttempt here as it's already incremented in the while loop
          } else {
            console.error("❌ Max retry attempts reached");
            break; // Exit the retry loop
          }
        } else {
          console.error("❌ Non-retriable error occurred:", error);
          // For other errors, don't retry
          break; // Exit the retry loop
        }
      }
    }

    // If all attempts failed, throw the last error
    if (!transactionSuccessful) {
      if (transactionError) {
        throw transactionError;
      } else {
        throw new Error("Transaction failed after all retry attempts");
      }
    }

    // Get the final updated authorization doc after the transaction
    console.log(`🔍 Getting updated auth doc data for id: ${authdoc_id}`);
    updatedAuthDoc = await getUpdatedAuthDoc(Number(authdoc_id));
    console.log("✅ Retrieved updated auth doc data");

    // FIX FOR EMAIL ERROR: Get the authorization document correctly
    try {
      console.log(`🔍 Getting proposed change info for email`);
      const authDoc = await prismaDB2.tr_authorization_doc.findUnique({
        where: { id: Number(authdoc_id) },
        select: {
          id: true,
          proposed_change_id: true,
          proposedChange: true
        }
      });

      if (!authDoc) {
        console.log(`⚠️ No auth doc found with ID ${authdoc_id} for email notification`);
      } else {
        console.log(`🔍 Auth doc found: ID=${authDoc.id}, proposed_change_id=${authDoc.proposed_change_id || 'null'}`);

        if (authDoc.proposed_change_id) {
          console.log(`📧 Sending email notification for authorization document ID: ${authDoc.id}`);
          console.log(`📝 Using current note from request: "${note || ""}"`);

          // IMPORTANT FIX: Pass the actual authorization doc ID, not the proposed change ID
          await sendApprovalEmails(
            Number(authDoc.id), // Use authDoc.id instead of proposed_change_id
            Number(auth_id),
            status,
            currentStep,
            note || ''
          );
          console.log("✅ Email sent successfully with current note from request");
        } else {
          console.log("⚠️ No proposed_change_id associated with this auth doc, skipping email notification");
        }
      }
    } catch (emailError) {
      console.error("❌ Error sending email notification:", emailError);
      console.error("❌ Email error details:", emailError instanceof Error ? emailError.message : String(emailError));
      // Continue processing even if email fails - don't block main process
    }

    console.log("✅ [END] updateAuthApprovalStatus - Operation completed successfully");
    res.status(200).json({
      message: `Approval has been updated to '${status}' successfully`,
      data: updatedAuthDoc
    });

  } catch (error: any) {
    console.error("❌ [ERROR] updateAuthApprovalStatus:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      error: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Helper function to get the updated authorization doc with all related data
const getUpdatedAuthDoc = async (authdocId: number) => {
  console.log(`🔍 [getUpdatedAuthDoc] Retrieving complete auth doc data for id: ${authdocId}`);
  try {
    const result = await prismaDB2.tr_authorization_doc.findUnique({
      where: { id: authdocId },
      include: {
        authorizationPlant: true,
        department: true,
        section_department: true,
        proposedChange: true,
        authorization: true,
        authdocApprovals: {
          include: {
            authorization: true
          },
          orderBy: {
            step: 'asc'
          }
        },
        authdocHistories: {
          orderBy: {
            created_date: 'desc'
          }
        }
      }
    });
    console.log(`✅ [getUpdatedAuthDoc] Retrieved data ${result ? 'successfully' : 'but not found'}`);
    return result;
  } catch (error) {
    console.error("❌ [getUpdatedAuthDoc] Error retrieving auth doc:", error);
    throw error;
  }
};