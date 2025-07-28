// FILE: src/main-structure/Activity/Document/3_Authorization/ApproverSetup/ApproverAuthorizationController.ts
// CONTROLLER FOR AUTHORIZATION DOCUMENT APPROVER MANAGEMENT
// Mirror of ApproverProposedChangesController.ts but for Authorization Documents

import { Request, Response } from 'express';
import { prismaDB2 } from '../../../../../config/database';
import { sendApproverChangeRequestEmailAuthdoc, sendApproverChangeResultEmailAuthdoc } from './SendNotificationAuthdoc';

// ==========================================
// INTERFACES (Same as Proposed Changes)
// ==========================================

interface AuthenticatedUser {
  auth_id?: number;
  nik?: string;
  name?: string;
  employee_code?: string;
  employee_name?: string;
  email?: string;
  user_role?: 'user' | 'admin' | 'Super Admin';
  role?: {
    id?: number;
    role_name?: string;
    description?: string;
    created_at?: string;
    updated_at?: string | null;
    created_by?: string | null;
    updated_by?: string | null;
  };
  department?: {
    id?: number;
    department_name?: string;
    department_code?: string;
    plant_id?: number;
    status?: boolean;
    is_deleted?: boolean;
    created_by?: string | null;
    created_at?: string;
    updated_by?: string | null;
    updated_at?: string;
  };
  site?: {
    id?: number;
    plant_name?: string;
    plant_code?: string;
    address?: string;
    created_at?: string;
    created_by?: string;
    updated_at?: string | null;
    updated_by?: string | null;
  };
  section?: {
    id?: number;
    department_id?: number;
    section_name?: string;
    status?: boolean;
    created_by?: string | null;
    created_at?: string;
    updated_by?: string | null;
    updated_at?: string | null;
    is_deleted?: boolean;
  };
  // JWT fields
  iat?: number;
  exp?: number;
}

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

// ==========================================
// HELPER FUNCTIONS (Same as Proposed Changes)
// ==========================================

function getUserRole(user: AuthenticatedUser | undefined): string {
  if (!user) return '';
  
  // Prioritas: role.role_name (format baru) > user_role (format lama)
  if (user.role?.role_name) {
    return user.role.role_name;
  }
  
  if (user.user_role) {
    return user.user_role;
  }
  
  return '';
}

function isAdmin(user: AuthenticatedUser | undefined): boolean {
  const userRole = getUserRole(user);
  return ['Admin', 'Super Admin'].includes(userRole);
}

function getUserName(user: AuthenticatedUser | undefined): string {
  if (!user) return 'Unknown';
  
  // Prioritas: name > employee_name > email
  return user.name || user.employee_name || user.email || 'Unknown User';
}

function getUserCode(user: AuthenticatedUser | undefined): string {
  if (!user) return '';
  
  // Prioritas: employee_code > nik
  return user.employee_code || user.nik || '';
}

function logUserInfo(user: AuthenticatedUser | undefined, context: string = '') {
  console.log(`🔍 [${context}] User Info:`, {
    auth_id: user?.auth_id,
    name: user?.name,
    nik: user?.nik,
    employee_code: user?.employee_code,
    employee_name: user?.employee_name,
    email: user?.email,
    user_role: user?.user_role,
    role_name: user?.role?.role_name,
    final_role: getUserRole(user),
    final_name: getUserName(user),
    is_admin: isAdmin(user)
  });
}

// ==========================================
// 1. GET APPROVAL REQUESTS BY AUTHORIZATION DOC ID
// ==========================================

/**
 * GET APPROVAL REQUESTS BY AUTHORIZATION DOCUMENT ID
 * Endpoint: GET /api/authorization/approver-change/by-authdoc/:authorization_doc_id
 * 
 * USAGE:
 * - Frontend calls: /api/authorization/approver-change/by-authdoc/2?status=pending
 * - Returns: approval requests for specific authorization document with summary
 */
