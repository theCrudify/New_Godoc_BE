import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";
import { sendSubmissionEmails } from "../../Email/EmailHandover/EmailSubmitHandover";
import { PrismaClient } from "@prisma/client";

// Types and Interfaces
interface SingleAdditionalApprover {
    id: number;
    employee_code: string | null;
    employee_name: string | null;
    actor_name: string;
    section_id: number;
    line_code: string;
    insert_position: number;
}

interface HandoverCreationData {
    doc_number: string;
    auth_id: number;
    auth_id2?: number;
    auth_id3?: number;
    auth_id4?: number;
    auth_id5?: number;
    proposed_change_id: number;
    authdoc_id?: number;
    plant_id: number;
    department_id: number;
    section_department_id: number;
    material: string;
    remark?: string;
    status?: string;
    created_by: string;
}

interface HandoverCreationResult {
    handover: any;
    totalApprovers: number;
    additionalApproverInfo: SingleAdditionalApprover | null;
}

// Prisma Transaction Type
type PrismaTransaction = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'>;

// Authorization Type
interface AuthorizationData {
    id: number;
    employee_code: string | null;
    employee_name: string | null;
    status?: string;
}

// Custom Error Classes
class ValidationError extends Error {
    constructor(message: string, public field?: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

class BusinessLogicError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BusinessLogicError';
    }
}

class DatabaseError extends Error {
    constructor(message: string, public originalError?: Error) {
        super(message);
        this.name = 'DatabaseError';
    }
}

