import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";
import { sendApprovalEmails } from '../../../Activity/Email/EmailProposedChanges/Email_Approval_Proposed';

/**
 * Mendapatkan semua approval dengan status on_going, not_approved, atau rejected
 * @param req Request object
 * @param res Response object untuk mengirim hasil query
 */
export const getAllOngoingApprovals = async (req: Request, res: Response): Promise<void> => {
  console.log("🔍 [START] getAllOngoingApprovals");
  try {
    // Query untuk mendapatkan semua approval dengan status on_going, not_approved, atau rejected
    const approvals = await prismaDB2.tr_proposed_changes_approval.findMany({
      where: {
        OR: [  // Menggunakan OR untuk mencakup semua status ini
          { status: "on_going" },
          { status: "not_approved" },
          { status: "rejected" },
        ]
      },
      orderBy: [
        { proposed_changes_id: 'asc' },
        { step: 'asc' }
      ]
    });

    console.log(`✅ Found ${approvals.length} ongoing approvals`);
    res.status(200).json({
      status: true,
      message: "Data approval berhasil ditemukan",
      data: approvals
    });
  } catch (error) {
    console.error("❌ Error saat mengambil data approval:", error);
    res.status(500).json({
      status: false,
      error: "Internal Server Error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
    console.log("🔍 [END] getAllOngoingApprovals");
  }
};

/**
 * Mendapatkan approval berdasarkan ID dan dapat mendukung berbagai filter pencarian
 * @param req Request object dengan query parameters
 * @param res Response object
 */
export const getOngoingApprovalsByAuthId = async (req: Request, res: Response): Promise<void> => {
  console.log("🔍 [START] getOngoingApprovalsByAuthId", req.query);
  try {
    // Ekstrak query parameters dengan default values
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const searchTerm = (req.query.search as string) || "";
    const sortColumn = (req.query.sort as string) || "id";
    const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

    // Definisi kolom yang diperbolehkan untuk sorting
    const validSortColumns = [
      "id", "project_name", "document_number_id", "item_changes",
      "line_code", "section_code", "department_id",
      "section_department_id", "plant_id", "change_type",
      "status", "created_date", "planning_start", "planning_end",
      "progress", "need_engineering_approval", "need_production_approval"
    ];

    // Validasi sortColumn dan set default jika tidak valid
    const orderBy: any = validSortColumns.includes(sortColumn)
      ? { [sortColumn]: sortDirection }
      : { id: "asc" };

    const offset = (page - 1) * limit;

    // Inisialisasi whereCondition
    const whereCondition: any = {
      is_deleted: false
    };

    // Array untuk kondisi AND
    const andConditions = [];

    // Tambahkan kondisi pencarian (Search Term)
    if (searchTerm) {
      andConditions.push({
        OR: [
          { project_name: { contains: searchTerm } },
          { item_changes: { contains: searchTerm } },
          { line_code: { contains: searchTerm } },
          { section_code: { contains: searchTerm } },
          { change_type: { contains: searchTerm } },
          { description: { contains: searchTerm } },
          { status: { contains: searchTerm } }
        ]
      });
    }

    // Filter by status
    if (req.query.status) {
      andConditions.push({ status: req.query.status as string });
    }

    // Filter by change_type
    if (req.query.change_type) {
      andConditions.push({ change_type: req.query.change_type as string });
    }

    // Filter by plant_id
    if (req.query.plant_id) {
      andConditions.push({ plant_id: Number(req.query.plant_id) });
    }

    // Filter by department_id
    if (req.query.department_id) {
      andConditions.push({ department_id: Number(req.query.department_id) });
    }

    // Filter by section_department_id
    if (req.query.section_department_id) {
      andConditions.push({ section_department_id: Number(req.query.section_department_id) });
    }

    // Filter by line_code
    if (req.query.line_code) {
      andConditions.push({ line_code: req.query.line_code as string });
    }

    // Filter by engineering approval
    if (req.query.need_engineering_approval !== undefined) {
      andConditions.push({
        need_engineering_approval: req.query.need_engineering_approval === 'true'
      });
    }

    // Filter by production approval
    if (req.query.need_production_approval !== undefined) {
      andConditions.push({
        need_production_approval: req.query.need_production_approval === 'true'
      });
    }

    // Filter by progress
    if (req.query.progress) {
      andConditions.push({ progress: req.query.progress as string });
    }

    // Filter by created_by
    if (req.query.created_by) {
      andConditions.push({ created_by: req.query.created_by as string });
    }

    // Filter by auth_id dengan status on_going atau not_approved
    if (req.query.approval_auth_id) {
      const approvalAuthId = Number(req.query.approval_auth_id);
      console.log(`🔍 Filtering by approval_auth_id: ${approvalAuthId}`);

      andConditions.push({
        approvals: {
          some: {
            auth_id: approvalAuthId,
            status: {
              in: ['on_going', 'not_approved']
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
        approvals: {
          some: {
            status: req.query.approval_status as string
          }
        }
      });
    }

    // Filter by employee code (approval actor)
    if (req.query.employee_code) {
      andConditions.push({
        approvals: {
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

    console.log(`🔍 Executing query with filters: ${JSON.stringify(whereCondition)}`);

    // Eksekusi query findMany dan count dalam transaksi
    const [proposedChanges, totalCount] = await prismaDB2.$transaction([
      prismaDB2.tr_proposed_changes.findMany({
        where: whereCondition,
        skip: offset,
        take: limit,
        orderBy,
        include: {
          plant: true,
          department: true,
          section_department: true,
          documentNumber: {
            include: {
              plant: true,
              category: true,
              area: {
                include: {
                  line: true
                }
              },
              section: true,
              authorization: true
            }
          },
          approvals: {
            include: {
              authorization: true
            }
          }
        }
      }),
      prismaDB2.tr_proposed_changes.count({
        where: whereCondition
      }),
    ]);

    // Kalkulasi pagination
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    console.log(`✅ Found ${totalCount} records, page ${page}/${totalPages}`);

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
    console.error("❌ Error in getOngoingApprovalsByAuthId:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    console.log("🔍 [END] getOngoingApprovalsByAuthId");
  }
};

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
  return Math.abs(hash).toString(16).substring(0, 8); // Ambil 8 karakter hex saja
}

/**
 * Memperbarui status approval dan melakukan aksi terkait
 * @param req Request object dengan body berisi proposed_changes_id, auth_id, status, note, employee_code
 * @param res Response object
 */
export const updateApprovalStatus = async (req: Request, res: Response): Promise<void> => {
  console.log("🔍 [START] updateApprovalStatus - Request body:", JSON.stringify(req.body));
  try {
    const { proposed_changes_id, auth_id, status, note, employee_code } = req.body;
    console.log(`📌 Processing approval - proposed_changes_id: ${proposed_changes_id}, auth_id: ${auth_id}, status: ${status}, note: "${note || "tidak ada"}"`);

    // Validasi parameter yang diperlukan
    if (!proposed_changes_id || !auth_id || !status) {
      console.log("❌ Validation failed: Missing required parameters");
      res.status(400).json({
        error: "Bad Request",
        message: "Required parameters missing: proposed_changes_id, auth_id, and status are required"
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
    console.log(`🔍 Searching for approval with proposed_changes_id: ${proposed_changes_id}, auth_id: ${auth_id}`);
    const currentApproval = await prismaDB2.tr_proposed_changes_approval.findFirst({
      where: {
        proposed_changes_id: Number(proposed_changes_id),
        auth_id: Number(auth_id)
      }
    });
    console.log("🔍 Current approval found:", currentApproval ? JSON.stringify(currentApproval) : "null");

    if (!currentApproval) {
      console.log("❌ No approval found with the provided IDs");
      res.status(404).json({
        error: "Not Found",
        message: "No approval found with the provided proposed_changes_id and auth_id"
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
    
    // Generate unique hash for note content for better duplicate detection
    const noteHash = hashString(note || '');
    console.log(`📝 Note hash: ${noteHash} for note: "${(note || '').substring(0, 30)}${note && note.length > 30 ? '...' : ''}"`);
    
    const existingIdenticalHistory = await prismaDB2.tr_proposed_changes_history.findFirst({
      where: {
        proposed_changes_id: Number(proposed_changes_id),
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
      const updatedProposedChange = await getUpdatedProposedChange(Number(proposed_changes_id));
      res.status(200).json({
        message: `Approval has been updated successfully (duplicate submission prevented)`,
        data: updatedProposedChange
      });
      return;
    }

    const currentStep = currentApproval.step || 0;
    const nextApprovalStep = currentStep + 1;
    console.log(`📊 Current step: ${currentStep}, Next step: ${nextApprovalStep}`);

    // Get all approvals before any updates to calculate progress correctly
    console.log(`🔍 Getting all approvals for proposed_changes_id: ${proposed_changes_id}`);
    const allApprovals = await prismaDB2.tr_proposed_changes_approval.findMany({
      where: { proposed_changes_id: Number(proposed_changes_id) }
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

    let updatedProposedChange: any;

    // Use a mutex-like approach with advisory lock
    // Create a lock key specific to this approval
    const lockKey = `approval_lock_${proposed_changes_id}_${auth_id}`;
    console.log(`🔒 Using lock key: ${lockKey}`);

    // Variabel untuk melacak berhasil atau tidaknya transaksi
    let transactionSuccessful = false;
    let transactionError = null;
    let maxTransactionAttempts = 3;
    let transactionAttempt = 0;
    let emailSent = false;

    // Loop untuk mencoba transaksi hingga berhasil atau mencapai batas percobaan
    while (transactionAttempt < maxTransactionAttempts && !transactionSuccessful) {
      try {
        console.log(`🔄 Starting transaction attempt #${transactionAttempt + 1}`);
        
        // Execute entire update logic as a single serialized transaction
        await prismaDB2.$transaction(async (prisma) => {
          console.log("🔄 Inside transaction");
          
          // Double-check for duplicates inside transaction for extra safety
          console.log("🔍 Double-checking for duplicates inside transaction");
          const duplicateCheck = await prisma.tr_proposed_changes_history.findFirst({
            where: {
              proposed_changes_id: Number(proposed_changes_id),
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
          await prisma.tr_proposed_changes_approval.update({
            where: { id: currentApproval.id },
            data: {
              status,
              updated_date: currentTimestamp
            }
          });
          console.log("✅ Approval status updated successfully");

          let newProposedStatus = 'onprogress';
          let isLastStep = false;

          // Handle moving to next step only when changing to 'approved'
          if (status === 'approved') {
            console.log(`🔍 Checking for next step approval (step: ${nextApprovalStep})`);
            const nextApproval = await prisma.tr_proposed_changes_approval.findFirst({
              where: {
                proposed_changes_id: Number(proposed_changes_id),
                step: nextApprovalStep
              }
            });
            console.log("🔍 Next approval:", nextApproval ? `Found (id: ${nextApproval.id})` : "Not found");

            if (nextApproval) {
              // Only update next approval to on_going if it's not already in a valid status
              if (!validStatuses.includes(nextApproval.status ?? '')) {
                console.log(`✏️ Updating next approval (id: ${nextApproval.id}) to on_going`);
                await prisma.tr_proposed_changes_approval.update({
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
              newProposedStatus = 'done';
              isLastStep = true;
              console.log("📋 This is the last approval step, setting document status to 'done'");
            }
          }

          // Determine the overall proposed status based on the new approval status
          console.log("🔄 Determining final document status");
          if (status === 'not_approved') {
            newProposedStatus = 'not_approved';
            console.log("📋 Setting document status to 'not_approved' due to current approval status");
          } else if (status === 'rejected') {
            newProposedStatus = 'rejected';
            console.log("📋 Setting document status to 'rejected' due to current approval status");
          } else if (status === 'approved' && progressPercentage === 100 && newProposedStatus !== 'done') {
            newProposedStatus = 'approved';
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
            newProposedStatus = 'rejected';
            console.log("📋 Overriding document status to 'rejected' due to rejections");
          }
          // If any approval is not_approved and none are rejected, overall status should be not_approved
          else if (hasNotApproved) {
            newProposedStatus = 'not_approved';
            console.log("📋 Overriding document status to 'not_approved' due to not_approved statuses");
          }

          console.log(`✏️ Updating document (id: ${proposed_changes_id}) to status: ${newProposedStatus}, progress: ${progressPercentage}%`);
          await prisma.tr_proposed_changes.update({
            where: { id: Number(proposed_changes_id) },
            data: {
              status: newProposedStatus,
              progress: `${progressPercentage}%`,
              updated_at: currentTimestamp
            }
          });
          console.log("✅ Document updated successfully");

          // Check for previous not_approved status for message
          console.log("🔍 Checking for previous not_approved history");
          const previousNotApproved = await prisma.tr_proposed_changes_history.findFirst({
            where: {
              proposed_changes_id: Number(proposed_changes_id),
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
            description = `${authName} has approved the Proposed Changes`;
          } else if (status === 'not_approved') {
            if (previousNotApproved) {
              description = `${authName} not approved again the Proposed Changes`;
            } else {
              description = `${authName} has not approved the Proposed Changes`;
            }
          } else if (status === 'rejected') {
            description = `${authName} has rejected the Proposed Changes`;
          }
          console.log(`📝 Generated description: "${description}"`);

          // Create history entry - use exact same timestamp for both dates
          console.log("✏️ Creating history entry");
          await prisma.tr_proposed_changes_history.create({
            data: {
              proposed_changes_id: Number(proposed_changes_id),
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

    // Get the final updated proposed change after the transaction
    console.log(`🔍 Getting updated proposed change data for id: ${proposed_changes_id}`);
    updatedProposedChange = await getUpdatedProposedChange(Number(proposed_changes_id));
    console.log("✅ Retrieved updated proposed change data");

    // INTEGRATION WITH EMAIL SERVICE - Teruskan note langsung
    try {
      // Kirim email sesuai dengan status approval
      // Kirim email hanya jika belum dikirim
      if (!emailSent) {
        console.log(`📧 Sending email notification with note: "${note || 'tidak ada'}"`);
        
        // Teruskan note dari request saat ini ke fungsi email
        await sendApprovalEmails(
          Number(proposed_changes_id),
          Number(auth_id),
          status,
          currentStep,
          note // Teruskan note langsung dari request body ke fungsi email
        );
        emailSent = true;
        console.log("✅ Email sent successfully");
      }
    } catch (emailError) {
      console.error("❌ Error sending email notification:", emailError);
      console.error("❌ Email error details:", emailError instanceof Error ? emailError.message : String(emailError));
      // Continue processing even if email fails - don't blokir proses utama
    }

    console.log("✅ [END] updateApprovalStatus - Operation completed successfully");
    res.status(200).json({
      message: `Approval has been updated to '${status}' successfully`,
      data: updatedProposedChange
    });

  } catch (error: any) {
    console.error("❌ [ERROR] updateApprovalStatus:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      error: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Helper function to get the updated proposed change with all related data
// This function retrieves the complete proposed change data including all related entities
const getUpdatedProposedChange = async (proposedChangesId: number) => {
  console.log(`🔍 [getUpdatedProposedChange] Retrieving complete proposed change data for id: ${proposedChangesId}`);
  try {
    const result = await prismaDB2.tr_proposed_changes.findUnique({
      where: { id: proposedChangesId },
      include: {
        plant: true,
        department: true,
        section_department: true,
        documentNumber: {
          include: {
            plant: true,
            category: true,
            area: {
              include: {
                line: true
              }
            },
            section: true,
            authorization: true
          }
        },
        approvals: {
          include: {
            authorization: true
          },
          orderBy: {
            step: 'asc'
          }
        },
        changeHistories: {
          orderBy: {
            created_date: 'desc'
          }
        }
      }
    });
    console.log(`✅ [getUpdatedProposedChange] Retrieved data ${result ? 'successfully' : 'but not found'}`);
    return result;
  } catch (error) {
    console.error("❌ [getUpdatedProposedChange] Error retrieving proposed change:", error);
    throw error;
  }
};