export const getApprovalRequestsByAuthdocId = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // ============ ENHANCED USER DEBUGGING ============
    console.log('🔍 [DEBUG] Raw req.user object:', JSON.stringify(req.user, null, 2));
    console.log('🔍 [DEBUG] Headers:', {
      authorization: req.headers.authorization ? 'Present' : 'Missing',
      'x-access-token': req.headers['x-access-token'] ? 'Present' : 'Missing',
      'content-type': req.headers['content-type']
    });

    // Check if middleware is working properly
    console.log('🔍 [DEBUG] Middleware check:', {
      userExists: !!req.user,
      userKeys: req.user ? Object.keys(req.user) : null,
      userType: typeof req.user
    });

    // Detailed role detection
    let roleName = null;
    let roleSource = 'unknown';
    
    if (req.user) {
      if (req.user.role?.role_name) {
        roleName = req.user.role.role_name;
        roleSource = 'role.role_name';
      } else if (req.user.user_role) {
        roleName = req.user.user_role;
        roleSource = 'user_role';
      }
    }

    console.log('🔍 [DEBUG] Role detection:', {
      roleName,
      roleSource,
      fullRoleObject: req.user?.role,
      isAdmin: ['Admin', 'Super Admin', 'admin'].includes(roleName || '')
    });

    // ============ 1. EXTRACT PARAMETERS ============
    const { authorization_doc_id } = req.params;
    const status = req.query.status as string;

    console.log("🔍 [Start] getApprovalRequestsByAuthdocId:", { 
      authorization_doc_id, 
      status, 
      user_role: req.user?.user_role,
      role_name: req.user?.role?.role_name,
      final_role: roleName,
      role_source: roleSource
    });

    // ============ 2. VALIDATE ADMIN ACCESS ============
    if (!roleName || !['Admin', 'Super Admin', 'admin'].includes(roleName)) {
      console.warn("❌ Unauthorized access attempt:", {
        roleName: roleName,
        roleSource: roleSource,
        userObject: req.user,
        detectedRole: roleName,
        allowedRoles: ['Admin', 'Super Admin', 'admin']
      });
      
      res.status(403).json({ 
        error: "Unauthorized: Admin access required",
        debug: process.env.NODE_ENV === 'development' ? {
          detected_role: roleName,
          role_source: roleSource,
          user_role_field: req.user?.user_role,
          role_name_field: req.user?.role?.role_name,
          full_user: req.user
        } : undefined
      });
      return;
    }

    console.log('✅ [ACCESS] Admin access granted:', {
      role: roleName,
      source: roleSource,
      auth_id: req.user?.auth_id
    });

    // ============ 3. VALIDATE INPUT ============
    if (!authorization_doc_id || isNaN(Number(authorization_doc_id))) {
      console.warn("❌ Invalid authorization_doc_id:", authorization_doc_id);
      res.status(400).json({ error: "Valid authorization_doc_id is required" });
      return;
    }

    // ============ 4. BUILD QUERY WHERE CLAUSE ============
    const whereClause: any = {
      authorization_doc_id: Number(authorization_doc_id),
      is_deleted: false
    };

    // Status filter (default to pending if not specified)
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      whereClause.status = status;
    } else {
      whereClause.status = 'pending'; // Default to pending requests
    }

    console.log("🔍 Query where clause:", whereClause);

    // ============ 5. FETCH APPROVAL REQUESTS ============
    const requests = await prismaDB2.tr_approver_change_request_authdoc.findMany({
      where: whereClause,
      include: {
        // Authorization Document Info
        tr_authorization_doc: {
          select: {
            id: true,
            doc_number: true,
            implementation_date: true,
            evaluation: true,
            description: true,
            concept: true,
            status: true,
            progress: true,
            department: {
              select: {
                department_name: true
              }
            },
            authorizationPlant: {
              select: {
                plant_name: true
              }
            }
          }
        },
        // Current Approver (yang akan diganti)
        current_authorization: {
          select: {
            employee_name: true,
            employee_code: true,
            email: true
          }
        },
        // New Approver (pengganti)
        new_authorization: {
          select: {
            employee_name: true,
            employee_code: true,
            email: true
          }
        },
        // Requester (yang mengajukan perubahan)
        requester_authorization: {
          select: {
            employee_name: true,
            employee_code: true,
            email: true
          }
        },
        // Approval Step Info - FIXED: gunakan tr_authdoc_approval
        tr_authdoc_approval: {
          select: {
            id: true,
            step: true,
            actor: true,
            status: true,
            note: true
          }
        }
      },
      orderBy: [
        { urgent: 'desc' },
        { priority: 'desc' },
        { created_date: 'desc' }
      ]
    });

    console.log("✅ Found requests:", requests.length);

    // ============ 6. GET SUMMARY COUNTS ============
    const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
      prismaDB2.tr_approver_change_request_authdoc.count({
        where: { 
          authorization_doc_id: Number(authorization_doc_id), 
          status: 'pending', 
          is_deleted: false 
        }
      }),
      prismaDB2.tr_approver_change_request_authdoc.count({
        where: { 
          authorization_doc_id: Number(authorization_doc_id), 
          status: 'approved', 
          is_deleted: false 
        }
      }),
      prismaDB2.tr_approver_change_request_authdoc.count({
        where: { 
          authorization_doc_id: Number(authorization_doc_id), 
          status: 'rejected', 
          is_deleted: false 
        }
      })
    ]);

    console.log("✅ Summary counts:", { pendingCount, approvedCount, rejectedCount });

    // ============ 7. SEND RESPONSE ============
    res.status(200).json({
      message: "Approval requests retrieved successfully",
      data: requests,
      summary: {
        authorization_doc_id: Number(authorization_doc_id),
        doc_info: requests.length > 0 ? requests[0].tr_authorization_doc : null,
        pending_count: pendingCount,
        approved_count: approvedCount,
        rejected_count: rejectedCount,
        total_count: pendingCount + approvedCount + rejectedCount
      }
    });

  } catch (error) {
    console.error("❌ Error getting approval requests by authorization doc ID:", error);
    res.status(500).json({ 
      error: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// ==========================================
// 2. REQUEST PERUBAHAN APPROVER OLEH USER
// ==========================================

/**
 * REQUEST PERUBAHAN APPROVER OLEH USER UNTUK AUTHORIZATION DOCUMENT
 * Endpoint: POST /api/authorization/approver-change/request
 */
export const requestApproverChangeAuthdoc = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      authorization_doc_id,
      approval_id,
      current_auth_id,
      new_auth_id,
      reason,
      urgent = false
    } = req.body;

    const requester_auth_id = req.user?.auth_id;

    console.log("🔧 [Start] Request perubahan approver authorization document oleh:", requester_auth_id);

    // Validasi input
    if (!authorization_doc_id || !approval_id || !current_auth_id || !new_auth_id || !reason) {
      console.warn("⚠️ Missing required fields:", req.body);
      res.status(400).json({ 
        error: "Missing required fields",
        required: ["authorization_doc_id", "approval_id", "current_auth_id", "new_auth_id", "reason"]
      });
      return;
    }

    // Validasi authorization document
    console.log("🔍 Validasi authorization document...");
    const authDoc = await prismaDB2.tr_authorization_doc.findUnique({
      where: { id: authorization_doc_id },
      select: {
        id: true,
        doc_number: true,
        description: true,
        status: true,
        progress: true
      }
    });

    if (!authDoc) {
      console.warn("❌ Authorization document tidak ditemukan");
      res.status(404).json({ error: "Authorization document tidak ditemukan" });
      return;
    }

    if (authDoc.status === 'done') {
      console.warn("⚠️ Authorization document sudah selesai:", authDoc.id);
      res.status(400).json({ error: "Authorization document sudah selesai, tidak dapat mengubah approver" });
      return;
    }

    // Validasi approval step - FIXED: gunakan tr_authdoc_approval
    console.log("🔍 Validasi approval step...");
    const approval = await prismaDB2.tr_authdoc_approval.findUnique({
      where: { id: approval_id },
      select: {
        id: true,
        authdoc_id: true,
        auth_id: true,
        step: true,
        status: true,
        actor: true
      }
    });

    if (!approval) {
      console.warn("❌ Approval step tidak ditemukan:", approval_id);
      res.status(404).json({ error: "Approval step tidak ditemukan" });
      return;
    }

    if (approval.authdoc_id !== authorization_doc_id) {
      console.warn("❌ Approval tidak sesuai dengan authorization document");
      res.status(400).json({ error: "Approval step tidak sesuai dengan authorization document" });
      return;
    }

    if (!['pending', 'on_going'].includes(approval.status || '')) {
      console.warn("❌ Approval sudah diproses:", approval.status);
      res.status(400).json({ error: `Approval sudah diproses (${approval.status}), tidak dapat diubah` });
      return;
    }

    if (approval.auth_id !== current_auth_id) {
      console.warn("❌ Current approver tidak sesuai dengan sistem");
      res.status(400).json({ error: "Current approver tidak sesuai dengan data di sistem" });
      return;
    }

    // Validasi new approver
    console.log("🔍 Validasi approver baru...");
    const newApprover = await prismaDB2.mst_authorization.findUnique({
      where: { id: new_auth_id },
      select: {
        id: true,
        employee_name: true,
        employee_code: true,
        email: true,
        status: true,
        is_deleted: true
      }
    });

    if (!newApprover || newApprover.is_deleted || !newApprover.status) {
      console.warn("❌ Approver baru tidak valid:", new_auth_id);
      res.status(400).json({ error: "Approver baru tidak valid atau tidak aktif" });
      return;
    }

    // Validasi current approver
    console.log("🔍 Validasi approver saat ini...");
    const currentApprover = await prismaDB2.mst_authorization.findUnique({
      where: { id: current_auth_id },
      select: {
        id: true,
        employee_name: true,
        employee_code: true,
        email: true
      }
    });

    if (!currentApprover) {
      console.warn("❌ Current approver tidak ditemukan:", current_auth_id);
      res.status(400).json({ error: "Current approver tidak ditemukan" });
      return;
    }

    // Cek request duplikat
    console.log("🔍 Cek apakah sudah ada request pending...");
    const existingRequest = await prismaDB2.tr_approver_change_request_authdoc.findFirst({
      where: {
        approval_id: approval_id,
        status: 'pending'
      }
    });

    if (existingRequest) {
      console.warn("⚠️ Sudah ada request pending untuk approval ini");
      res.status(400).json({ error: "Sudah ada request pending untuk approval step ini" });
      return;
    }

    // Buat request perubahan
    console.log("🛠 Membuat request perubahan approver...");
    const changeRequest = await prismaDB2.tr_approver_change_request_authdoc.create({
      data: {
        authorization_doc_id,
        approval_id,
        current_auth_id,
        new_auth_id,
        reason,
        urgent,
        requested_by: req.user?.employee_code || '',
        requester_auth_id,
        status: 'pending',
        priority: urgent ? 'urgent' : 'normal',
        created_date: new Date()
      },
      include: {
        tr_authorization_doc: {
          select: {
            doc_number: true,
            description: true,
            status: true,
            progress: true
          }
        },
        current_authorization: {
          select: {
            employee_name: true,
            employee_code: true,
            email: true
          }
        },
        new_authorization: {
          select: {
            employee_name: true,
            employee_code: true,
            email: true
          }
        },
        requester_authorization: {
          select: {
            employee_name: true,
            employee_code: true,
            email: true
          }
        },
        // FIXED: gunakan tr_authdoc_approval
        tr_authdoc_approval: {
          select: {
            step: true,
            actor: true,
            status: true
          }
        }
      }
    });

    // Kirim email
    console.log("📧 Mengirim email notifikasi ke admin...");
    await sendApproverChangeRequestEmailAuthdoc(changeRequest);

    // Tambah ke history - FIXED: gunakan tr_authdoc_history
    console.log("📝 Menyimpan ke riwayat perubahan...");
    await prismaDB2.tr_authdoc_history.create({
      data: {
        authdoc_id: authorization_doc_id,
        auth_id: requester_auth_id,
        description: "Request perubahan approver disubmit",
        note: `Request mengubah approver step ${approval.step} (${approval.actor}) dari ${currentApprover.employee_name} ke ${newApprover.employee_name}. Alasan: ${reason}`,
        status: 'change_requested',
        action_type: 'change_approver',
        related_request_id: changeRequest.id,
        created_date: new Date(),
        created_by: req.user?.employee_code
      }
    });

    console.log("✅ Request perubahan approver berhasil disubmit");

    res.status(201).json({
      message: "Request perubahan approver berhasil disubmit",
      data: {
        request_id: changeRequest.id,
        authorization_doc: changeRequest.tr_authorization_doc,
        from_approver: changeRequest.current_authorization,
        to_approver: changeRequest.new_authorization,
        reason: changeRequest.reason,
        urgent: changeRequest.urgent,
        status: changeRequest.status,
        created_date: changeRequest.created_date
      }
    });

  } catch (error) {
    console.error("❌ Error creating approver change request for authorization document:");
    console.error("Message:", (error as Error).message);

    if ((error as Error).stack) {
      console.error("Stack Trace:", (error as Error).stack);
    }

    if ((error as any).meta) {
      console.error("Prisma Error Meta:", (error as any).meta);
    }

    if ((error as any).code) {
      console.error("Prisma Error Code:", (error as any).code);
    }

    res.status(500).json({ 
      error: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// ==========================================
// 3. GET PENDING REQUESTS UNTUK ADMIN
// ==========================================

/**
 * GET PENDING REQUESTS UNTUK ADMIN (AUTHORIZATION DOCUMENTS)
 * Endpoint: GET /api/authorization/approver-change/pending
 */
export const getPendingApproverChangeRequestsAuthdoc = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const priority = req.query.priority as string;
    const searchTerm = req.query.search as string;

    // Validate admin role
    if (!['admin', 'Super Admin'].includes(req.user?.user_role || '')) {
      res.status(403).json({ error: "Unauthorized: Admin access required" });
      return;
    }

    const skip = (page - 1) * limit;

    // Build where clause
    const whereClause: any = {
      status: 'pending',
      is_deleted: false
    };

    if (priority && ['low', 'normal', 'high', 'urgent'].includes(priority)) {
      whereClause.priority = priority;
    }

    if (searchTerm) {
      whereClause.OR = [
        {
          tr_authorization_doc: {
            doc_number: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          }
        },
        {
          reason: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        },
        {
          current_authorization: {
            employee_name: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          }
        },
        {
          new_authorization: {
            employee_name: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          }
        }
      ];
    }

    // Get requests with pagination
    const [requests, totalCount] = await Promise.all([
      prismaDB2.tr_approver_change_request_authdoc.findMany({
        where: whereClause,
        include: {
          tr_authorization_doc: {
            select: {
              doc_number: true,
              description: true,
              status: true,
              progress: true,
              department: {
                select: { department_name: true }
              },
              authorizationPlant: {
                select: { plant_name: true }
              }
            }
          },
          current_authorization: {
            select: {
              employee_name: true,
              employee_code: true,
              email: true
            }
          },
          new_authorization: {
            select: {
              employee_name: true,
              employee_code: true,
              email: true
            }
          },
          requester_authorization: {
            select: {
              employee_name: true,
              employee_code: true,
              email: true
            }
          },
          // FIXED: gunakan tr_authdoc_approval
          tr_authdoc_approval: {
            select: {
              step: true,
              actor: true,
              status: true
            }
          }
        },
        orderBy: [
          { urgent: 'desc' },
          { priority: 'desc' },
          { created_date: 'desc' }
        ],
        skip,
        take: limit
      }),
      prismaDB2.tr_approver_change_request_authdoc.count({
        where: whereClause
      })
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      message: "Pending approver change requests retrieved successfully",
      data: requests,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_count: totalCount,
        limit,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });

  } catch (error) {
    console.error("❌ Error getting pending requests:", error);
    res.status(500).json({ 
      error: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// ==========================================
// 4. PROCESS REQUEST OLEH ADMIN (APPROVE/REJECT)
// ==========================================

/**
 * PROCESS REQUEST OLEH ADMIN (APPROVE/REJECT) UNTUK AUTHORIZATION DOCUMENT
 * Endpoint: PATCH /api/authorization/approver-change/:id/process
 */
export const processApproverChangeRequestAuthdoc = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // DEBUG: Log info user yang sedang login
    console.log("==== DEBUG: User Info ====");
    console.log("Auth ID:", req.user?.auth_id);
    console.log("NIK:", (req.user as any)?.nik);
    console.log("Name:", (req.user as any)?.name);
    console.log("Role Object:", (req.user as any)?.role);
    console.log("Role Name:", (req.user as any)?.role?.role_name);
    console.log("==========================");

    const { id } = req.params;
    const { status, admin_decision } = req.body;
    const admin_auth_id = req.user?.auth_id;

    // Validate input
    if (!['approved', 'rejected'].includes(status)) {
      res.status(400).json({ 
        error: "Status harus 'approved' atau 'rejected'" 
      });
      return;
    }

    if (!admin_decision || admin_decision.trim() === '') {
      res.status(400).json({ 
        error: "Admin decision wajib diisi" 
      });
      return;
    }

    // FIXED: Extract role name correctly from nested object
    const userAny = req.user as any;
    const roleName = userAny?.role?.role_name;  // Get role_name from nested role object
    
    console.log("🔍 [ROLE_CHECK] Extracted role name:", roleName);

    // Validate admin role - FIXED to use correct role name
    if (!['admin', 'Super Admin', 'Admin'].includes(roleName || '')) {
      console.log("❌ [ACCESS_DENIED] Role validation failed:", {
        extractedRoleName: roleName,
        allowedRoles: ['admin', 'Super Admin', 'Admin']
      });
      
      res.status(403).json({ 
        error: "Unauthorized: Admin access required",
        debug: {
          extractedRoleName: roleName,
          allowedRoles: ['admin', 'Super Admin', 'Admin']
        }
      });
      return;
    }

    console.log("✅ [ACCESS_GRANTED] Admin access granted for role:", roleName);

    const changeRequest = await prismaDB2.tr_approver_change_request_authdoc.findUnique({
      where: { id: Number(id) },
      include: {
        // FIXED: gunakan tr_authdoc_approval
        tr_authdoc_approval: true,
        tr_authorization_doc: {
          select: {
            doc_number: true,
            description: true,
            status: true,
            progress: true
          }
        },
        current_authorization: {
          select: {
            employee_name: true,
            employee_code: true,
            email: true
          }
        },
        new_authorization: {
          select: {
            employee_name: true,
            employee_code: true,
            email: true
          }
        },
        requester_authorization: {
          select: {
            employee_name: true,
            employee_code: true,
            email: true
          }
        }
      }
    });

    if (!changeRequest) {
      res.status(404).json({ error: "Request tidak ditemukan" });
      return;
    }

    if (changeRequest.status !== 'pending') {
      res.status(400).json({ 
        error: `Request sudah diproses dengan status: ${changeRequest.status}` 
      });
      return;
    }

    const approval = changeRequest.tr_authdoc_approval;
    if (!approval || !['pending', 'on_going'].includes(approval.status || '')) {
      res.status(400).json({ 
        error: `Approval step sudah diproses (${approval?.status}), tidak dapat diubah` 
      });
      return;
    }

    const processedDate = new Date();
    let updatedApproval = null;

    // FIXED: Extract user info correctly based on actual token structure
    const employeeCode = userAny?.nik || `USER_${admin_auth_id}`;  // Use 'nik' field
    const employeeName = userAny?.name || 'Admin User';           // Use 'name' field

    console.log("🔍 [USER_INFO] Extracted user info:", {
      employeeCode,
      employeeName,
      roleName,
      admin_auth_id
    });

    const updatedRequest = await prismaDB2.tr_approver_change_request_authdoc.update({
      where: { id: Number(id) },
      data: {
        status: status as 'approved' | 'rejected',
        admin_decision: admin_decision.trim(),
        processed_by: employeeCode,
        processed_by_auth_id: admin_auth_id,
        processed_date: processedDate
      }
    });

    if (status === 'approved') {
      const currentApproval = approval;
      const newVersion = (currentApproval?.version || 1) + 1;

      // FIXED: gunakan tr_authdoc_approval
      updatedApproval = await prismaDB2.tr_authdoc_approval.update({
        where: { id: changeRequest.approval_id },
        data: {
          auth_id: changeRequest.new_auth_id,
          version: newVersion,
          original_auth_id: changeRequest.current_auth_id,
          changed_from_request_id: changeRequest.id,
          change_reason: changeRequest.reason,
          changed_by: admin_auth_id,
          changed_date: processedDate,
          is_changed: true,
          note: `Approver diubah dari ${changeRequest.current_authorization?.employee_name} ke ${changeRequest.new_authorization?.employee_name} berdasarkan request #${changeRequest.id}. Keputusan admin: ${admin_decision}`
        }
      });

      await prismaDB2.tr_approver_change_history_authdoc.create({
        data: {
          approval_id: changeRequest.approval_id,
          authorization_doc_id: changeRequest.authorization_doc_id,
          change_request_id: changeRequest.id,
          action_type: 'change_approved',
          from_auth_id: changeRequest.current_auth_id,
          to_auth_id: changeRequest.new_auth_id,
          version_from: currentApproval?.version || 1,
          version_to: newVersion,
          reason: changeRequest.reason,
          actor_auth_id: admin_auth_id,
          actor_name: employeeName,
          actor_role: roleName,
          metadata: {
            admin_decision,
            request_id: changeRequest.id,
            processed_by: employeeCode,
            urgent: changeRequest.urgent,
            priority: changeRequest.priority
          },
          created_date: processedDate,
          ip_address: req.ip || req.socket.remoteAddress
        }
      });

      // FIXED: gunakan tr_authdoc_history
      await prismaDB2.tr_authdoc_history.create({
        data: {
          authdoc_id: changeRequest.authorization_doc_id,
          auth_id: admin_auth_id,
          description: "Approver berhasil diubah oleh admin",
          note: `Approver step ${currentApproval?.step} (${currentApproval?.actor}) diubah dari ${changeRequest.current_authorization?.employee_name} ke ${changeRequest.new_authorization?.employee_name}. Keputusan admin: ${admin_decision}`,
          status: 'approver_changed',
          action_type: 'change_approver',
          related_request_id: changeRequest.id,
          created_date: processedDate,
          created_by: employeeCode
        }
      });
    } else {
      // FIXED: gunakan tr_authdoc_history
      await prismaDB2.tr_authdoc_history.create({
        data: {
          authdoc_id: changeRequest.authorization_doc_id,
          auth_id: admin_auth_id,
          description: "Request perubahan approver ditolak oleh admin",
          note: `Request mengubah approver step ${approval?.step} dari ${changeRequest.current_authorization?.employee_name} ke ${changeRequest.new_authorization?.employee_name} ditolak. Keputusan admin: ${admin_decision}`,
          status: 'change_rejected',
          action_type: 'change_approver',
          related_request_id: changeRequest.id,
          created_date: processedDate,
          created_by: employeeCode
        }
      });
    }

    await sendApproverChangeResultEmailAuthdoc(changeRequest, status, admin_decision);

    await prismaDB2.tr_notification_log_authdoc.create({
      data: {
        notification_type: `approver_change_${status}`,
        recipients: [changeRequest.requester_authorization?.email || ''].filter(Boolean),
        sent_count: changeRequest.requester_authorization?.email ? 1 : 0,
        urgent: changeRequest.urgent,
        related_id: changeRequest.id,
        details: {
          request_id: changeRequest.id,
          admin_decision,
          processed_by: employeeCode,
          processed_by_name: employeeName
        }
      }
    });

    res.status(200).json({
      message: `Request berhasil ${status === 'approved' ? 'disetujui' : 'ditolak'}`,
      data: {
        request_id: changeRequest.id,
        status: updatedRequest.status,
        admin_decision,
        processed_by: employeeName,
        processed_date: processedDate,
        updated_approval: updatedApproval ? {
          id: updatedApproval.id,
          new_approver: changeRequest.new_authorization,
          version: updatedApproval.version,
          changed_date: updatedApproval.changed_date
        } : null
      }
    });

  } catch (error) {
    console.error("❌ Error processing approver change request for authorization document:", error);
    res.status(500).json({ 
      error: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// ==========================================
// 5. GET ALL APPROVER CHANGE REQUESTS (NOT JUST PENDING)
// ==========================================

/**
 * GET ALL APPROVER CHANGE REQUESTS (NOT JUST PENDING) FOR AUTHORIZATION DOCUMENTS
 * Endpoint: GET /api/authorization/approver-change/all
 */
export const getAllApproverChangeRequestsAuthdoc = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const priority = req.query.priority as string;
    const status = req.query.status as string;
    const searchTerm = req.query.search as string;

    // Validate admin role
    if (!['admin', 'Admin', 'Super Admin'].includes(req.user?.user_role || '')) {
      res.status(403).json({ error: "Unauthorized: Admin access required" });
      return;
    }

    const skip = (page - 1) * limit;

    // Build where clause
    const whereClause: any = {
      is_deleted: false
    };

    // Status filter (jika tidak ada status, tampilkan semua)
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      whereClause.status = status;
    }

    if (priority && ['low', 'normal', 'high', 'urgent'].includes(priority)) {
      whereClause.priority = priority;
    }

    if (searchTerm) {
      whereClause.OR = [
        {
          tr_authorization_doc: {
            doc_number: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          }
        },
        {
          reason: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        },
        {
          current_authorization: {
            employee_name: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          }
        },
        {
          new_authorization: {
            employee_name: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          }
        }
      ];
    }

    // Get requests with pagination
    const [requests, totalCount] = await Promise.all([
      prismaDB2.tr_approver_change_request_authdoc.findMany({
        where: whereClause,
        include: {
          tr_authorization_doc: {
            select: {
              doc_number: true,
              description: true,
              status: true,
              progress: true,
              department: {
                select: { department_name: true }
              },
              authorizationPlant: {
                select: { plant_name: true }
              }
            }
          },
          current_authorization: {
            select: {
              employee_name: true,
              employee_code: true,
              email: true
            }
          },
          new_authorization: {
            select: {
              employee_name: true,
              employee_code: true,
              email: true
            }
          },
          requester_authorization: {
            select: {
              employee_name: true,
              employee_code: true,
              email: true
            }
          },
          // FIXED: gunakan tr_authdoc_approval
          tr_authdoc_approval: {
            select: {
              step: true,
              actor: true,
              status: true
            }
          }
        },
        orderBy: [
          { urgent: 'desc' },
          { priority: 'desc' },
          { created_date: 'desc' }
        ],
        skip,
        take: limit
      }),
      prismaDB2.tr_approver_change_request_authdoc.count({
        where: whereClause
      })
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      message: "All approver change requests retrieved successfully",
      data: requests,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_count: totalCount,
        limit,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });

  } catch (error) {
    console.error("❌ Error getting all requests:", error);
    res.status(500).json({ 
      error: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// ==========================================
// 6. GET APPROVER CHANGE REQUEST STATISTICS
// ==========================================

/**
 * GET APPROVER CHANGE REQUEST STATISTICS FOR AUTHORIZATION DOCUMENTS
 * Endpoint: GET /api/authorization/approver-change/stats
 */
export const getApproverChangeRequestStatsAuthdoc = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Validate admin role
    if (!['admin', 'Admin', 'Super Admin'].includes(req.user?.user_role || '')) {
      res.status(403).json({ error: "Unauthorized: Admin access required" });
      return;
    }

    // Get counts by status
    const [pendingCount, approvedCount, rejectedCount, urgentCount] = await Promise.all([
      prismaDB2.tr_approver_change_request_authdoc.count({
        where: { status: 'pending', is_deleted: false }
      }),
      prismaDB2.tr_approver_change_request_authdoc.count({
        where: { status: 'approved', is_deleted: false }
      }),
      prismaDB2.tr_approver_change_request_authdoc.count({
        where: { status: 'rejected', is_deleted: false }
      }),
      prismaDB2.tr_approver_change_request_authdoc.count({
        where: { urgent: true, status: 'pending', is_deleted: false }
      })
    ]);

    // Get recent requests (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentRequestsCount = await prismaDB2.tr_approver_change_request_authdoc.count({
      where: {
        created_date: { gte: sevenDaysAgo },
        is_deleted: false
      }
    });

    res.status(200).json({
      message: "Approver change request statistics retrieved successfully",
      data: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        urgent: urgentCount,
        recent_requests: recentRequestsCount,
        total: pendingCount + approvedCount + rejectedCount
      }
    });

  } catch (error) {
    console.error("❌ Error getting request stats:", error);
    res.status(500).json({ 
      error: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// ==========================================
// 7. GET DETAILED APPROVAL REQUEST WITH FULL CONTEXT
// ==========================================

/**
 * GET DETAILED APPROVAL REQUEST WITH FULL CONTEXT FOR AUTHORIZATION DOCUMENTS
 * Endpoint: GET /api/authorization/approver-change/detail/:id
 */
export const getApprovalRequestDetailAuthdoc = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate admin role (commented out to allow users to see their own requests)
    // if (!['admin', 'Admin', 'Super Admin'].includes(req.user?.user_role || '')) {
    //   res.status(403).json({ error: "Unauthorized: Admin access required" });
    //   return;
    // }

    if (!id || isNaN(Number(id))) {
      res.status(400).json({ error: "Valid request ID is required" });
      return;
    }

    const request = await prismaDB2.tr_approver_change_request_authdoc.findUnique({
      where: { 
        id: Number(id),
        is_deleted: false 
      },
      include: {
        tr_authorization_doc: {
          include: {
            department: true,
            authorizationPlant: true,
            section_department: true
          }
        },
        current_authorization: {
          select: {
            id: true,
            employee_name: true,
            employee_code: true,
            email: true,
          }
        },
        new_authorization: {
          select: {
            id: true,
            employee_name: true,
            employee_code: true,
            email: true,
          }
        },
        requester_authorization: {
          select: {
            id: true,
            employee_name: true,
            employee_code: true,
            email: true,
          }
        },
        // FIXED: gunakan tr_authdoc_approval
        tr_authdoc_approval: {
          include: {
            authorization: {
              select: {
                employee_name: true,
                employee_code: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!request) {
      res.status(404).json({ error: "Approval request not found" });
      return;
    }

    // Get approval history for this specific approval step
    const approvalHistory = await prismaDB2.tr_approver_change_history_authdoc.findMany({
      where: {
        change_request_id: request.id
      },
      orderBy: {
        created_date: 'desc'
      }
    });

    res.status(200).json({
      message: "Approval request detail retrieved successfully",
      data: {
        request: request,
        approval_history: approvalHistory
      }
    });

  } catch (error) {
    console.error("❌ Error getting approval request detail:", error);
    res.status(500).json({ 
      error: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
};

// ==========================================
// MAINTENANCE NOTES
// ==========================================

/*
MAINTENANCE GUIDE untuk Authorization Document Approver Management:

1. COMMON ISSUES & FIXES:
   - 403 Error: Check isAdmin() function dan user role structure
   - Empty data: Check whereClause dan database records
   - Include errors: Verify Prisma relation names dengan suffix _authdoc

2. DATABASE DEPENDENCIES:
   - tr_approver_change_request_authdoc (main table)
   - tr_authorization_doc (document info)
   - mst_authorization (user info)
   - tr_authdoc_approval (approval steps) ✅ FIXED
   - tr_authdoc_history (document history) ✅ FIXED

3. RESPONSE STRUCTURE:
   {
     message: string,
     data: ApprovalRequest[],
     summary: {
       authorization_doc_id: number,
       doc_info: object | null,
       pending_count: number,
       approved_count: number,
       rejected_count: number,
       total_count: number
     }
   }

4. FRONTEND INTEGRATION:
   - URL: /api/authorization/approver-change/by-authdoc/:id
   - Query params: ?status=pending|approved|rejected
   - Authentication: Requires Admin role

5. TESTING:
   - Test dengan authorization_doc_id yang valid
   - Test berbagai status filter
   - Test dengan user role yang berbeda
   - Check console logs untuk debugging

6. PERFORMANCE:
   - Query sudah optimized dengan proper select
   - Menggunakan Promise.all untuk parallel count queries
   - Index recommended: authorization_doc_id, status, is_deleted

7. DIFFERENCES FROM PROPOSED CHANGES:
   - Table names: tr_*_authdoc instead of tr_*
   - Document field: authorization_doc_id instead of proposed_changes_id
   - Document relation: tr_authorization_doc instead of tr_proposed_changes
   - Approval table: tr_authdoc_approval instead of tr_proposed_changes_approval ✅ FIXED
   - History table: tr_authdoc_history instead of tr_proposed_changes_history ✅ FIXED
   - Notification table: tr_notification_log_authdoc instead of tr_notification_log

8. FIXED ISSUES:
   - ✅ Replaced tr_authdoc_approval_extended with tr_authdoc_approval
   - ✅ Replaced tr_authdoc_history_extended with tr_authdoc_history
   - ✅ Updated all Prisma queries to use correct model names
   - ✅ Fixed include relations to match actual schema
   - ✅ Verified all field names match database schema
*/