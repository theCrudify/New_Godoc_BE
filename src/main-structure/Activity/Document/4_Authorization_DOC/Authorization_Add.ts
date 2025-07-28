import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";
import { sendSubmissionEmails } from "../../Email/EmailAuthorization/Email_Create_AuthDoc"

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
    position?: number; // Add position for sorting
};

// Interface untuk template approval authorization
interface AuthApprovalTemplate {
    id: number;
    template_name: string;
    line_code: string | null;
    step_order: number;
    actor_name: string;
    model_type: 'section' | 'department';
    section_id: number | null;
    use_dynamic_section: boolean;
    use_line_section: boolean;
    is_insert_step: boolean;
    insert_after_step: number | null;
    applies_to_lines: any;
    is_active: boolean;
    priority: number;
    description: string | null;
}

// Interface untuk fetch configuration
interface FetchConfiguration {
    modelType: 'section' | 'department';
    sectionId: number;
    directorship: string;
    position: number;
}

// Helper function untuk mengecek apakah line code berlaku untuk insert step
function checkLineApplies(appliesTo: any, lineCode: string): boolean {
    if (!appliesTo) {
        console.log(`❌ No applies_to_lines defined`);
        return false;
    }
    
    try {
        let lineArray: string[] = [];
        
        // Jika appliesTo adalah string JSON
        if (typeof appliesTo === 'string') {
            const parsed = JSON.parse(appliesTo);
            if (Array.isArray(parsed)) {
                lineArray = parsed;
            }
        }
        // Jika appliesTo sudah array
        else if (Array.isArray(appliesTo)) {
            lineArray = appliesTo;
        }
        // Jika appliesTo adalah object dengan array
        else if (typeof appliesTo === 'object' && appliesTo !== null) {
            lineArray = appliesTo;
        }
        
        const isApplicable = lineArray.includes(lineCode);
        console.log(`🔍 Checking line '${lineCode}' against applies_to_lines: ${JSON.stringify(lineArray)} = ${isApplicable}`);
        
        return isApplicable;
    } catch (error) {
        console.error('Error parsing applies_to_lines:', error);
        return false;
    }
}

// Function untuk transform template data
function transformAuthTemplate(template: any): AuthApprovalTemplate {
    return {
        id: template.id,
        template_name: template.template_name,
        line_code: template.line_code,
        step_order: template.step_order,
        actor_name: template.actor_name,
        model_type: template.model_type,
        section_id: template.section_id,
        use_dynamic_section: template.use_dynamic_section ?? false,
        use_line_section: template.use_line_section ?? false,
        is_insert_step: template.is_insert_step ?? false,
        insert_after_step: template.insert_after_step,
        applies_to_lines: template.applies_to_lines,
        is_active: template.is_active ?? true,
        priority: template.priority ?? 0,
        description: template.description
    };
}

// Function untuk mendapatkan template approval authorization dengan insert step system
async function getAuthApprovalTemplates(line_code: string): Promise<AuthApprovalTemplate[]> {
    try {
        console.log(`🎯 Getting auth approval templates for line_code: ${line_code}`);

        // 1. Ambil default templates (base flow) - selalu digunakan
        const defaultTemplates = await prismaDB2.mst_template_approval_authorization.findMany({
            where: {
                line_code: null,
                is_insert_step: false, // Bukan insert step
                is_active: true,
                is_deleted: false
            },
            orderBy: { step_order: 'asc' }
        });

        // 2. Ambil insert steps yang KHUSUS berlaku untuk line_code ini
        const insertSteps = await prismaDB2.mst_template_approval_authorization.findMany({
            where: {
                is_insert_step: true,
                is_active: true,
                is_deleted: false
            }
        });

        console.log(`📋 Found ${defaultTemplates.length} default templates and ${insertSteps.length} potential insert steps`);

        // 3. Filter insert steps yang berlaku untuk line_code ini
        const applicableInsertSteps = insertSteps.filter(step => {
            return checkLineApplies(step.applies_to_lines, line_code);
        });

        console.log(`📋 Found ${applicableInsertSteps.length} applicable insert steps for line_code: ${line_code}`);

        // 4. Jika tidak ada insert steps yang berlaku, return default flow saja
        if (applicableInsertSteps.length === 0) {
            console.log(`📋 Using default flow for ${line_code} (${defaultTemplates.length} steps)`);
            return defaultTemplates.map((template, index) => {
                const transformed = transformAuthTemplate(template);
                transformed.step_order = index + 1; // Ensure sequential step ordering
                return transformed;
            });
        }

        // 5. Build final flow dengan insert steps di posisi yang tepat
        const finalTemplates: AuthApprovalTemplate[] = [];
        let currentStep = 1;

        // Group insert steps by insert_after_step
        const insertStepMap = new Map<number, any[]>();
        applicableInsertSteps.forEach(step => {
            const afterStep = step.insert_after_step || 0;
            if (!insertStepMap.has(afterStep)) {
                insertStepMap.set(afterStep, []);
            }
            insertStepMap.get(afterStep)!.push(step);
        });

        // Process each default template dan insert steps di posisi yang tepat
        defaultTemplates.forEach((defaultTemplate, index) => {
            // Tambahkan default template
            const transformed = transformAuthTemplate(defaultTemplate);
            transformed.step_order = currentStep++;
            finalTemplates.push(transformed);
            console.log(`  📋 Step ${transformed.step_order}: ${transformed.actor_name} (Default)`);

            // Check apakah ada insert steps setelah step ini
            const insertsAfterThisStep = insertStepMap.get(defaultTemplate.step_order) || [];
            insertsAfterThisStep.forEach(insertStep => {
                const insertTransformed = transformAuthTemplate(insertStep);
                insertTransformed.step_order = currentStep++;
                finalTemplates.push(insertTransformed);
                console.log(`  ✅ Step ${insertTransformed.step_order}: ${insertTransformed.actor_name} (${line_code} INSERT)`);
            });
        });

        console.log(`🎉 Final flow for ${line_code}: ${finalTemplates.length} steps`);
        return finalTemplates;

    } catch (error) {
        console.error("Error getting auth approval templates:", error);
        return [];
    }
}