// Service Class with Transaction Support
class HandoverService {
    private prisma: PrismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prisma = prismaClient;
    }

    /**
     * Create handover with full transaction support
     */
    async createHandover(data: HandoverCreationData): Promise<HandoverCreationResult> {
        // Start transaction
        return await this.prisma.$transaction(async (tx: PrismaTransaction) => {
            try {
                // console.log("🔄 Starting handover creation transaction");

                // Validate input data
                this.validateHandoverData(data);

                // Extract line code
                const lineCode = this.extractLineCode(data.doc_number);
                // console.log(`📋 Processing handover for line code: ${lineCode}`);

                // Get additional approver based on line code
                const additionalApprover = await this.getSingleAdditionalApprover(tx, lineCode);

                // Process approvers
                const manualApprovers = [data.auth_id, data.auth_id2, data.auth_id3, data.auth_id4, data.auth_id5];
                const finalApproverIds = this.insertSingleAdditionalApprover(manualApprovers, additionalApprover);

                if (finalApproverIds.length === 0) {
                    throw new BusinessLogicError("No valid approvers found after processing");
                }

                // Create main handover record
                const handover = await this.createHandoverRecord(tx, data, finalApproverIds);
                // console.log(`✅ Handover record created with ID: ${handover.id}`);

                // Create history entry
                await this.createHandoverHistory(
                    tx,
                    handover.id,
                    data.auth_id,
                    data.created_by,
                    data.status || "submitted"
                );

                // Create approval records
                await this.createHandoverApprovals(tx, handover.id, finalApproverIds, additionalApprover);

                // console.log("🎉 Transaction completed successfully");

                return {
                    handover,
                    totalApprovers: finalApproverIds.length,
                    additionalApproverInfo: additionalApprover
                };

            } catch (error) {
                // console.error("❌ Transaction failed, rolling back:", error);
                throw error;
            }
        }, {
            maxWait: 10000, // 10 seconds
            timeout: 30000, // 30 seconds
            isolationLevel: 'ReadCommitted'
        });
    }

    /**
     * Validate handover creation data
     */
    private validateHandoverData(data: HandoverCreationData): void {
        const requiredFields = [
            "doc_number", "auth_id", "proposed_change_id",
            "plant_id", "department_id", "section_department_id",
            "material", "created_by"
        ];

        const missingFields = requiredFields.filter(field => !data[field as keyof HandoverCreationData]);
        
        if (missingFields.length > 0) {
            throw new ValidationError(`Missing required fields: ${missingFields.join(", ")}`);
        }

        // Validate doc_number format
        if (!data.doc_number.includes('/') || data.doc_number.split('/').length < 2) {
            throw new ValidationError("Invalid doc_number format. Must follow pattern: XX/LINE_CODE/...", "doc_number");
        }

        // Validate primary approver
        if (!data.auth_id || data.auth_id <= 0) {
            throw new ValidationError("Primary approver (auth_id) is required", "auth_id");
        }
    }

    /**
     * Extract line code from document number
     */
    private extractLineCode(docNumber: string): string {
        const parts = docNumber.split("/");
        if (parts.length < 2) {
            throw new ValidationError("Invalid document number format");
        }
        return parts[1];
    }

    /**
     * Check if line code needs additional approver
     */
    private checkLineNeedsAdditionalApprover(appliesTo: any, lineCode: string): boolean {
        if (!appliesTo) return false;
        
        try {
            let lineArray: string[] = [];
            
            if (typeof appliesTo === 'string') {
                const parsed = JSON.parse(appliesTo);
                lineArray = Array.isArray(parsed) ? parsed : [];
            } else if (Array.isArray(appliesTo)) {
                lineArray = appliesTo;
            }
            
            const isApplicable = lineArray.includes(lineCode);
            // console.log(`🔍 Line '${lineCode}' additional approver check: ${isApplicable}`);
            
            return isApplicable;
        } catch (error) {
            // console.error('Error parsing applies_to_lines:', error);
            return false;
        }
    }

    /**
     * Get single additional approver based on line code (within transaction)
     */
    private async getSingleAdditionalApprover(tx: PrismaTransaction, lineCode: string): Promise<SingleAdditionalApprover | null> {
        try {
            // console.log(`🎯 Checking additional approver for line_code: ${lineCode}`);

            // Find applicable insert step
            const insertStep = await tx.mst_template_approval_handover.findFirst({
                where: {
                    is_insert_step: true,
                    is_active: true,
                    is_deleted: false
                },
                orderBy: [
                    { priority: 'desc' },
                    { step_order: 'asc' }
                ]
            });

            if (!insertStep) {
                // console.log("📋 No insert steps configured");
                return null;
            }

            // Check if applicable to this line code
            if (!this.checkLineNeedsAdditionalApprover(insertStep.applies_to_lines, lineCode)) {
                // console.log(`📋 Line code '${lineCode}' does not need additional approver`);
                return null;
            }

            // Get section ID
            const sectionId = insertStep.section_id;
            if (!sectionId) {
                // console.warn(`⚠️ No section_id for insert step: ${insertStep.actor_name}`);
                return null;
            }

            // Find actual user based on model type
            let approverAuth = null;

            if (insertStep.model_type === 'section') {
                const sectionHead = await tx.mst_section_head.findFirst({
                    where: { section_id: sectionId, is_deleted: false },
                    include: {
                        authorization: {
                            select: {
                                id: true,
                                employee_code: true,
                                employee_name: true,
                                status: true
                            }
                        }
                    }
                });
                approverAuth = sectionHead?.authorization;
            } else if (insertStep.model_type === 'department') {
                const deptHead = await tx.mst_department_head.findFirst({
                    where: { section_id: sectionId, is_deleted: false },
                    include: {
                        authorization: {
                            select: {
                                id: true,
                                employee_code: true,
                                employee_name: true,
                                status: true
                            }
                        }
                    }
                });
                approverAuth = deptHead?.authorization;
            }

            if (!approverAuth) {
                // console.warn(`⚠️ No approver found for ${insertStep.actor_name} in section: ${sectionId}`);
                return null;
            }

            const additionalApprover: SingleAdditionalApprover = {
                id: approverAuth.id,
                employee_code: approverAuth.employee_code,
                employee_name: approverAuth.employee_name,
                actor_name: insertStep.actor_name,
                section_id: sectionId,
                line_code: lineCode,
                insert_position: insertStep.insert_after_step || 1
            };

            // console.log(`✅ Found additional approver: ${insertStep.actor_name} -> ${approverAuth.employee_name}`);
            return additionalApprover;

        } catch (error) {
            // console.error("Error getting additional approver:", error);
            throw new DatabaseError("Failed to get additional approver", error as Error);
        }
    }

    /**
     * Insert single additional approver into manual approvers list
     */
    private insertSingleAdditionalApprover(
        manualApprovers: (number | null | undefined)[],
        additionalApprover: SingleAdditionalApprover | null
    ): number[] {
        // Clean manual approvers
        const cleanManualApprovers = manualApprovers.filter(
            (id): id is number => id !== null && id !== undefined && id > 0
        );
        
        if (!additionalApprover) {
            // console.log(`📋 No additional approver, returning ${cleanManualApprovers.length} manual approvers`);
            return cleanManualApprovers;
        }

        // Check for duplicates
        if (cleanManualApprovers.includes(additionalApprover.id)) {
            // console.log(`⚠️ Additional approver already exists, skipping insert`);
            return cleanManualApprovers;
        }

        const finalApprovers: number[] = [];
        
        // Insert at correct position
        for (let i = 0; i < cleanManualApprovers.length; i++) {
            finalApprovers.push(cleanManualApprovers[i]);
            
            if ((i + 1) === additionalApprover.insert_position) {
                finalApprovers.push(additionalApprover.id);
                // console.log(`✅ Inserted additional approver at position ${finalApprovers.length}`);
            }
        }

        // If insert position is beyond array length, add at end
        if (additionalApprover.insert_position > cleanManualApprovers.length) {
            if (!finalApprovers.includes(additionalApprover.id)) {
                finalApprovers.push(additionalApprover.id);
                // console.log(`➕ Added additional approver at end`);
            }
        }

        // console.log(`🎉 Final approvers: ${finalApprovers.length} total`);
        return finalApprovers;
    }

    /**
     * Create main handover record (within transaction)
     */
    private async createHandoverRecord(tx: PrismaTransaction, data: HandoverCreationData, finalApproverIds: number[]): Promise<any> {
        try {
            const handoverData: any = {
                doc_number: data.doc_number,
                auth_id: finalApproverIds[0],
                auth_id2: finalApproverIds[1] || null,
                auth_id3: finalApproverIds[2] || null,
                auth_id4: finalApproverIds[3] || null,
                progress: "0%",
                status: data.status || "submitted",
                proposed_change_id: data.proposed_change_id,
                authdoc_id: data.authdoc_id || null,
                plant_id: data.plant_id,
                department_id: data.department_id,
                section_department_id: data.section_department_id,
                material: data.material,
                remark: data.remark || null,
                created_by: data.created_by,
                created_date: new Date(),
                is_deleted: false
            };

            // Add auth_id5 if available
            if (finalApproverIds[4]) {
                handoverData.auth_id5 = finalApproverIds[4];
            }

            return await tx.tr_handover.create({ data: handoverData });

        } catch (error) {
            // console.error("Error creating handover record:", error);
            throw new DatabaseError("Failed to create handover record", error as Error);
        }
    }

    /**
     * Create handover history (within transaction)
     */
    private async createHandoverHistory(
        tx: PrismaTransaction,
        handoverId: number,
        authId: number,
        createdBy: string,
        status: string = "submitted",
        note?: string
    ): Promise<void> {
        try {
            // Get employee name
            const auth: AuthorizationData | null = await tx.mst_authorization.findUnique({
                where: { id: authId },
                select: { 
                    id: true,
                    employee_name: true,
                    employee_code: true
                }
            });

            const employeeName = auth?.employee_name || "Unknown";

            // Generate description
            const description = this.generateStatusDescription(employeeName, status);
            const defaultNote = this.generateDefaultNote(status);

            await tx.tr_handover_history.create({
                data: {
                    description,
                    employee_code: createdBy,
                    handover_id: handoverId,
                    auth_id: authId,
                    note: note || defaultNote,
                    status,
                    created_date: new Date(),
                    created_by: createdBy,
                    updated_date: new Date()
                }
            });

            // console.log(`📜 History created for handover ${handoverId} with status: ${status}`);

        } catch (error) {
            console.error("Error creating handover history:", error);
            throw new DatabaseError("Failed to create handover history", error as Error);
        }
    }

    /**
     * Create handover approvals (within transaction)
     */
    private async createHandoverApprovals(
        tx: PrismaTransaction,
        handoverId: number,
        finalApproverIds: number[],
        additionalApprover: SingleAdditionalApprover | null
    ): Promise<void> {
        try {
            // Get auth details
            const authDetails: AuthorizationData[] = await tx.mst_authorization.findMany({
                where: {
                    id: { in: finalApproverIds },
                    is_deleted: false
                },
                select: {
                    id: true,
                    employee_code: true,
                    employee_name: true
                }
            });

            const authMap = new Map(authDetails.map(auth => [auth.id, auth]));

            // Prepare approval data
            const approvalData = finalApproverIds.map((authId, index) => {
                const auth = authMap.get(authId);
                
                let status: 'approved' | 'on_going' | 'pending' = 'pending';
                if (index === 0) status = 'approved'; // Submitter auto-approved
                else if (index === 1) status = 'on_going'; // Next approver is on-going
                
                // Determine actor name
                let actorName = `Manual Approver ${index + 1}`;
                if (additionalApprover && additionalApprover.id === authId) {
                    actorName = additionalApprover.actor_name;
                }

                return {
                    handover_id: handoverId,
                    auth_id: authId,
                    step: index + 1,
                    actor: actorName,
                    employee_code: auth?.employee_code || '',
                    status,
                    updated_date: new Date(),
                    created_date: new Date()
                };
            });

            // Create all approvals
            await tx.tr_handover_approval.createMany({
                data: approvalData
            });

            // console.log(`✅ Created ${approvalData.length} approval records`);

        } catch (error) {
            console.error("Error creating handover approvals:", error);
            throw new DatabaseError("Failed to create handover approvals", error as Error);
        }
    }

    /**
     * Generate status description
     */
    private generateStatusDescription(employeeName: string, status: string): string {
        const statusMap: { [key: string]: string } = {
            "submitted": "has submitted",
            "updated": "has updated",
            "approved": "has approved",
            "rejected": "has rejected",
            "not_approved": "has not approved"
        };

        const action = statusMap[status] || `has changed status to ${status}`;
        return `${employeeName} ${action} Handover Document`;
    }

    /**
     * Generate default note
     */
    private generateDefaultNote(status: string): string {
        const noteMap: { [key: string]: string } = {
            "submitted": "This handover document has been submitted with hybrid approval system.",
            "updated": "This handover document has been updated.",
            "approved": "This handover document has been approved.",
            "rejected": "This handover document has been rejected.",
            "not_approved": "This handover document has not been approved."
        };

        return noteMap[status] || `Status has been changed to "${status}".`;
    }
}

