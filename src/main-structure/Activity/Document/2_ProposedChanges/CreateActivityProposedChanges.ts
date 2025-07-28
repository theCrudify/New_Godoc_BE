import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";
import { sendSubmissionEmails } from "../../Email/EmailProposedChanges/Email_Create_Proposed"

// Define types untuk data yang lebih konsisten
type HeadData = {
  id: number;
  id_authorization: number | null;
  employee_code: string | null;
  employee_name: string | null;
  authorization_status: boolean | null;
  section_id: number | null;
  department_id: number | null;
  department_name: string | null;
  section_name: string | null;
  directorship: string;
  created_by: string | null;
  is_deleted: boolean;
};

// Type untuk template approval - Updated to match Prisma schema
type ApprovalTemplate = {
  id: number;
  template_name: string;
  line_code: string | null;
  need_engineering_approval: boolean | null;
  need_production_approval: boolean | null;
  step_order: number;
  actor_name: string;
  model_type: 'section' | 'department';
  section_id: number | null;
  use_dynamic_section: boolean;
  use_line_section: boolean;
  is_active: boolean;
  priority: number;
  description: string | null;
};

// Function untuk fetch head data (section head atau department head) - TIDAK BERUBAH
async function fetchHeadData(
  modelType: 'section' | 'department',
  sectionId: number,
  directorship: string
): Promise<HeadData[]> {
  if (!sectionId) return [];

  const commonInclude = {
    authorization: {
      select: {
        id: true,
        employee_code: true,
        employee_name: true,
        status: true
      }
    },
    section: {
      select: {
        id: true,
        department_id: true,
        section_name: true,
        department: {
          select: {
            department_name: true
          }
        }
      }
    }
  };

  try {
    let results;

    if (modelType === 'section') {
      results = await prismaDB2.mst_section_head.findMany({
        where: {
          is_deleted: false,
          section_id: sectionId
        },
        include: commonInclude
      });
    } else {
      results = await prismaDB2.mst_department_head.findMany({
        where: {
          is_deleted: false,
          section_id: sectionId
        },
        include: commonInclude
      });
    }

    return results.map(item => ({
      id: item.id,
      id_authorization: item.authorization?.id ?? null,
      employee_code: item.authorization?.employee_code ?? null,
      employee_name: item.authorization?.employee_name ?? null,
      authorization_status: item.authorization?.status ?? null,
      section_id: item.section?.id ?? null,
      department_id: item.section?.department_id ?? null,
      department_name: item.section?.department?.department_name ?? null,
      section_name: item.section?.section_name ?? null,
      directorship,
      created_by: item.created_by ?? null,
      is_deleted: item.is_deleted ?? false
    }));
  } catch (error) {
    console.error(`Error fetching ${directorship}:`, error);
    return [];
  }
}