// Function untuk build fetch configurations dari templates
function buildFetchConfigurations(
    templates: AuthApprovalTemplate[],
    sectionDepartmentId: number,
    lineCode: string
): FetchConfiguration[] {
    const configs: FetchConfiguration[] = [];

    templates.forEach((template, index) => {
        // Resolve section_id berdasarkan konfigurasi template
        let sectionId = template.section_id;
        
        if (template.use_dynamic_section) {
            sectionId = sectionDepartmentId;
        }
        
        if (template.use_line_section) {
            // Query ke mst_line untuk mendapatkan section dari line_code
            // Ini bisa di-implement sesuai struktur database
            console.log(`⚠️ Line section resolution not implemented for ${lineCode}`);
        }

        if (sectionId) {
            configs.push({
                modelType: template.model_type,
                sectionId: sectionId,
                directorship: template.actor_name,
                position: template.step_order
            });
        } else {
            console.warn(`⚠️ Could not resolve section_id for template: ${template.actor_name}`);
        }
    });

    return configs.sort((a, b) => a.position - b.position);
}

// Function untuk fetch head data (section head atau department head)
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

        console.log(`fetchHeadData ${directorship} (section_id: ${sectionId}): found ${results.length} records`);

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

// Function getAllHeadsDataWithTemplate yang diperbaiki
async function getAllHeadsDataWithTemplate(
    section_department_id: number,
    line_code: string,
): Promise<HeadData[]> {
    try {
        console.log(`getAllHeadsDataWithTemplate called with section_department_id: ${section_department_id}, line_code: "${line_code}"`);
        
        // Normalize line_code
        const normalizedLineCode = line_code?.trim() || '';
        console.log(`Normalized line_code: "${normalizedLineCode}"`);

        // 1. Dapatkan template approval untuk Authorization Document
        const templates = await getAuthApprovalTemplates(normalizedLineCode);

        if (templates.length === 0) {
            console.warn("⚠️ No approval templates found for authorization document");
            return [];
        }

        console.log(`📋 Selected ${templates.length} unique authorization templates after deduplication`);

        // 2. Build fetch configurations dari templates
        const fetchConfigs = buildFetchConfigurations(templates, section_department_id, normalizedLineCode);
        
        console.log(`🔧 Built ${fetchConfigs.length} fetch configurations from templates`);
        console.log('Fetch configurations from templates:', JSON.stringify(fetchConfigs, null, 2));

        if (fetchConfigs.length === 0) {
            console.warn("⚠️ No valid fetch configurations built from templates");
            return [];
        }

        // 3. Fetch head data berdasarkan configurations
        const allResults: HeadData[] = [];
        
        for (const config of fetchConfigs) {
            console.log(`🔄 Processing config: ${config.directorship} (${config.modelType}, section_id: ${config.sectionId})`);
            
            const headData = await fetchHeadData(
                config.modelType,
                config.sectionId,
                config.directorship
            );
            
            if (headData.length > 0) {
                // Add position untuk sorting
                headData.forEach(head => {
                    head.position = config.position;
                });
                allResults.push(...headData);
                console.log(`✅ Found ${headData.length} heads for ${config.directorship}`);
            } else {
                console.warn(`⚠️ No heads found for ${config.directorship} in section ${config.sectionId}`);
            }
        }

        // 4. Remove duplicates dan sort by position
        const uniqueHeads: HeadData[] = [];
        const seenCodes = new Set<string>();

        // Sort by position first
        allResults.sort((a, b) => (a.position || 0) - (b.position || 0));

        allResults.forEach((head: HeadData) => {
            if (head.employee_code && !seenCodes.has(head.employee_code)) {
                seenCodes.add(head.employee_code);
                uniqueHeads.push(head);
            }
        });

        console.log(`🎉 Final result: ${uniqueHeads.length} unique heads`);
        uniqueHeads.forEach((head, index) => {
            console.log(`  ${index + 1}. ${head.directorship}: ${head.employee_name} (${head.employee_code}), auth_id: ${head.id_authorization}`);
        });

        return uniqueHeads;

    } catch (error) {
        console.error("Error in getAllHeadsDataWithTemplate:", error);
        return [];
    }
}