// Controller with proper error handling
export const createHandover = async (req: Request, res: Response): Promise<void> => {
    const handoverService = new HandoverService(prismaDB2);
    
    try {
        // console.log("🔍 Processing handover creation request");
        
        const data: HandoverCreationData = req.body;
        
        // Create handover with transaction
        const result = await handoverService.createHandover(data);
        
        // Send email notifications (outside transaction)
        try {
            // console.log("📤 Sending email notifications...");
            await sendSubmissionEmails(result.handover.id, data.auth_id);
            // console.log("✉️ Email notifications sent successfully");
        } catch (emailError) {
            console.error("⚠️ Email notification failed:", emailError);
            // Don't fail the entire operation for email errors
        }

        // Extract line code for response
        const lineCode = data.doc_number.split("/")[1];

        // Success response
        res.status(201).json({
            success: true,
            message: "Handover document created successfully",
            data: {
                handover: result.handover,
                approval_info: {
                    line_code: lineCode,
                    total_approvers: result.totalApprovers,
                    has_additional_approver: !!result.additionalApproverInfo,
                    additional_approver_detail: result.additionalApproverInfo ? {
                        name: result.additionalApproverInfo.employee_name,
                        role: result.additionalApproverInfo.actor_name,
                        insert_position: result.additionalApproverInfo.insert_position
                    } : null
                }
            }
        });

    } catch (error) {
        // console.error("❌ Error in handover creation:", error);
        
        // Handle different error types
        if (error instanceof ValidationError) {
            res.status(400).json({
                success: false,
                error: "Validation Error",
                message: error.message,
                field: error.field
            });
        } else if (error instanceof BusinessLogicError) {
            res.status(422).json({
                success: false,
                error: "Business Logic Error",
                message: error.message
            });
        } else if (error instanceof DatabaseError) {
            res.status(500).json({
                success: false,
                error: "Database Error",
                message: "Database operation failed",
                details: error.message
            });
        } else {
            res.status(500).json({
                success: false,
                error: "Internal Server Error",
                message: error instanceof Error ? error.message : "Unknown error occurred"
            });
        }
    } finally {
        // Ensure database connection is properly closed
        try {
            await prismaDB2.$disconnect();
            // console.log("🔌 Database connection closed");
        } catch (disconnectError) {
            console.error("Error disconnecting from database:", disconnectError);
        }
    }
};

// Export service for testing
export { HandoverService, ValidationError, BusinessLogicError, DatabaseError };