// Function untuk mendapatkan template approval berdasarkan kriteria
async function getApprovalTemplates(
  line_code: string,
  need_engineering_approval: boolean,
  need_production_approval: boolean
): Promise<ApprovalTemplate[]> {
  try {
    // Query untuk mendapatkan template yang sesuai dengan kriteria
    const templates = await prismaDB2.mst_template_approval_proposedchanges.findMany({
      where: {
        is_active: true,
        is_deleted: false,
        AND: [
          // Filter berdasarkan line_code
          {
            OR: [
              { line_code: null }, // Template umum
              { line_code: line_code } // Template spesifik line
            ]
          },
          // Filter berdasarkan need_engineering_approval
          {
            OR: [
              { need_engineering_approval: null }, // Template yang tidak peduli engineering
              { need_engineering_approval: need_engineering_approval } // Template spesifik engineering
            ]
          },
          // Filter berdasarkan need_production_approval
          {
            OR: [
              { need_production_approval: null }, // Template yang tidak peduli production
              { need_production_approval: need_production_approval } // Template spesifik production
            ]
          }
        ]
      },
      orderBy: [
        { step_order: 'asc' },
        { priority: 'desc' } // Priority tinggi akan dipilih jika ada konflik
      ]
    });

    console.log(`📋 Found ${templates.length} templates for line_code: ${line_code}, engineering: ${need_engineering_approval}, production: ${need_production_approval}`);

    // Deduplikasi berdasarkan step_order, pilih yang priority tertinggi
    const uniqueTemplates: ApprovalTemplate[] = [];
    const seenSteps = new Set<number>();

    templates.forEach(template => {
      if (!seenSteps.has(template.step_order)) {
        seenSteps.add(template.step_order);
        
        // Transform data untuk mengatasi null values dan type compatibility
        const transformedTemplate: ApprovalTemplate = {
          id: template.id,
          template_name: template.template_name,
          line_code: template.line_code,
          need_engineering_approval: template.need_engineering_approval,
          need_production_approval: template.need_production_approval,
          step_order: template.step_order,
          actor_name: template.actor_name,
          model_type: template.model_type,
          section_id: template.section_id,
          use_dynamic_section: template.use_dynamic_section ?? false, // Convert null to false
          use_line_section: template.use_line_section ?? false, // Convert null to false
          is_active: template.is_active ?? true, // Convert null to true
          priority: template.priority ?? 0, // Convert null to 0
          description: template.description
        };
        
        uniqueTemplates.push(transformedTemplate);
        console.log(`  Step ${template.step_order}: ${template.actor_name} (${template.template_name})`);
      }
    });

    return uniqueTemplates;
  } catch (error) {
    console.error("Error getting approval templates:", error);
    return [];
  }
}

// Function untuk resolve section_id berdasarkan konfigurasi template
async function resolveSectionId(
  template: ApprovalTemplate,
  section_department_id: number,
  line_code: string
): Promise<number | null> {
  try {
    // Jika menggunakan dynamic section (section_department_id dari request)
    if (template.use_dynamic_section) {
      return section_department_id;
    }

    // Jika menggunakan line section (mencari dari mst_line)
    if (template.use_line_section) {
      const lineData = await prismaDB2.mst_line.findFirst({
        where: { code_line: line_code },
        select: { id_section_manufacture: true }
      });

      if (lineData && lineData.id_section_manufacture) {
        console.log(`🔗 Resolved line section for ${line_code}: ${lineData.id_section_manufacture}`);
        return lineData.id_section_manufacture;
      } else {
        console.warn(`⚠️ Line section not found for line_code: ${line_code}`);
        return null;
      }
    }

    // Jika menggunakan section_id fix dari template
    if (template.section_id) {
      return template.section_id;
    }

    console.warn(`⚠️ Could not resolve section_id for template: ${template.template_name}`);
    return null;
  } catch (error) {
    console.error(`Error resolving section_id for template ${template.template_name}:`, error);
    return null;
  }
}

// REFACTORED: Get all heads data menggunakan template system
async function getAllHeadsData(
  section_department_id: number,
  line_code: string,
  need_engineering_approval: boolean,
  need_production_approval: boolean
): Promise<HeadData[]> {
  try {
    console.log(`🎯 Getting approval templates for line: ${line_code}, engineering: ${need_engineering_approval}, production: ${need_production_approval}`);

    // 1. Dapatkan template approval berdasarkan kriteria
    const templates = await getApprovalTemplates(
      line_code,
      need_engineering_approval,
      need_production_approval
    );

    if (templates.length === 0) {
      console.warn("⚠️ No approval templates found for given criteria");
      return [];
    }

    // 2. Fetch data heads berdasarkan template
    const allResults: HeadData[] = [];

    for (const template of templates) {
      console.log(`🔄 Processing template: ${template.template_name} (Step ${template.step_order})`);

      // Resolve section_id berdasarkan konfigurasi template
      const resolvedSectionId = await resolveSectionId(template, section_department_id, line_code);

      if (!resolvedSectionId) {
        console.warn(`⚠️ Skipping template ${template.template_name} - could not resolve section_id`);
        continue;
      }

      // Update actor name jika menggunakan line section (untuk menambahkan line_code ke nama)
      let actorName = template.actor_name;
      if (template.use_line_section) {
        actorName = `${template.actor_name} (${line_code})`;
      }

      // Fetch head data
      const headData = await fetchHeadData(
        template.model_type,
        resolvedSectionId,
        actorName
      );

      if (headData.length > 0) {
        allResults.push(...headData);
        console.log(`✅ Found ${headData.length} heads for ${actorName}`);
      } else {
        console.warn(`⚠️ No heads found for ${actorName} in section ${resolvedSectionId}`);
      }
    }

    // 3. Remove duplicates based on employee_code
    const uniqueHeads: HeadData[] = [];
    const seenCodes = new Set<string>();

    allResults.forEach((head: HeadData) => {
      if (head.employee_code && !seenCodes.has(head.employee_code)) {
        seenCodes.add(head.employee_code);
        uniqueHeads.push(head);
      }
    });

    console.log(`🎉 Final result: ${uniqueHeads.length} unique heads`);
    uniqueHeads.forEach((head, index) => {
      console.log(`  ${index + 1}. ${head.directorship}: ${head.employee_name} (${head.employee_code})`);
    });

    return uniqueHeads;
  } catch (error) {
    console.error("Error in getAllHeadsData:", error);
    if (error instanceof Error) {
      console.error(`Nama error: ${error.name}, Pesan: ${error.message}`);
      if (error.stack) {
        console.error(`Stack: ${error.stack}`);
      }
    }
    return [];
  }
}