// Create history record for Authorization Document
async function createAuthHistory(
    authdoc_id: number,
    auth_id: number,
    created_by: string,
    status: string = "submitted",
    note: string = ""
): Promise<void> {
    try {
        console.log(`💾 createAuthHistory started with:`, {
            authdoc_id,
            auth_id,
            created_by,
            status,
            note
        });

        // Get employee name
        const auth = await prismaDB2.mst_authorization.findUnique({
            where: { id: auth_id },
            select: { employee_name: true }
        });

        const employeeName = auth?.employee_name || "Unknown";
        console.log(`👤 Found employee name: ${employeeName}`);

        // Descriptions
        let description = "";
        switch (status) {
            case "updated":
                description = `${employeeName} has updated Authorization Document`;
                break;
            case "submitted":
                description = `${employeeName} was upload Authorization Document`;
                break;
            case "not_approved":
                description = `${employeeName} has not approved the Authorization Document`;
                break;
            case "rejected":
                description = `${employeeName} has rejected the Authorization Document`;
                break;
            case "approved":
                description = `${employeeName} has approved the Authorization Document`;
                break;
            default:
                description = `${employeeName} has changed Authorization Document status to ${status}`;
        }
        console.log(`📝 Generated description: ${description}`);

        // Notes
        let defaultNote = "";
        switch (status) {
            case "submitted":
                defaultNote = "This authorization document has been submitted.";
                break;
            case "updated":
                defaultNote = "This authorization document has been updated.";
                break;
            case "not_approved":
                defaultNote = "This authorization document has not been approved.";
                break;
            case "rejected":
                defaultNote = "This authorization document has been rejected.";
                break;
            case "approved":
                defaultNote = "This authorization document has been approved.";
                break;
            default:
                defaultNote = `Status has been changed to "${status}".`;
        }

        const finalNote = note || defaultNote;
        console.log(`📄 Using note: ${finalNote}`);

        const historyData = {
            description,
            employee_code: created_by,
            authdoc_id,
            auth_id,
            note: finalNote,
            status,
            created_date: new Date(),
            created_by,
            updated_date: new Date()
        };

        console.log(`💾 Inserting history record:`, JSON.stringify(historyData));

        const result = await prismaDB2.tr_authdoc_history.create({
            data: historyData
        });

        console.log(`✅ History record inserted with ID: ${result?.id || 'unknown'}`);
    } catch (error) {
        console.error("❌ Error creating history:", error);
        throw error;
    }
}

// Fungsi untuk menyiapkan data approval sesuai urutan yang diinginkan
function prepareApprovalData(
    authdoc_id: number,
    heads: HeadData[]
): Array<{
    authdoc_id: number;
    auth_id: number | null;
    step: number;
    actor: string;
    employee_code: string;
    status: string;
    created_date: Date;
}> {
    const validHeads = heads.filter(head => head.id_authorization !== null);
    console.log(`Preparing approval data from ${heads.length} heads, ${validHeads.length} valid heads with id_authorization`);

    return validHeads.map((head, index) => ({
        authdoc_id,
        auth_id: head.id_authorization,
        step: index + 1,
        actor: head.directorship,
        employee_code: head.employee_code || '',
        status: index === 0 ? 'on_going' : 'pending',
        created_date: new Date()
    }));
}

