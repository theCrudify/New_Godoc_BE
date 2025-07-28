import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";
import { sendHandoverApprovalEmails } from '../../Email/EmailHandover/EmailApproverHandover';

//Get Handover by ID Approver with search support
export const getHandoverByIdApprover = async (req: Request, res: Response): Promise<void> => {
  try {
    // Extract query parameters with default values
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const searchTerm = (req.query.search as string) || "";
    const sortColumn = (req.query.sort as string) || "id";
    const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

    // Define allowed columns for sorting
    const validSortColumns = [
      "id", "doc_number", "created_date", "material",
      "status", "progress", "created_by",
      "plant_id", "department_id", "section_department_id"
    ];

    // Validate sortColumn and set default if not valid
    const orderBy: any = validSortColumns.includes(sortColumn)
      ? { [sortColumn]: sortDirection }
      : { id: "asc" };

    const offset = (page - 1) * limit;

    // Initialize whereCondition
    const whereCondition: any = {
      is_deleted: false
    };

    // Array for AND conditions
    const andConditions = [];

    // Add search term condition
    if (searchTerm) {
      andConditions.push({
        OR: [
          { doc_number: { contains: searchTerm } },
          { material: { contains: searchTerm } },
          { remark: { contains: searchTerm } },
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
      andConditions.push({ 
        OR: [
          { auth_id: Number(req.query.auth_id) },
          { auth_id2: Number(req.query.auth_id) },
          { auth_id3: Number(req.query.auth_id) },
          { auth_id4: Number(req.query.auth_id) }
        ]
      });
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

    // Filter by auth_id with status on_going or not_approved
    if (req.query.approval_auth_id) {
      const approvalAuthId = Number(req.query.approval_auth_id);

      andConditions.push({
        tr_handover_approval: {
          some: {
            auth_id: approvalAuthId,
            status: {
              in: ['on_going', 'not_approved', 'rejected']
            }
          }
        }
      });
    }

    // Filter by primary key id
    if (req.query.id) {
      andConditions.push({ id: Number(req.query.id) });
    }

    // Filter by approval status
    if (req.query.approval_status) {
      andConditions.push({
        tr_handover_approval: {
          some: {
            status: req.query.approval_status as string
          }
        }
      });
    }

    // Filter by employee code (approval actor)
    if (req.query.employee_code) {
      andConditions.push({
        tr_handover_approval: {
          some: {
            employee_code: req.query.employee_code as string
          }
        }
      });
    }

    // Add AND conditions to where if any exist
    if (andConditions.length > 0) {
      whereCondition.AND = andConditions;
    }

    // Execute findMany query and count in transaction
    const [handovers, totalCount] = await prismaDB2.$transaction([
      prismaDB2.tr_handover.findMany({
        where: whereCondition,
        skip: offset,
        take: limit,
        orderBy,
        include: {
          tr_proposed_changes: true,
          mst_plant: true,
          mst_department: true,
          mst_section_department: true,
          mst_authorization_tr_handover_auth_idTomst_authorization: true,
          mst_authorization_tr_handover_auth_id2Tomst_authorization: true,
          mst_authorization_tr_handover_auth_id3Tomst_authorization: true,
          mst_authorization_tr_handover_auth_id4Tomst_authorization: true,
          tr_authorization_doc: true,
          tr_handover_approval: {
            include: {
              mst_authorization: true
            }
          }
        }
      }),
      prismaDB2.tr_handover.count({
        where: whereCondition
      }),
    ]);

    // Calculate pagination
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    // Format response
    res.status(200).json({
      data: handovers,
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
    console.error("❌ Error in getHandoverByIdApprover:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update Handover Approval Status
// Ngisi Approval untuk Handover Secara ID 
// Ngisi Approval untuk Handover Secara ID 
export const updateHandoverApprovalStatus = async (req: Request, res: Response): Promise<void> => {
  console.log("🔍 [START] updateHandoverApprovalStatus - Request body:", JSON.stringify(req.body));
  try {
    const { handover_id, auth_id, status, note, employee_code } = req.body;
    console.log(`📌 Processing handover approval - handover_id: ${handover_id}, auth_id: ${auth_id}, status: ${status}, note: "${note || "tidak ada"}"`);

    // Validasi parameter yang diperlukan
    if (!handover_id || !auth_id || !status) {
      console.log("❌ Validation failed: Missing required parameters");
      res.status(400).json({
        error: "Bad Request",
        message: "Required parameters missing: handover_id, auth_id, and status are required"
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
    console.log(`🔍 Searching for approval with handover_id: ${handover_id}, auth_id: ${auth_id}`);
    const currentApproval = await prismaDB2.tr_handover_approval.findFirst({
      where: {
        handover_id: Number(handover_id),
        auth_id: Number(auth_id)
      }
    });
    console.log("🔍 Current approval found:", currentApproval ? JSON.stringify(currentApproval) : "null");

    if (!currentApproval) {
      console.log("❌ No approval found with the provided IDs");
      res.status(404).json({
        error: "Not Found",
        message: "No approval found with the provided handover_id and auth_id"
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
    
    const existingIdenticalHistory = await prismaDB2.tr_handover_history.findFirst({
      where: {
        handover_id: Number(handover_id),
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
      const updatedHandover = await getUpdatedHandover(Number(handover_id));
      res.status(200).json({
        message: `Handover approval has been updated successfully (duplicate submission prevented)`,
        data: updatedHandover
      });
      return;
    }

    const currentStep = currentApproval.step || 0;
    const nextApprovalStep = currentStep + 1;
    console.log(`📊 Current step: ${currentStep}, Next step: ${nextApprovalStep}`);

    // Get all approvals before any updates to calculate progress correctly
    console.log(`🔍 Getting all approvals for handover_id: ${handover_id}`);
    const allApprovals = await prismaDB2.tr_handover_approval.findMany({
      where: { handover_id: Number(handover_id) }
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

    let updatedHandover: any;

    // Use a mutex-like approach with advisory lock
    // Create a lock key specific to this approval
    const lockKey = `handover_approval_lock_${handover_id}_${auth_id}`;
    console.log(`🔒 Using lock key: ${lockKey}`);

    // Here we'd ideally use Redis or similar for a distributed lock
    // But for simplicity, we'll implement retry logic with an improved transaction

    let transactionAttempt = 0;
    const maxTransactionAttempts = 3;
    console.log(`⚙️ Max transaction attempts: ${maxTransactionAttempts}`);

    // Variabel untuk melacak berhasil atau tidaknya transaksi
    let transactionSuccessful = false;
    let transactionError = null;

    while (transactionAttempt < maxTransactionAttempts && !transactionSuccessful) {
      try {
        console.log(`🔄 Starting transaction attempt #${transactionAttempt + 1}`);
        // Execute entire update logic as a single serialized transaction
        await prismaDB2.$transaction(async (prisma) => {
          console.log("🔄 Inside transaction");
          // Double-check for duplicates inside transaction for extra safety
          console.log("🔍 Double-checking for duplicates inside transaction");
          const duplicateCheck = await prisma.tr_handover_history.findFirst({
            where: {
              handover_id: Number(handover_id),
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
            // Buat flag untuk menunjukkan transaksi selesai namun karena duplikat
            transactionSuccessful = true;
            return;
          }

          // Update current approval status
          console.log(`✏️ Updating approval id: ${currentApproval.id} to status: ${status}`);
          await prisma.tr_handover_approval.update({
            where: { id: currentApproval.id },
            data: {
              status,
              updated_date: currentTimestamp
            }
          });
          console.log("✅ Approval status updated successfully");

          let newHandoverStatus = 'onprogress';
          let isLastStep = false;

          // Handle moving to next step only when changing to 'approved'
          if (status === 'approved') {
            console.log(`🔍 Checking for next step approval (step: ${nextApprovalStep})`);
            const nextApproval = await prisma.tr_handover_approval.findFirst({
              where: {
                handover_id: Number(handover_id),
                step: nextApprovalStep
              }
            });
            console.log("🔍 Next approval:", nextApproval ? `Found (id: ${nextApproval.id})` : "Not found");

            if (nextApproval) {
              // Only update next approval to on_going if it's not already in a valid status
              if (!validStatuses.includes(nextApproval.status ?? '')) {
                console.log(`✏️ Updating next approval (id: ${nextApproval.id}) to on_going`);
                await prisma.tr_handover_approval.update({
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
              newHandoverStatus = 'done';
              isLastStep = true;
              console.log("📋 This is the last approval step, setting document status to 'done'");
            }
          }

          // Determine the overall proposed status based on the new approval status
          console.log("🔄 Determining final document status");
          if (status === 'not_approved') {
            newHandoverStatus = 'not_approved';
            console.log("📋 Setting document status to 'not_approved' due to current approval status");
          } else if (status === 'rejected') {
            newHandoverStatus = 'rejected';
            console.log("📋 Setting document status to 'rejected' due to current approval status");
          } else if (status === 'approved' && progressPercentage === 100 && newHandoverStatus !== 'done') {
            newHandoverStatus = 'approved';
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
            newHandoverStatus = 'rejected';
            console.log("📋 Overriding document status to 'rejected' due to rejections");
          }
          // If any approval is not_approved and none are rejected, overall status should be not_approved
          else if (hasNotApproved) {
            newHandoverStatus = 'not_approved';
            console.log("📋 Overriding document status to 'not_approved' due to not_approved statuses");
          }

          console.log(`✏️ Updating handover document (id: ${handover_id}) to status: ${newHandoverStatus}, progress: ${progressPercentage}%`);
          await prisma.tr_handover.update({
            where: { id: Number(handover_id) },
            data: {
              status: newHandoverStatus,
              progress: `${progressPercentage}%`,
              updated_at: currentTimestamp
            }
          });
          console.log("✅ Handover document updated successfully");

          // Check for previous not_approved status for message
          console.log("🔍 Checking for previous not_approved history");
          const previousNotApproved = await prisma.tr_handover_history.findFirst({
            where: {
              handover_id: Number(handover_id),
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
            where: { id: Number(auth_id) },
            include: {
              authorization: true // Get employee data for full name
            }
          });
          console.log("🔍 Authorization details:", authorization ? "Found" : "Not found");

          // Use employee full name if available, or employee_code as fallback
          const authName = authorization?.employee_name;
          console.log(`👤 Using auth name: ${authName || 'Unknown'}`);

          if (status === 'approved') {
            description = `${authName} has approved the Handover Document`;
          } else if (status === 'not_approved') {
            if (previousNotApproved) {
              description = `${authName} not approved again the Handover Document`;
            } else {
              description = `${authName} has not approved the Handover Document`;
            }
          } else if (status === 'rejected') {
            description = `${authName} has rejected the Handover Document`;
          }
          console.log(`📝 Generated description: "${description}"`);

          // Create history entry - use exact same timestamp for both dates
          console.log("✏️ Creating history entry");
          await prisma.tr_handover_history.create({
            data: {
              handover_id: Number(handover_id),
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
          
          // Set flag berhasil
          transactionSuccessful = true;
        }, {
          timeout: 15000,
          isolationLevel: 'Serializable' // Stronger isolation to prevent concurrent modifications
        });

        console.log("✅ Transaction completed successfully");
        // Jika transaksi berhasil, exit retry loop
        break;
      } catch (error: any) {
        console.error(`❌ Transaction error attempt #${transactionAttempt + 1}:`, error);
        // Simpan error terakhir
        transactionError = error;
        
        // Handle specific database errors
        if (error.code === 'P2034') { // Prisma transaction failed due to concurrent modification
          if (transactionAttempt < maxTransactionAttempts - 1) {
            // Exponential backoff before retry
            const delay = Math.pow(2, transactionAttempt) * 500; // 500ms, 1000ms, 2000ms
            console.log(`⏱️ Retrying after ${delay}ms delay due to conflict`);
            await new Promise(resolve => setTimeout(resolve, delay));
            transactionAttempt++;
            console.log(`🔄 Retrying transaction attempt ${transactionAttempt} after conflict`);
          } else {
            console.error("❌ Max retry attempts reached, throwing error");
            throw error; // Max retries reached
          }
        } else {
          console.error("❌ Non-retriable error occurred:", error);
          // For other errors, don't retry
          throw error;
        }
      }
    }

    // Jika semua percobaan gagal, lempar error terakhir
    if (!transactionSuccessful && transactionError) {
      throw transactionError;
    }

    // Get the final updated handover doc after the transaction
    console.log(`🔍 Getting updated handover doc data for id: ${handover_id}`);
    updatedHandover = await getUpdatedHandover(Number(handover_id));
    console.log("✅ Retrieved updated handover doc data");

    // Ambil informasi tentang proposed change untuk email
    console.log(`🔍 Getting proposed change info for email`);
    const handoverDoc = await prismaDB2.tr_handover.findUnique({
      where: { id: Number(handover_id) },
      include: {
        tr_proposed_changes: true
      }
    });
    console.log("🔍 Handover doc with proposed change:", handoverDoc ? 
      `Found (proposed_change_id: ${handoverDoc.proposed_change_id || 'null'})` : 
      "Not found");

    // INTEGRATION WITH EMAIL SERVICE
    try {
      // Kirim email sesuai dengan status approval
      console.log(`📧 Sending email notification for handover_id: ${handover_id}`);
      console.log(`📝 Using current note LANGSUNG dari request: "${note || ""}"`);
      
      // Send email notification directly - internal tracking is managed by the email service
      await sendHandoverApprovalEmails(
        Number(handover_id),
        Number(auth_id),
        status,
        currentStep,
        note || '' // Teruskan note LANGSUNG dari request body ke fungsi email
      );
      console.log("✅ Email sent successfully with current note from request");
    } catch (emailError) {
      console.error("❌ Error sending email notification:", emailError);
      console.error("❌ Email error details:", emailError instanceof Error ? emailError.message : String(emailError));
      // Continue processing even if email fails - don't blokir proses utama
    }

    console.log("✅ [END] updateHandoverApprovalStatus - Operation completed successfully");
    res.status(200).json({
      message: `Handover approval has been updated to '${status}' successfully`,
      data: updatedHandover
    });

  } catch (error: any) {
    console.error("❌ [ERROR] updateHandoverApprovalStatus:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      error: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Note: Email tracking is now handled directly inside the sendHandoverApprovalEmails function

// Helper function to get the updated handover with all related data
const getUpdatedHandover = async (handoverId: number) => {
  console.log(`🔍 [getUpdatedHandover] Retrieving complete handover data for id: ${handoverId}`);
  try {
    const result = await prismaDB2.tr_handover.findUnique({
      where: { id: handoverId },
      include: {
        mst_plant: true,
        mst_department: true,
        mst_section_department: true,
        tr_proposed_changes: true,
        mst_authorization_tr_handover_auth_idTomst_authorization: true,
        tr_handover_approval: {
          include: {
            mst_authorization: true
          },
          orderBy: {
            step: 'asc'
          }
        },
        tr_handover_history: {
          orderBy: {
            created_date: 'desc'
          }
        }
      }
    });
    console.log(`✅ [getUpdatedHandover] Retrieved data ${result ? 'successfully' : 'but not found'}`);
    return result;
  } catch (error) {
    console.error("❌ [getUpdatedHandover] Error retrieving handover doc:", error);
    throw error;
  }
};

// Import the sendHandoverApprovalEmails function from your email service module