// Create history record - TIDAK BERUBAH
async function createProposedChangeHistory(
  proposed_changes_id: number,
  auth_id: number,
  created_by: string,
  status: string = "submitted",
  note: string = ""
): Promise<void> {
  try {
    // Get employee name ok
    const auth = await prismaDB2.mst_authorization.findUnique({
      where: { id: auth_id },
      select: { employee_name: true }
    });

    const employeeName = auth?.employee_name || "Unknown";

    // Descriptions
    let description = "";
    switch (status) {
      case "updated":
        description = `${employeeName} has updated Proposed Changes`;
        break;
      case "submitted":
        description = `${employeeName} was upload Proposed Changes`;
        break;
      case "not_approved":
        description = `${employeeName} has not approved the Proposed Changes`;
        break;
      case "rejected":
        description = `${employeeName} has rejected the Proposed Changes`;
        break;
      case "approved":
        description = `${employeeName} has approved the Proposed Changes`;
        break;
      default:
        description = `${employeeName} has changed Proposed Changes status to ${status}`;
    }

    // Notes
    let defaultNote = "";
    switch (status) {
      case "submitted":
        defaultNote = "This proposed change has been submitted.";
        break;
      case "updated":
        defaultNote = "This proposed change has been updated.";
        break;
      case "not_approved":
        defaultNote = "This proposed change has not been approved.";
        break;
      case "rejected":
        defaultNote = "This proposed change has been rejected.";
        break;
      case "approved":
        defaultNote = "This proposed change has been approved.";
        break;
      default:
        defaultNote = `Status has been changed to "${status}".`;
    }

    await prismaDB2.tr_proposed_changes_history.create({
      data: {
        description,
        employee_code: created_by,
        proposed_changes_id,
        auth_id,
        note: note || defaultNote,
        status,
        created_date: new Date(),
        created_by
      }
    });

    console.log(`📜 History inserted for proposed_change_id ${proposed_changes_id} with status "${status}"`);
  } catch (error) {
    console.error("Error creating history:", error);
    throw error;
  }
}

// Fungsi untuk menyiapkan data approval sesuai urutan yang diinginkan - TIDAK BERUBAH
function prepareApprovalData(
  proposed_changes_id: number,
  heads: HeadData[]
): Array<{
  proposed_changes_id: number;
  auth_id: number | null;
  step: number;
  actor: string;
  employee_code: string;
  status: string;
  created_date: Date;
}> {
  // Filter head yang memiliki id_authorization dan siapkan data approval
  return heads
    .filter(head => head.id_authorization !== null)
    .map((head, index) => ({
      proposed_changes_id,
      auth_id: head.id_authorization,
      step: index + 1,
      actor: head.directorship,
      employee_code: head.employee_code || '',
      // Urutan pertama menjadi on_going, sisanya pending
      status: index === 0 ? 'on_going' : 'pending',
      created_date: new Date()
    }));
}