// Create approvals untuk Authorization Document
async function createdAuthApprovals(
    authdoc_id: number,
    section_department_id: number,
    line_code: string,
): Promise<void> {
    try {
        console.log(`Creating approvals for authdoc_id: ${authdoc_id}, section_id: ${section_department_id}, line_code: "${line_code}"`);

        // Get heads data menggunakan template approach
        const heads = await getAllHeadsDataWithTemplate(
            section_department_id,
            line_code,
        );

        console.log(`getAllHeadsDataWithTemplate returned ${heads.length} heads`);
        heads.forEach((head, index) => {
            console.log(`  ${index + 1}. ${head.directorship}: ${head.employee_name} (${head.employee_code}), auth_id: ${head.id_authorization}`);
        });

        // Prepare approval records
        const approvalData = prepareApprovalData(authdoc_id, heads);

        // Create records if we have any approvers
        if (approvalData.length > 0) {
            await prismaDB2.tr_authdoc_approval.createMany({
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

// Function untuk membuat entri di tabel tr_authdoc_member
const createAuthDocMembers = async (
    authdocId: number,
    members: Array<{ employee_code: string, employee_name: string, status?: string }>
): Promise<void> => {
    try {
        const membersData = members.map(member => ({
            authdoc_id: authdocId,
            employee_code: String(member.employee_code),
            employee_name: member.employee_name,
            status: member.status || "active",
            created_date: new Date(),
            is_deleted: false
        }));

        const result = await prismaDB2.tr_authdoc_member.createMany({
            data: membersData,
            skipDuplicates: true
        });

        console.log(`✅ Created ${result.count} members for auth doc ID ${authdocId}`);
    } catch (error) {
        console.error(`Error creating auth doc members for doc ID ${authdocId}:`, error);
        throw error;
    }
};

// Main function untuk membuat Authorization Document
export const createAuthDoc = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = req.body;
        console.log("✅ Received request to create new auth doc");

        // Validate required fields
        const requiredFields = [
            "description", "created_by", "auth_id",
            "plant_id", "department_id", "section_department_id",
            "doc_number", "implementation_date", "evaluation", "conclution",
        ];

        const missingFields = requiredFields.filter(field => !data[field]);
        if (missingFields.length > 0) {
            console.warn("❌ Validation failed. Missing fields:", missingFields);
            res.status(400).json({
                error: "Validation Error",
                details: `Missing fields: ${missingFields.join(", ")}`
            });
            return;
        }

        // Validate and extract line_code from doc_number
        console.log("Original doc_number:", data.doc_number);
        const docNumberParts = data.doc_number.split("/");
        if (docNumberParts.length < 2) {
            console.warn("❌ Invalid doc_number format:", data.doc_number);
            res.status(400).json({
                error: "Invalid doc_number format",
                details: "doc_number must follow the format: XX/LINE_CODE/..."
            });
            return;
        }
        const line_code = docNumberParts[1];
        console.log(`Extracted line_code: "${line_code}"`);

        // Create main record
        console.log("✅ Creating main record...");
        const newChange = await prismaDB2.tr_authorization_doc.create({
            data: {
                proposed_change_id: data.proposed_change_id,
                doc_number: data.doc_number,
                implementation_date: data.implementation_date ? new Date(data.implementation_date) : undefined,
                evaluation: data.evaluation,
                description: data.description,
                conclution: data.conclution,
                concept: data.concept,
                standart: data.standart,
                method: data.method,
                status: data.status || "submitted",
                created_by: data.created_by,
                created_date: new Date(),
                auth_id: data.auth_id,
                plant_id: data.plant_id,
                department_id: data.department_id,
                section_department_id: data.section_department_id,
            }
        });
        console.log(`✅ Main record created with ID: ${newChange.id}`);

        // Prepare parallel operations
        const operations = [
            createAuthHistory(
                newChange.id,
                data.auth_id,
                data.created_by,
                data.status || "submitted"
            ),
            createdAuthApprovals(
                newChange.id,
                data.section_department_id,
                line_code
            )
        ];

        if (data.members && Array.isArray(data.members) && data.members.length > 0) {
            console.log(`👥 Creating ${data.members.length} member(s) for this auth doc`);
            const createMembersOperation = createAuthDocMembers(
                newChange.id,
                data.members
            );
            operations.push(createMembersOperation);
        }

        console.log(`🚀 Running ${operations.length} parallel operations...`);
        await Promise.all(operations);
        console.log("✅ All parallel operations completed");

        // Send email notifications
        try {
            await sendSubmissionEmails(newChange.id, data.auth_id);
            console.log(`✉️ Submission notification emails sent for proposed change ${newChange.id}`);
        } catch (emailError) {
            console.error("⚠️ Error sending email notifications:", emailError);
        }

        res.status(201).json({
            message: "Authorization document created successfully",
            data: newChange
        });

    } catch (error) {
        console.error("❌ Error creating authorization document:", error);
        res.status(500).json({
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    } finally {
        await prismaDB2.$disconnect();
        console.log("🔌 Database connection closed");
    }
};

// Export functions
export { 
    getAuthApprovalTemplates, 
    buildFetchConfigurations, 
    getAllHeadsDataWithTemplate,
    AuthApprovalTemplate, 
    createAuthHistory, 
    createdAuthApprovals,
    fetchHeadData,
    checkLineApplies,
    transformAuthTemplate
};