// Create approvals - TIDAK BERUBAH KECUALI NAMA PARAMETER
async function createProposedChangeApprovals(
  proposed_changes_id: number,
  section_department_id: number,
  line_code: string,
  need_engineering_approval: boolean,
  need_production_approval: boolean
): Promise<void> {
  try {
    // Get heads data menggunakan system template yang baru
    const heads = await getAllHeadsData(
      section_department_id,
      line_code,
      need_engineering_approval,
      need_production_approval
    );

    // Prepare approval records menggunakan fungsi khusus
    const approvalData = prepareApprovalData(proposed_changes_id, heads);

    // Create records if we have any approvers
    if (approvalData.length > 0) {
      // Using createMany for better performance
      await prismaDB2.tr_proposed_changes_approval.createMany({
        data: approvalData
      });

      console.log(`✅ Created ${approvalData.length} approval records with ordered steps:`);
      approvalData.forEach(item => {
        console.log(`   Step ${item.step}: ${item.actor} (${item.employee_code})`);
      });
    } else {
      console.log("⚠️ No approval records created - no valid approvers found");
    }
  } catch (error) {
    console.error("Error creating approvals:", error);
    throw error;
  }
}

// Main function to create proposed change - TIDAK BERUBAH
export const createProposedChange = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = req.body;

    // Validate required fields
    const requiredFields = [
      "project_name", "line_code", "section_code",
      "department_id", "section_department_id", "plant_id",
      "change_type", "description", "reason", "created_by", "auth_id"
    ];

    const missingFields = requiredFields.filter(field => !data[field]);
    if (missingFields.length > 0) {
      res.status(400).json({
        error: "Validation Error",
        details: `Missing fields: ${missingFields.join(", ")}`
      });
      return;
    }

    // Convert boolean fields to ensure consistent types
    const need_engineering_approval = data.need_engineering_approval === true;
    const need_production_approval = data.need_production_approval === true;

    // Create main record
    const newChange = await prismaDB2.tr_proposed_changes.create({
      data: {
        project_name: data.project_name,
        document_number_id: data.document_number_id,
        item_changes: data.item_changes,
        line_code: data.line_code,
        section_code: data.section_code,
        section_name: data.section_name,
        department_id: data.department_id,
        section_department_id: data.section_department_id,
        plant_id: data.plant_id,
        auth_id: data.auth_id,
        change_type: data.change_type,
        description: data.description,
        reason: data.reason,
        cost: data.cost,
        cost_text: data.cost_text,
        planning_start: data.planning_start ? new Date(data.planning_start) : undefined,
        planning_end: data.planning_end ? new Date(data.planning_end) : undefined,
        created_by: data.created_by,
        created_date: new Date(),
        need_engineering_approval,
        need_production_approval,
        other_sytem: data.other_sytem,
        status: data.status || "submitted",
        progress: data.progress
      }
    });

    // Create history and approvals in parallel
    await Promise.all([
      createProposedChangeHistory(
        newChange.id,
        data.auth_id,
        data.created_by,
        data.status || "submitted"
      ),
      createProposedChangeApprovals(
        newChange.id,
        data.section_department_id,
        data.line_code,
        need_engineering_approval,
        need_production_approval
      )
    ]);

    // Send email notifications
    try {
      console.log("📤 Sending submission email with:", {
        id: newChange.id,
        auth_id: data.auth_id
      });

      await sendSubmissionEmails(newChange.id, data.auth_id);
      console.log(`✉️ Submission notification emails sent for proposed change ${newChange.id}`);
    } catch (emailError) {
      console.error("Error sending email notifications:", emailError);
    }

    res.status(201).json({
      message: "Proposed change created successfully",
      data: newChange
    });

  } catch (error) {
    console.error("Error creating proposed change:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
}

// Export functions
export { 
  getAllHeadsData, 
  createProposedChangeHistory, 
  createProposedChangeApprovals,
  getApprovalTemplates,
  resolveSectionId
};